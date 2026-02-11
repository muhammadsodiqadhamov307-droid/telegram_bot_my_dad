
import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { openDb } from './database.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for audio data
app.use(express.static(path.join(__dirname, 'dist'))); // Serve frontend

// Initialize Bot
const botAccessToken = process.env.BOT_TOKEN;
if (!botAccessToken) {
    console.error("❌ CRITICAL ERROR: BOT_TOKEN is missing in .env");
    process.exit(1);
}
const bot = new Telegraf(botAccessToken);

// Initialize Gemini
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Pending Transactions Cache (userId -> { amount, description })
const pendingTransactions = new Map();

// --- Database Helpers ---
async function getUser(telegramId) {
    const db = await openDb();
    return db.get('SELECT * FROM users WHERE telegram_id = ?', telegramId);
}

async function createUser(telegramId, username) {
    const db = await openDb();
    await db.run('INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)', telegramId, username);
    return getUser(telegramId);
}

// --- Bot Commands ---
bot.start(async (ctx) => {
    const user = await createUser(ctx.from.id, ctx.from.username);
    await ctx.reply(`Salom ${ctx.from.first_name}! Men sizning shaxsiy moliya yordamchingizman. \n\n💸 Xarajat yoki daromad qo'shish uchun menga ovozli xabar yuboring.\n\n👇 Yoki quyidagi tugmalardan foydalaning:`, {
        reply_markup: {
            keyboard: [
                ['💰 Balans', '📊 Hisobotlar'],
                [{ text: "📱 Ilovani ochish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }]
            ],
            resize_keyboard: true
        }
    });
});

// Handle "💰 Balans" button
bot.hears('💰 Balans', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) return ctx.reply("Iltimos, avval /start ni bosing.");

        const income = await db.get('SELECT SUM(amount) as total FROM income WHERE user_id = ?', user.id);
        const expense = await db.get('SELECT SUM(amount) as total FROM expenses WHERE user.id = ?', user.id);

        const totalIncome = income.total || 0;
        const totalExpense = expense.total || 0;
        const balance = totalIncome - totalExpense;

        await ctx.reply(`💰 **Sizning Balansingiz:**\n\n🟢 Jami Kirim: ${totalIncome.toLocaleString()} so'm\n🔴 Jami Chiqim: ${totalExpense.toLocaleString()} so'm\n\n💵 **Hozirgi Balans: ${balance.toLocaleString()} so'm**`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        ctx.reply("Xatolik yuz berdi.");
    }
});

// Handle "📊 Hisobotlar" Menu
bot.hears('📊 Hisobotlar', async (ctx) => {
    await ctx.reply("📅 Qaysi davr uchun hisobot kerak?", {
        reply_markup: {
            keyboard: [
                ['📅 Bugun', '🗓 Shu hafta'],
                ['📆 Shu oy', '🔙 Orqaga']
            ],
            resize_keyboard: true
        }
    });
});

bot.hears('🔙 Orqaga', async (ctx) => {
    await ctx.reply("🏠 Bosh menyu:", {
        reply_markup: {
            keyboard: [
                ['💰 Balans', '📊 Hisobotlar'],
                [{ text: "📱 Ilovani ochish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }]
            ],
            resize_keyboard: true
        }
    });
});

// Report Handlers
bot.hears('📅 Bugun', (ctx) => sendReportSummary(ctx, 'today'));
bot.hears('🗓 Shu hafta', (ctx) => sendReportSummary(ctx, 'week'));
bot.hears('📆 Shu oy', (ctx) => sendReportSummary(ctx, 'month'));

async function sendReportSummary(ctx, period) {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) return ctx.reply("Iltimos, avval /start ni bosing.");

        const { rows, totalInc, totalExp, periodName } = await getReportData(db, user.id, period);

        if (rows.length === 0) {
            return ctx.reply(`⚠️ ${periodName} hisobot uchun ma'lumot topilmadi.`);
        }

        const balance = totalInc - totalExp;

        let message = `📊 **${periodName} Hisobot**\n\n`;

        // Add Details (Limited to last 20 to avoid message limit)
        const limit = 20;
        rows.slice(0, limit).forEach(row => {
            const symbol = row.type === 'income' ? '🟢' : '🔴';
            const sign = row.type === 'income' ? '+' : '-';
            message += `${symbol} ${row.description}: ${sign}${row.amount.toLocaleString()} so'm\n`;
        });

        if (rows.length > limit) {
            message += `... va yana ${rows.length - limit} ta bitim (PDF da to'liq).\n`;
        }

        message += `\n────────────────\n` +
            `🟢 Jami Kirim: +${totalInc.toLocaleString()} so'm\n` +
            `🔴 Jami Chiqim: -${totalExp.toLocaleString()} so'm\n` +
            `💵 **Balans: ${(balance > 0 ? '+' : '')}${balance.toLocaleString()} so'm**`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📥 PDF', callback_data: `download_pdf_${period}` },
                        { text: '📊 Excel', callback_data: `download_excel_${period}` }
                    ]
                ]
            }
        });

    } catch (e) {
        console.error("Summary Error:", e);
        ctx.reply("Xatolik yuz berdi.");
    }
}

bot.action(/download_pdf_(.+)/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCbQuery("📄 PDF tayyorlanmoqda...");
    await generateProfessionalPDF(ctx, period);
});

bot.action(/download_excel_(.+)/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCbQuery("📊 Excel tayyorlanmoqda...");
    await generateExcelReport(ctx, period);
});

async function generateExcelReport(ctx, period) {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        const { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance } = await getReportData(db, user.id, period);
        const balance = totalInc - totalExp;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Hisobot ${startDate}`);

        worksheet.columns = [
            { width: 15 },
            { width: 30 },
            { width: 12 },
            { width: 18 },
            { width: 18 }
        ];

        // 1. Header
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'MOLIYA HISOBOTI';
        titleCell.font = { bold: true, size: 18, color: { argb: 'FF1e40af' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } };
        worksheet.getRow(1).height = 30;

        worksheet.getCell('A2').value = 'Davr:';
        worksheet.getCell('B2').value = `${startDate} - ${endDate}`;
        worksheet.getCell('A3').value = 'Foydalanuvchi:';
        worksheet.getCell('B3').value = user.username || ctx.from.first_name;

        // Starting Balance
        worksheet.getCell('A4').value = "Boshlang'ich balans (period boshida):";
        worksheet.mergeCells('A4:C4');
        worksheet.getCell('A4').font = { bold: true };
        worksheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } };

        worksheet.mergeCells('D4:E4');
        worksheet.getCell('D4').value = `${startingBalance >= 0 ? '+' : ''}${startingBalance.toLocaleString()} so'm`;
        worksheet.getCell('D4').font = { bold: true, color: { argb: startingBalance >= 0 ? 'FF059669' : 'FFdc2626' } };
        worksheet.getCell('D4').alignment = { horizontal: 'right' };
        worksheet.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf3f4f6' } };

        // 2. Summary Cards (Shifted to Rows 6-7)
        // Income
        worksheet.mergeCells('A6:B6');
        const incLabel = worksheet.getCell('A6');
        incLabel.value = 'JAMI KIRIM';
        incLabel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        incLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };
        incLabel.alignment = { horizontal: 'center' };

        worksheet.mergeCells('A7:B7');
        const incVal = worksheet.getCell('A7');
        incVal.value = `+${totalInc.toLocaleString()} so'm`;
        incVal.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        incVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };
        incVal.alignment = { horizontal: 'center' };

        // Expense
        worksheet.mergeCells('C6:D6');
        const expLabel = worksheet.getCell('C6');
        expLabel.value = 'JAMI CHIQIM';
        expLabel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        expLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };
        expLabel.alignment = { horizontal: 'center' };

        worksheet.mergeCells('C7:D7');
        const expVal = worksheet.getCell('C7');
        expVal.value = `-${totalExp.toLocaleString()} so'm`;
        expVal.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        expVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };
        expVal.alignment = { horizontal: 'center' };

        // Balance
        worksheet.getCell('E6').value = 'BALANS';
        worksheet.getCell('E6').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getCell('E6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
        worksheet.getCell('E6').alignment = { horizontal: 'center' };

        worksheet.getCell('E7').value = `${balance >= 0 ? '+' : ''}${balance.toLocaleString()} so'm`;
        worksheet.getCell('E7').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        worksheet.getCell('E7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
        worksheet.getCell('E7').alignment = { horizontal: 'center' };

        // 3. Table Header (Row 9)
        const headerRow = worksheet.getRow(9);
        headerRow.values = ['SANA', 'TAVSIF', 'TUR', 'SUMMA', 'JORIY BALANS'];
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 25;

        // 4. Data Rows
        let currentRow = 10;
        const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let runningBalance = startingBalance;

        sortedRows.forEach((row, index) => {
            const r = worksheet.getRow(currentRow);
            const date = new Date(row.created_at);

            if (row.type === 'income') runningBalance += row.amount;
            else runningBalance -= row.amount;

            r.getCell(1).value = date.toLocaleDateString();
            r.getCell(2).value = row.description;

            const isIncome = row.type === 'income';
            r.getCell(3).value = isIncome ? 'Kirim' : 'Chiqim';
            r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isIncome ? 'FFd1fae5' : 'FFfee2e2' } };
            r.getCell(3).alignment = { horizontal: 'center' };

            r.getCell(4).value = `${isIncome ? '+' : '-'}${row.amount.toLocaleString()} so'm`;
            r.getCell(4).font = { bold: true, color: { argb: isIncome ? 'FF059669' : 'FFdc2626' } };
            r.getCell(4).alignment = { horizontal: 'right' };

            r.getCell(5).value = `${runningBalance.toLocaleString()} so'm`;
            r.getCell(5).font = { bold: true, color: { argb: runningBalance >= 0 ? 'FF000000' : 'FFdc2626' } };
            r.getCell(5).alignment = { horizontal: 'right' };

            if (index % 2 === 1) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } };

            r.eachCell({ includeEmpty: false }, (cell) => {
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            currentRow++;
        });

        // 5. Footer Totals
        currentRow += 1;
        worksheet.getCell(`D${currentRow}`).value = 'Jami Kirim:';
        worksheet.getCell(`D${currentRow}`).font = { bold: true };
        worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
        worksheet.getCell(`E${currentRow}`).value = `+${totalInc.toLocaleString()} so'm`;
        worksheet.getCell(`E${currentRow}`).font = { bold: true, color: { argb: 'FF059669' } };
        worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right' };

        currentRow++;
        worksheet.getCell(`D${currentRow}`).value = 'Jami Chiqim:';
        worksheet.getCell(`D${currentRow}`).font = { bold: true };
        worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
        worksheet.getCell(`E${currentRow}`).value = `-${totalExp.toLocaleString()} so'm`;
        worksheet.getCell(`E${currentRow}`).font = { bold: true, color: { argb: 'FFdc2626' } };
        worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right' };

        currentRow++;
        worksheet.getCell(`D${currentRow}`).value = 'YAKUNIY BALANS:';
        worksheet.getCell(`D${currentRow}`).font = { bold: true, size: 12 };
        worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
        const finalBalance = startingBalance + totalInc - totalExp;
        worksheet.getCell(`E${currentRow}`).value = `${finalBalance >= 0 ? '+' : ''}${finalBalance.toLocaleString()} so'm`;
        worksheet.getCell(`E${currentRow}`).font = { bold: true, size: 12, color: { argb: finalBalance >= 0 ? 'FF059669' : 'FFdc2626' } };
        worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right' };
        worksheet.getCell(`E${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };

        const buffer = await workbook.xlsx.writeBuffer();
        await ctx.replyWithDocument({ source: Buffer.from(buffer), filename: `Hisobot_${period}.xlsx` });

    } catch (e) {
        console.error("Excel Error:", e);
        ctx.reply("Excel yaratishda xatolik yuz berdi.");
    }
}

async function getReportData(db, userId, period) {
    let dateFilter;
    let periodName;
    let startDate;
    let endDate;
    let startQueryFilter;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (period === 'today') {
        dateFilter = `date(created_at, 'localtime') = '${todayStr}'`;
        startQueryFilter = `date(created_at, 'localtime') < '${todayStr}'`;
        periodName = "Bugungi";
        startDate = todayStr;
        endDate = todayStr;
    } else if (period === 'week') {
        const day = now.getDay() || 7;
        const weekStart = new Date(now);
        weekStart.setHours(-24 * (day - 1));
        const wYYYY = weekStart.getFullYear();
        const wMM = String(weekStart.getMonth() + 1).padStart(2, '0');
        const wDD = String(weekStart.getDate()).padStart(2, '0');
        const weekStartStr = `${wYYYY}-${wMM}-${wDD}`;

        dateFilter = `date(created_at, 'localtime') >= '${weekStartStr}'`;
        startQueryFilter = `date(created_at, 'localtime') < '${weekStartStr}'`;
        periodName = "Haftalik";
        startDate = weekStartStr;
        endDate = todayStr;
    } else if (period === 'month') {
        const monthStart = `${yyyy}-${mm}-01`;
        dateFilter = `date(created_at, 'localtime') >= '${monthStart}'`;
        startQueryFilter = `date(created_at, 'localtime') < '${monthStart}'`;
        periodName = "Oylik";
        startDate = monthStart;
        endDate = todayStr;
    }

    const query = `
        SELECT 'income' as type, amount, description, created_at FROM income 
        WHERE user_id = ? AND ${dateFilter}
        UNION ALL
        SELECT 'expense' as type, amount, description, created_at FROM expenses 
        WHERE user_id = ? AND ${dateFilter}
        ORDER BY created_at DESC
    `;

    const rows = await db.all(query, userId, userId);

    // Calculate Starting Balance
    const startIncQuery = `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND ${startQueryFilter}`;
    const startExpQuery = `SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND ${startQueryFilter}`;

    const startInc = await db.get(startIncQuery, userId);
    const startExp = await db.get(startExpQuery, userId);
    const startingBalance = (startInc.total || 0) - (startExp.total || 0);

    let totalInc = 0;
    let totalExp = 0;
    rows.forEach(r => r.type === 'income' ? totalInc += r.amount : totalExp += r.amount);

    return { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance };
}


async function generateProfessionalPDF(ctx, period) {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        const { rows, totalInc, totalExp, periodName, startDate, endDate } = await getReportData(db, user.id, period);
        const balance = totalInc - totalExp;

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
            const pdfData = Buffer.concat(buffers);
            await ctx.replyWithDocument({ source: pdfData, filename: `Hisobot_${period}.pdf` });
        });

        // --- PDF DESIGN ---

        // 1. Header
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#1e293b').text('Moliya Hisoboti', { align: 'center' });
        doc.moveDown(0.5);
        doc.strokeColor('#cbd5e1').lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);

        // 2. Summary Cards
        const cardY = doc.y;
        const cardWidth = 150;
        const cardHeight = 80;
        const cardRadius = 8;

        // Helper to draw card
        function drawCard(x, color, title, amount) {
            doc.roundedRect(x, cardY, cardWidth, cardHeight, cardRadius).fillAndStroke(color, color);
            doc.fillColor('#ffffff').fontSize(12).font('Helvetica').text(title, x, cardY + 15, { width: cardWidth, align: 'center' });
            doc.fontSize(16).font('Helvetica-Bold').text(amount, x, cardY + 35, { width: cardWidth, align: 'center' });
            doc.fontSize(10).font('Helvetica').text("so'm", x, cardY + 58, { width: cardWidth, align: 'center' });
        }

        drawCard(50, '#10b981', 'JAMI KIRIM', `+${totalInc.toLocaleString()}`);
        drawCard(222, '#ef4444', 'JAMI CHIQIM', `-${totalExp.toLocaleString()}`);
        drawCard(395, '#3b82f6', 'BALANS', `${balance >= 0 ? '+' : ''}${balance.toLocaleString()}`);

        doc.y = cardY + cardHeight + 20;

        // 3. Period & User Info
        doc.fillColor('#64748b').fontSize(11).font('Helvetica').text(`Davr: ${startDate} - ${endDate}`, 50, doc.y);
        doc.text(`Foydalanuvchi: ${user.username || ctx.from.first_name}`, 50, doc.y + 5);
        doc.moveDown(2);

        // 4. Table Header
        const tableTop = doc.y;
        doc.rect(50, tableTop, 545, 30).fillAndStroke('#334155', '#334155'); // Wider table
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold');

        doc.text('SANA', 55, tableTop + 10, { width: 70 });
        doc.text('TAVSIF', 130, tableTop + 10, { width: 170 });
        doc.text('TUR', 305, tableTop + 10, { width: 70, align: 'center' });
        doc.text('SUMMA', 380, tableTop + 10, { width: 115, align: 'right' });
        doc.text('JORIY BALANS', 500, tableTop + 10, { width: 90, align: 'right' });

        let currentY = tableTop + 30;

        // 5. Table Rows
        // Sort Chronologically for Running Balance
        const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let runningBalance = 0;

        sortedRows.forEach((row, index) => {
            if (currentY > 750) {
                doc.addPage();
                currentY = 50;
            }

            // Calculate Running Balance
            if (row.type === 'income') {
                runningBalance += row.amount;
            } else {
                runningBalance -= row.amount;
            }

            const rowColor = index % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(50, currentY, 545, 35).fillAndStroke(rowColor, '#e2e8f0');

            const date = new Date(row.created_at).toLocaleDateString();
            const isIncome = row.type === 'income';

            // Date
            doc.fillColor('#475569').fontSize(10).font('Helvetica').text(date, 55, currentY + 12, { width: 70 });

            // Description
            doc.fillColor('#0f172a').text(row.description.substring(0, 30), 130, currentY + 12, { width: 170, ellipsis: true });

            // Type Badge
            const badgeColor = isIncome ? '#10b981' : '#ef4444';
            doc.roundedRect(315, currentY + 8, 60, 20, 4).fillAndStroke(badgeColor, badgeColor);
            doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text(isIncome ? 'Kirim' : 'Chiqim', 315, currentY + 12, { width: 60, align: 'center' });

            // Amount
            const amountColor = isIncome ? '#059669' : '#dc2626';
            doc.fillColor(amountColor).fontSize(10).font('Helvetica-Bold').text(`${isIncome ? '+' : '-'}${row.amount.toLocaleString()}`, 380, currentY + 12, { width: 115, align: 'right' });

            // Running Balance
            const balanceColor = runningBalance >= 0 ? '#0f172a' : '#dc2626';
            doc.fillColor(balanceColor).fontSize(10).font('Helvetica-Bold').text(runningBalance.toLocaleString(), 500, currentY + 12, { width: 90, align: 'right' });

            currentY += 35;
        });

        // 6. Footer Summary
        doc.moveDown(2);
        if (currentY > 700) { doc.addPage(); currentY = 50; }

        const summaryY = currentY + 20;
        doc.roundedRect(50, summaryY, 545, 80, 8).fillAndStroke('#f1f5f9', '#cbd5e1'); // Wider box

        doc.fillColor('#0f172a').fontSize(11).font('Helvetica').text('Jami Kirim:', 70, summaryY + 15);
        doc.fillColor('#059669').font('Helvetica-Bold').text(`+${totalInc.toLocaleString()} so'm`, 450, summaryY + 15, { align: 'right' });

        doc.fillColor('#0f172a').font('Helvetica').text('Jami Chiqim:', 70, summaryY + 35);
        doc.fillColor('#dc2626').font('Helvetica-Bold').text(`-${totalExp.toLocaleString()} so'm`, 450, summaryY + 35, { align: 'right' });

        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(70, summaryY + 55).lineTo(570, summaryY + 55).stroke();

        doc.fillColor('#0f172a').fontSize(14).font('Helvetica-Bold').text('YAKUNIY BALANS:', 70, summaryY + 65);
        doc.fillColor(balance >= 0 ? '#059669' : '#dc2626').text(`${balance >= 0 ? '+' : ''}${balance.toLocaleString()} so'm`, 450, summaryY + 65, { align: 'right' });

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Oblique').text(`Yaratilgan: ${new Date().toLocaleString()}`, 450, summaryY + 90, { align: 'right' });

        doc.end();

    } catch (e) {
        console.error("PDF Error:", e);
        ctx.reply("PDF yaratishda xatolik yuz berdi.");
    }
}

bot.on('voice', async (ctx) => {
    try {
        const fileId = ctx.message.voice.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        const processingMsg = await ctx.reply("🤖 Ovozli xabar tahlil qilinmoqda...");

        // Download audio
        const response = await fetch(fileLink.href);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Gemini Processing
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }); // Recommended free tier model for 2026
        const prompt = `
        Analyze this voice message and extract financial transactions.
        Context: The user is speaking Uzbek.
        
        Identify multiple transactions if present.
        For each transaction determine:
        1. "type": is it "income" (kirim, oldim, tushdi, oylik) or "expense" (chiqim, ishlatdim, ketdi, harajat)?
        2. "amount": the numeric value nicely formatted (integers).
        3. "description": short summary of what it is.

        Return STRICT JSON ARRAY like this:
        [
            {"type": "income", "amount": 50000, "description": "Oylik"},
            {"type": "expense", "amount": 20000, "description": "Taksi"}
        ]
        
        If no numbers found or unclear, return: {"error": "tushunarsiz"}
        `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "audio/ogg",
                    data: buffer.toString('base64')
                }
            }
        ]);

        const text = result.response.text();
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            return ctx.reply("Uzr, tushuna olmadim. Qayta urinib ko'ring.");
        }

        if (data.error) {
            return ctx.reply("Uzr, raqamlarni ajrata olmadim. Aniqroq gapiring.");
        }

        // Handle single object return (just in case LLM forgets array)
        if (!Array.isArray(data)) {
            data = [data];
        }

        pendingTransactions.set(ctx.from.id, data);

        let msg = "📝 **Quyidagi bitimlarni tasdiqlaysizmi?**\n\n";
        data.forEach((item, index) => {
            const icon = item.type === 'income' ? '🟢' : '🔴';
            msg += `${index + 1}. ${icon} ${item.description}: ${item.amount.toLocaleString()} so'm\n`;
        });

        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);

        await ctx.reply(msg,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Tasdiqlash', 'confirm_expense'),
                Markup.button.callback('❌ Bekor qilish', 'cancel_expense')
            ])
        );

    } catch (error) {
        console.error("Voice processing error:", error);
        ctx.reply("Xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.");
    }
});

bot.action('confirm_expense', async (ctx) => {
    const userId = ctx.from.id;
    const items = pendingTransactions.get(userId);

    if (!items) {
        return ctx.reply("Sessiya eskirgan. Iltimos qaytadan yuboring.");
    }

    try {
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) await createUser(userId, ctx.from.username);
        const dbUser = await getUser(userId);

        for (const item of items) {
            const table = item.type === 'income' ? 'income' : 'expenses';
            await db.run(`INSERT INTO ${table} (user_id, amount, description) VALUES (?, ?, ?)`,
                dbUser.id, item.amount, item.description
            );
        }

        pendingTransactions.delete(userId);
        await ctx.editMessageText(`✅ **Barcha bitimlar saqlandi!**`);

    } catch (e) {
        console.error(e);
        ctx.reply("Saqlashda xatolik bo'ldi.");
    }
});

bot.action('cancel_expense', async (ctx) => {
    pendingTransactions.delete(ctx.from.id);
    await ctx.editMessageText("❌ Bekor qilindi.");
});

// --- API Endpoints for Web App ---
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const db = await openDb();
        const user = await getUser(telegramId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const income = await db.get('SELECT SUM(amount) as total FROM income WHERE user_id = ?', user.id);
        const expense = await db.get('SELECT SUM(amount) as total FROM expenses WHERE user_id = ?', user.id);
        res.json({ balance: (income.total || 0) - (expense.total || 0), totalIncome: income.total || 0, totalExpense: expense.total || 0 });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/income', async (req, res) => {
    try {
        const { telegramId, amount, description } = req.body;
        const db = await openDb();
        let user = await getUser(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found, please start bot first' });
        }
        await db.run('INSERT INTO income (user_id, amount, description) VALUES (?, ?, ?)', user.id, amount, description);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/history/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const db = await openDb();
        const user = await getUser(telegramId);
        if (!user) return res.json([]);
        const history = await db.all(`
            SELECT 'income' as type, amount, description, created_at FROM income WHERE user_id = ?
            UNION ALL
            SELECT 'expense' as type, amount, description, created_at FROM expenses WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 10
        `, user.id, user.id);
        res.json(history);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// SPA Fallback: Serve index.html for any unknown route (except /api)
app.get(/(.*)/, (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Server & Bot
(async () => {
    try {
        const db = await openDb();
        await db.migrate({ force: 'last' }).catch(async () => {
            // Basic migration workaround
            await db.exec(`
                CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id BIGINT UNIQUE, username TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE IF NOT EXISTS income (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount DECIMAL(10,2), description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id));
                CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount DECIMAL(10,2), description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id));
            `);
        });

        app.listen(port, () => console.log(`Server running on port ${port}`));
        bot.launch().then(() => console.log('Bot started')).catch((err) => console.error('Bot launch failed:', err));
    } catch (e) { console.error("Startup error:", e); }
})();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
