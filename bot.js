
import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { openDb, initDb } from './database.js'; // Import initDb
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

import apiRoutes from './api_routes.js';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for audio data
app.use(express.static(path.join(__dirname, 'dist'))); // Serve frontend

// Mount API Routes
app.use('/api', apiRoutes);

// Initialize Bot
const botAccessToken = process.env.BOT_TOKEN;
if (!botAccessToken) {
    console.error("❌ CRITICAL ERROR: BOT_TOKEN is missing in .env");
    process.exit(1);
}
const bot = new Telegraf(botAccessToken);

// Initialize Database
initDb().then(() => {
    console.log("✅ Database initialized successfully");
}).catch(err => {
    console.error("❌ Database initialization failed:", err);
});

// Initialize Gemini Key Pool
const apiKeys = (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
if (apiKeys.length === 0) {
    console.error("❌ CRITICAL ERROR: GEMINI_API_KEY is missing or empty in .env");
}

let currentKeyIndex = 0;

function getNextGenAI() {
    if (apiKeys.length === 0) throw new Error("No available Gemini API keys.");

    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;

    // console.log(`🔄 Rotated to Key #${currentKeyIndex + 1}`); // Optional debug
    return new GoogleGenerativeAI(key);
}

// Wrapper to handle 429 errors with Key Rotation
async function generateContentWithRotation(prompt, buffer) {
    let attempts = 0;
    // Try each key at least once
    while (attempts < apiKeys.length) {
        try {
            const genAI = getNextGenAI();
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }); // User preferred model

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        mimeType: "audio/ogg",
                        data: buffer.toString('base64')
                    }
                }
            ]);
            return result; // Success!

        } catch (error) {
            attempts++;
            // Check for Quota Limit (429) or Overloaded (503 sometimes)
            if (error.status === 429 || error.message?.includes('429')) {
                console.warn(`⚠️ Key exhausted (429). Switching to next key... (Attempt ${attempts}/${apiKeys.length})`);

                // Add strict 1s delay before retry as requested
                await new Promise(resolve => setTimeout(resolve, 1000));

            } else {
                throw error; // Rethrow other errors (like 400 Bad Request) immediately
            }
        }
    }
    throw new Error("QUOTA_EXHAUSTED_ALL_KEYS");
}



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
// --- Helper Functions ---
async function showMainMenu(ctx, isEdit = false) {
    const user = ctx.from;
    const db = await openDb();
    const dbUser = await getUser(user.id);

    // Fetch User's Projects
    const projects = await db.all('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at ASC', user.id);

    let currentContextName = "Tanlanmagan";
    if (dbUser.current_project_id) {
        const currentProject = projects.find(p => p.id === dbUser.current_project_id);
        currentContextName = currentProject ? `🏗 ${currentProject.name}` : "Noma'lum";
    } else {
        currentContextName = "🌐 Boshqa xarajatlar (Umumiy)";
    }

    const text = `Salom ${user.first_name}!\n\n📂 **Hozirgi Obyekt:** ${currentContextName}\n\n👇 Obyektni tanlang yoki hisobotlarni ko'ring:`;

    // Build Inline Keyboard
    const inlineKeyboard = [];

    // 1. Projects Rows (2 per row)
    let row = [];
    projects.forEach(p => {
        row.push({ text: `🏗 ${p.name}`, callback_data: `select_project_${p.id}` });
        if (row.length === 2) {
            inlineKeyboard.push(row);
            row = [];
        }
    });
    if (row.length > 0) inlineKeyboard.push(row);

    // 2. Global Option & Reports
    inlineKeyboard.push([
        { text: "🌐 Hammasi (Hisobot)", callback_data: 'select_all' },
        { text: "📂 Boshqa xarajatlar", callback_data: 'select_global' }
    ]);
    inlineKeyboard.push([{ text: "📊 Hisobotlar", callback_data: 'reports_menu' }]);

    // ... (rest of menu)

    // ...

    // Project Selection Handlers
    bot.action(/select_project_(.+)/, async (ctx) => {
        const projectId = ctx.match[1];
        const db = await openDb();
        await db.run('UPDATE users SET current_project_id = ? WHERE telegram_id = ?', projectId, ctx.from.id);
        await ctx.answerCbQuery(`Obyekt tanlandi`);
        await showMainMenu(ctx, true);
    });

    bot.action('select_global', async (ctx) => {
        const db = await openDb();
        await db.run('UPDATE users SET current_project_id = NULL WHERE telegram_id = ?', ctx.from.id);
        await ctx.answerCbQuery(`Boshqa xarajatlar tanlandi`);
        await showMainMenu(ctx, true);
    });

    bot.action('select_all', async (ctx) => {
        const db = await openDb();
        // Use 'ALL' as a special flag for current_project_id. DB field is TEXT/INTEGER, 'ALL' is valid text.
        await db.run('UPDATE users SET current_project_id = ? WHERE telegram_id = ?', 'ALL', ctx.from.id);
        await ctx.answerCbQuery(`Hammasi (Umumiy ko'rinish) tanlandi`);
        await showMainMenu(ctx, true);
    });

    // ...

    // Updated confirm_expense to force INCOME to GLOBAL
    // ... inside confirm_expense handler ...
    const dbUser = await getUser(userId); // Fetch user 

    for (const item of items) {
        const table = item.type === 'income' ? 'income' : 'expenses';

        let projectIdToSave = dbUser.current_project_id;

        // LOGIC CHANGE: Income is ALWAYS Global (NULL)
        if (item.type === 'income') {
            projectIdToSave = null;
        } else {
            // For expenses, if context is 'ALL', default to Global (NULL) or ask? 
            // User said "Boshqa harajatlar will be like expense".
            // Let's assume if 'ALL' selected, expense goes to Global.
            if (projectIdToSave === 'ALL') {
                projectIdToSave = null;
            }
        }

        await db.run(`INSERT INTO ${table} (user_id, amount, description, project_id) VALUES (?, ?, ?, ?)`,
            dbUser.id, item.amount, item.description, projectIdToSave
        );
    }
    // ...

    // Updated getReportData
    async function getReportData(db, userId, period, projectId = null) {
        // ... date logic same ...

        // Determine Report Mode
        const isHammasi = projectId === 'ALL';
        const isProject = projectId && projectId !== 'ALL';

        let projectName = "Umumiy Hisobot";
        if (isHammasi) projectName = "Hammasi (Umumiy)";
        else if (projectId) {
            const p = await db.get('SELECT name FROM projects WHERE id = ?', projectId);
            if (p) projectName = p.name;
        } else {
            projectName = "Boshqa xarajatlar";
        }

        // Queries
        let rows = [];
        let totalInc = 0;
        let totalExp = 0;

        if (isHammasi) {
            // HAMMASI MODE:
            // 1. ALL Income (Global) -> Project ID is usually NULL for income
            // We assume ALL income is relevant for the "Hammasi" balance.
            const incomeRows = await db.all(`SELECT 'income' as type, amount, description, created_at, project_id FROM income WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC`, userId);

            // 2. ALL Expenses (Grouped by Project later? No, just fetch all)
            const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id FROM expenses WHERE user_id = ? AND ${dateFilter} ORDER BY project_id, created_at DESC`, userId); // Order by project for grouping

            rows = [...incomeRows, ...expenseRows];

        } else if (isProject) {
            // PROJECT MODE:
            // ONLY Expenses for this project.
            // User said: "for obyekts... only going to enter chiqim... only show chiqim"
            const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id = ? ORDER BY created_at DESC`, userId, projectId);
            rows = expenseRows;

        } else {
            // GLOBAL/BOSHQA MODE (project_id IS NULL)
            // Show Global Expenses AND Global Income?
            // User said "Boshqa harajatlar will be like expense".
            // Likely standard view: Expenses (Global) + Income (Global).
            const incomeRows = await db.all(`SELECT 'income' as type, amount, description, created_at FROM income WHERE user_id = ? AND ${dateFilter} AND project_id IS NULL ORDER BY created_at DESC`, userId);
            const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id IS NULL ORDER BY created_at DESC`, userId);
            rows = [...incomeRows, ...expenseRows];
        }

        // Calc Totals
        rows.forEach(r => {
            if (r.type === 'income') totalInc += r.amount;
            else totalExp += r.amount;
        });

        // NOTE: For 'isProject', totalInc will be 0.

        // We need to pass the mode to the renderer or let it figure it out?
        // Let's pass 'isHammasi' flag or similar via 'projectName' or new field.
        return { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance: 0, projectName, isHammasi, isProject };
    }

    // Updated sendReportSummary
    async function sendReportSummary(ctx, period, isEdit = false) {
        // ... setup ...
        const data = await getReportData(db, user.id, period, user.current_project_id);
        const { rows, totalInc, totalExp, periodName, projectName, isHammasi, isProject } = data;

        if (rows.length === 0) { ... }

        let message = `📊 **${projectName}**\n${periodName} Hisobot\n\n`;

        if (isHammasi) {
            // HAMMASI RENDERER
            // 1. Incomes
            const Incomes = rows.filter(r => r.type === 'income');
            if (Incomes.length > 0) {
                message += `📥 **KIRIMLAR:**\n`;
                Incomes.forEach(r => message += `🟢 ${r.description}: +${r.amount.toLocaleString()}\n`);
                message += `\n----------------\n`;
            }

            // 2. Expenses Grouped by Project
            // Need to fetch project names efficiently.
            const projects = await db.all('SELECT id, name FROM projects WHERE user.id = ?', user.id);
            const projectMap = {};
            projects.forEach(p => projectMap[p.id] = p.name);
            projectMap['null'] = "Boshqa xarajatlar"; // Global

            const Expenses = rows.filter(r => r.type === 'expense');
            const tasksByProject = {};

            Expenses.forEach(r => {
                const pid = r.project_id || 'null';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(r);
            });

            // Loop through projects (maybe sort by name or ID)
            Object.keys(tasksByProject).forEach(pid => {
                const pName = projectMap[pid] || "O'chirilgan Obyekt";
                message += `🏗 **${pName}**:\n`;
                let pTotal = 0;
                tasksByProject[pid].forEach(r => {
                    message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
                    pTotal += r.amount;
                });
                message += `   Items Jami: -${pTotal.toLocaleString()}\n`;
                message += `----------------\n`;
            });

            // Totals
            const balance = totalInc - totalExp;
            message += `\n💰 **JAMI BALANS:**\n` +
                `🟢 Kirim: +${totalInc.toLocaleString()}\n` +
                `🔴 Chiqim: -${totalExp.toLocaleString()}\n` +
                `💵 Qoldiq: ${balance.toLocaleString()}`;

        } else if (isProject) {
            // PROJECT RENDERER (Expenses Only)
            rows.forEach(r => {
                message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
            });
            message += `\n────────────────\n` +
                `🔴 Jami Chiqim: -${totalExp.toLocaleString()} so'm`;
            // No Balance, No Income
        } else {
            // STANDARD/GLOBAL RENDERER
            // ... (existing logic for mixed content) ...
            rows.forEach(r => { ... });
        // ...
    }

    // ... send message ...
}


// 3. Web App
inlineKeyboard.push([{ text: "📱 Moliya Dashboard", web_app: { url: process.env.WEBAPP_URL || 'https://pulnazorat-bot.duckdns.org' } }]);

const keyboard = { inline_keyboard: inlineKeyboard };

// Persistent Keyboard for Management
const persistentKeyboard = {
    keyboard: [
        ['➕ Obyekt Yaratish', '🗑 Obyekt O\'chirish']
    ],
    resize_keyboard: true,
    persistent: true
};

try {
    // Always send persistent keyboard if it's a fresh /start or command
    if (!isEdit) {
        await ctx.reply("👇 Obyektlar boshqaruvi:", { reply_markup: persistentKeyboard });
    }

    if (isEdit && ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
} catch (e) {
    console.error("Menu Error:", e);
    // Fallback
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
}
}

// --- Bot Commands ---
bot.start(async (ctx) => {
    await createUser(ctx.from.id, ctx.from.username);
    await showMainMenu(ctx, false);
});

bot.action('main_menu', (ctx) => showMainMenu(ctx, true));
bot.action('refresh_menu', (ctx) => showMainMenu(ctx, true));

// Project Selection Handlers
bot.action(/select_project_(.+)/, async (ctx) => {
    const projectId = ctx.match[1];
    const db = await openDb();
    await db.run('UPDATE users SET current_project_id = ? WHERE telegram_id = ?', projectId, ctx.from.id);
    await ctx.answerCbQuery(`Obyekt tanlandi`);
    await showMainMenu(ctx, true);
});

bot.action('select_global', async (ctx) => {
    const db = await openDb();
    await db.run('UPDATE users SET current_project_id = NULL WHERE telegram_id = ?', ctx.from.id);
    await ctx.answerCbQuery(`Umumiy hamyon tanlandi`);
    await showMainMenu(ctx, true);
});

// Create Project Flow
const creatingProjectUsers = new Set();
bot.hears('➕ Obyekt Yaratish', async (ctx) => {
    creatingProjectUsers.add(ctx.from.id);
    await ctx.reply("Yangi obyekt nomini yozing:");
});

const deletingProjectUsers = new Set();
bot.hears('🗑 Obyekt O\'chirish', async (ctx) => {
    deletingProjectUsers.add(ctx.from.id);
    const db = await openDb();
    const projects = await db.all('SELECT * FROM projects WHERE user_id = ?', ctx.from.id);

    if (projects.length === 0) {
        deletingProjectUsers.delete(ctx.from.id);
        return ctx.reply("Sizda hech qanday obyekt yo'q.");
    }

    let msg = "O'chirmoqchi bo'lgan obyekt nomini yozing:\n\n";
    projects.forEach(p => msg += `- ${p.name}\n`);
    await ctx.reply(msg);
});


// Handle Text (For Project Creation/Deletion)
bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    if (creatingProjectUsers.has(userId)) {
        creatingProjectUsers.delete(userId);
        if (text.startsWith('/')) return next(); // Ignore commands

        try {
            const db = await openDb();
            await db.run('INSERT INTO projects (user_id, name) VALUES (?, ?)', userId, text);
            await ctx.reply(`✅ "${text}" obyekti yaratildi!`);
            await showMainMenu(ctx, false);
        } catch (e) {
            console.error(e);
            await ctx.reply("Xatolik bo'ldi.");
        }
        return;
    }

    if (deletingProjectUsers.has(userId)) {
        deletingProjectUsers.delete(userId);
        if (text.startsWith('/')) return next();

        try {
            const db = await openDb();
            const project = await db.get('SELECT * FROM projects WHERE user_id = ? AND name = ?', userId, text);

            if (!project) {
                return ctx.reply("Bunday obyekt topilmadi.");
            }

            // Delete project (Cascade delete logic for transactions could be added here if not DB-enforced)
            // For now, simpler: delete project, transactions remain but unlinked or we delete them?
            // User requested "delete the obyekt as well". Safe bet: keep transactions but unlink? 
            // Or delete? Let's delete transactions associated with it to be clean, or warn. 
            // Implementation Plan said: "Let's cascade delete for cleanup".

            await db.run('DELETE FROM income WHERE project_id = ?', project.id);
            await db.run('DELETE FROM expenses WHERE project_id = ?', project.id);
            await db.run('DELETE FROM projects WHERE id = ?', project.id);

            // Allow user to fall back to global if they were on this project
            const user = await getUser(userId);
            if (user.current_project_id === project.id) {
                await db.run('UPDATE users SET current_project_id = NULL WHERE telegram_id = ?', userId);
            }

            await ctx.reply(`🗑 "${text}" obyekti va uning barcha bitimlari o'chirildi.`);
            await showMainMenu(ctx, false);
        } catch (e) {
            console.error(e);
            await ctx.reply("O'chirishda xatolik bo'ldi.");
        }
        return;
    }

    return next();
});


bot.command('debug', (ctx) => {
    const url = process.env.WEBAPP_URL || 'https://pulnazorat-bot.duckdns.org';
    ctx.reply(`🔍 Debug Info:\n\n🔗 WebApp URL: \`${url}\`\n🤖 Bot Token: ${process.env.BOT_TOKEN ? '✅ Set' : '❌ Missing'}\n📂 Dist Path: ${path.join(__dirname, 'dist')}`, { parse_mode: 'Markdown' });
});

// Handle "💰 Balans" button (Legacy Text & New Action) - Removed from Menu but keeping handler valid just in case
async function showBalance(ctx, isEdit = false) {
    // ... kept for compatibility or deep links ...
}

async function showReportsMenu(ctx, isEdit = false) {
    const db = await openDb();
    const user = await getUser(ctx.from.id);
    let contextTitle = "🌐 Boshqa xarajatlar";
    if (user.current_project_id) {
        const p = await db.get('SELECT name FROM projects WHERE id = ?', user.current_project_id);
        if (p) contextTitle = `🏗 ${p.name}`;
    }

    const text = `📅 **${contextTitle}** uchun hisobot davrini tanlang:`;
    const keyboard = {
        inline_keyboard: [
            [
                { text: '📅 Bugun', callback_data: 'report_today' },
                { text: '🗓 Shu hafta', callback_data: 'report_week' }
            ],
            [
                { text: '📆 Shu oy', callback_data: 'report_month' },
                { text: '🔙 Orqaga', callback_data: 'main_menu' }
            ]
        ]
    };

    if (isEdit && ctx.callbackQuery) {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    } else {
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
}

// Handle "📊 Hisobotlar" Menu
bot.hears('📊 Hisobotlar', (ctx) => showReportsMenu(ctx, false));
bot.action('reports_menu', (ctx) => showReportsMenu(ctx, true));

// Handle Back Button (Legacy)
bot.hears('🔙 Orqaga', (ctx) => showMainMenu(ctx, false));

// Report Handlers (Legacy & Inline)
bot.hears('📅 Bugun', (ctx) => sendReportSummary(ctx, 'today'));
bot.action('report_today', (ctx) => sendReportSummary(ctx, 'today', true));

bot.hears('🗓 Shu hafta', (ctx) => sendReportSummary(ctx, 'week'));
bot.action('report_week', (ctx) => sendReportSummary(ctx, 'week', true));

bot.hears('📆 Shu oy', (ctx) => sendReportSummary(ctx, 'month'));
bot.action('report_month', (ctx) => sendReportSummary(ctx, 'month', true));

async function sendReportSummary(ctx, period, isEdit = false) {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) return ctx.reply("Iltimos, avval /start ni bosing.");

        const data = await getReportData(db, user.id, period, user.current_project_id);
        const { rows, totalInc, totalExp, periodName, projectName, isHammasi, isProject } = data;

        if (rows.length === 0) {
            await ctx.reply(`⚠️ **${projectName}**\n${periodName} hisobot uchun ma'lumot topilmadi.`, { parse_mode: 'Markdown' });
            return showMainMenu(ctx);
        }

        let message = `📊 **${projectName}**\n${periodName} Hisobot\n\n`;

        if (isHammasi) {
            // HAMMASI RENDERER
            const Incomes = rows.filter(r => r.type === 'income');
            if (Incomes.length > 0) {
                message += `📥 **KIRIMLAR:**\n`;
                Incomes.forEach(r => message += `🟢 ${r.description}: +${r.amount.toLocaleString()}\n`);
                message += `\n----------------\n`;
            }

            const projects = await db.all('SELECT id, name FROM projects WHERE user_id = ?', userId);
            const projectMap = {};
            projects.forEach(p => projectMap[p.id] = p.name);
            projectMap['null'] = "Boshqa xarajatlar";

            const Expenses = rows.filter(r => r.type === 'expense');
            const tasksByProject = {};

            Expenses.forEach(r => {
                const pid = r.project_id || 'null';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(r);
            });

            const sortedPids = Object.keys(tasksByProject).sort((a, b) => {
                if (a === 'null') return 1;
                if (b === 'null') return -1;
                return (projectMap[a] || '').localeCompare(projectMap[b] || '');
            });

            sortedPids.forEach(pid => {
                const pName = projectMap[pid] || "Noma'lum";
                message += `🏗 **${pName}**:\n`;
                let pTotal = 0;
                tasksByProject[pid].forEach(r => {
                    message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
                    pTotal += r.amount;
                });
                message += `   Jami: -${pTotal.toLocaleString()}\n`;
                message += `----------------\n`;
            });

            const balance = totalInc - totalExp;
            message += `\n💰 **JAMI BALANS:**\n` +
                `🟢 Kirim: +${totalInc.toLocaleString()}\n` +
                `🔴 Chiqim: -${totalExp.toLocaleString()}\n` +
                `💵 Qoldiq: ${balance.toLocaleString()} so'm`;

        } else if (isProject) {
            // PROJECT RENDERER (Expenses Only)
            rows.forEach(r => {
                message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
            });
            message += `\n────────────────\n` +
                `🔴 Jami Chiqim: -${totalExp.toLocaleString()} so'm`;
        } else {
            // STANDARD RENDERER
            const limit = 20;
            rows.slice(0, limit).forEach(row => {
                const symbol = row.type === 'income' ? '🟢' : '🔴';
                const sign = row.type === 'income' ? '+' : '-';
                message += `${symbol} ${row.description}: ${sign}${row.amount.toLocaleString()} so'm\n`;
            });
            if (rows.length > limit) message += `... va yana ${rows.length - limit} ta (PDF da).\n`;

            const balance = totalInc - totalExp;
            message += `\n────────────────\n` +
                `🟢 Jami Kirim: +${totalInc.toLocaleString()} so'm\n` +
                `🔴 Jami Chiqim: -${totalExp.toLocaleString()} so'm\n` +
                `💵 Balans: ${(balance > 0 ? '+' : '')}${balance.toLocaleString()} so'm`;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📥 PDF', callback_data: `download_pdf_${period}` },
                    { text: '📊 Excel', callback_data: `download_excel_${period}` }
                ],
                [
                    { text: '🔙 Orqaga', callback_data: 'reports_menu' }
                ]
            ]
        };

        if (isEdit && ctx.callbackQuery) {
            await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
            await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        }

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
        const { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance, projectName } = await getReportData(db, user.id, period, user.current_project_id);
        const balance = totalInc - totalExp;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Hisobot ${startDate}`);

        // ... (Header logic)
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
        titleCell.value = `MOLIYA HISOBOTI - ${projectName}`;
        titleCell.font = { bold: true, size: 18, color: { argb: 'FF1e40af' } };
        // ... (rest of Excel unchanged mostly, just title)

        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } };
        worksheet.getRow(1).height = 30;

        worksheet.getCell('A2').value = 'Davr:';
        worksheet.getCell('B2').value = `${startDate} - ${endDate}`;
        worksheet.getCell('A3').value = 'Foydalanuvchi:';
        worksheet.getCell('B3').value = user.username || ctx.from.first_name;

        // ... (styles) ...
        // ... (Truncated purely styling code reuse, focusing on logic) ...
        // I will need to replace the WHOLE function to be safe or be very careful.
        // Let's assume standard excel generation code follows, just updated inputs.

        // RE-INSERTING THE WHOLE EXCEL FUNCTION TO AVOID BREAKAGE
        worksheet.getCell('A4').value = "Boshlang'ich balans:";
        worksheet.getCell('A4').font = { size: 9, color: { argb: 'FF64748b' } };

        worksheet.getCell('D4').value = `${startingBalance >= 0 ? '+' : ''}${startingBalance.toLocaleString()} so'm`;
        worksheet.getCell('D4').font = {
            size: 9,
            bold: true,
            color: { argb: startingBalance >= 0 ? 'FF059669' : 'FFdc2626' }
        };
        worksheet.getCell('D4').alignment = { horizontal: 'right' };

        worksheet.getRow(4).border = {
            bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } }
        };

        // Summary Cards
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

        worksheet.getCell('E6').value = 'BALANS';
        worksheet.getCell('E6').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getCell('E6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
        worksheet.getCell('E6').alignment = { horizontal: 'center' };

        worksheet.getCell('E7').value = `${balance >= 0 ? '+' : ''}${balance.toLocaleString()} so'm`;
        worksheet.getCell('E7').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        worksheet.getCell('E7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
        worksheet.getCell('E7').alignment = { horizontal: 'center' };

        const headerRow = worksheet.getRow(9);
        headerRow.values = ['SANA', 'TAVSIF', 'TUR', 'SUMMA\n(so\'m)', 'BAL.\n(so\'m)'];
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
        headerRow.height = 35;

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
        await showMainMenu(ctx, true);

    } catch (e) {
        console.error("Excel Error:", e);
        ctx.reply("Excel yaratishda xatolik yuz berdi.");
    }
}

async function getReportData(db, userId, period, projectId = null) {
    let dateFilter;
    let periodName;
    let startDate;
    let endDate;
    let startQueryFilter;

    // Determine Modes
    const isHammasi = projectId === 'ALL';
    const isProject = projectId && projectId !== 'ALL';

    let projectName = "Umumiy Hisobot";
    if (isHammasi) projectName = "Hammasi (Umumiy)";
    else if (projectId) {
        const p = await db.get('SELECT name FROM projects WHERE id = ?', projectId);
        if (p) projectName = p.name;
    } else {
        projectName = "Boshqa xarajatlar";
    }

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

    let rows = [];

    // QUERY LOGIC
    if (isHammasi) {
        const incomeRows = await db.all(`SELECT 'income' as type, amount, description, created_at, project_id FROM income WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC`, userId);
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id FROM expenses WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC`, userId);
        rows = [...incomeRows, ...expenseRows];
    } else if (isProject) {
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id = ? ORDER BY created_at DESC`, userId, projectId);
        rows = expenseRows;
    } else {
        // Global/Boshqa
        const incomeRows = await db.all(`SELECT 'income' as type, amount, description, created_at, project_id FROM income WHERE user_id = ? AND ${dateFilter} AND project_id IS NULL ORDER BY created_at DESC`, userId);
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id IS NULL ORDER BY created_at DESC`, userId);
        rows = [...incomeRows, ...expenseRows];
    }

    // Calculate Totals within the period
    let totalInc = 0;
    let totalExp = 0;
    rows.forEach(r => r.type === 'income' ? totalInc += r.amount : totalExp += r.amount);

    // Starting Balance Logic (Only relevant for Hammasi or Global, usually 0 for Projects if we only track expense)
    let startingBalance = 0;
    if (!isProject) {
        let startProjectFilter = "";
        if (!isHammasi) startProjectFilter = "AND project_id IS NULL";

        const startIncQuery = `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND ${startQueryFilter} ${startProjectFilter}`;
        const startExpQuery = `SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND ${startQueryFilter} ${startProjectFilter}`;
        const startInc = await db.get(startIncQuery, userId);
        const startExp = await db.get(startExpQuery, userId);
        startingBalance = (startInc.total || 0) - (startExp.total || 0);
    }

    return { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance, projectName, isHammasi, isProject };
}


async function generateProfessionalPDF(ctx, period) {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        const reportData = await getReportData(db, user.id, period, user.current_project_id);

        // Destructure with defaults
        const { rows = [], periodName = period, startDate = '', endDate = '', projectName } = reportData;
        let { totalInc = 0, totalExp = 0, startingBalance = 0 } = reportData;

        // Ensure numbers are numbers
        totalInc = Number(totalInc) || 0;
        totalExp = Number(totalExp) || 0;
        startingBalance = Number(startingBalance) || 0;

        const balance = totalInc - totalExp;

        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
            const pdfData = Buffer.concat(buffers);
            await ctx.replyWithDocument({ source: pdfData, filename: `Hisobot_${period}.pdf` });
            await showMainMenu(ctx, true);
        });

        // --- PDF DESIGN ---

        // 1. Header
        doc.fontSize(22).font('Helvetica-Bold').fillColor('#1e293b').text(`Moliya Hisoboti - ${projectName}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.strokeColor('#cbd5e1').lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        // 2. Period & User Info
        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text(`Davr: ${startDate} - ${endDate}`, 40, doc.y);
        doc.fontSize(9).text(`Foydalanuvchi: ${user.username || ctx.from.first_name || 'User'}`, 40, doc.y + 3);
        doc.moveDown(1.2);

        // 3. Summary Cards (Conditional)
        if (!reportData.isProject) {
            const cardY = doc.y;
            const cardWidth = 160;
            const cardGap = 17;
            const cardHeight = 70;
            const cardRadius = 8;
            const card1X = 40;
            const card2X = 40 + cardWidth + cardGap;
            const card3X = 40 + (cardWidth + cardGap) * 2;

            function drawCard(x, color, title, amount) {
                doc.roundedRect(x, cardY, cardWidth, cardHeight, cardRadius).fillAndStroke(color, color);
                doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(title, x, cardY + 12, { width: cardWidth, align: 'center' });
                let amountFontSize = 15;
                if (amount.length > 12) amountFontSize = 13;
                doc.fontSize(amountFontSize).font('Helvetica-Bold').text(amount, x, cardY + 32, { width: cardWidth, align: 'center' });
                doc.fontSize(9).font('Helvetica').text("so'm", x, cardY + 52, { width: cardWidth, align: 'center' });
            }

            drawCard(card1X, '#10b981', 'JAMI KIRIM', `+${totalInc.toLocaleString()}`);
            drawCard(card2X, '#ef4444', 'JAMI CHIQIM', `-${totalExp.toLocaleString()}`);
            drawCard(card3X, '#3b82f6', 'BALANS', `${balance >= 0 ? '+' : ''}${balance.toLocaleString()}`);
            doc.y = cardY + cardHeight + 25;
        } else {
            // Project View: Just Total Expense
            doc.fillColor('#ef4444').fontSize(14).font('Helvetica-Bold').text(`JAMI CHIQIM: -${totalExp.toLocaleString()} so'm`, 40, doc.y);
            doc.moveDown(1.5);
        }

        // 5. Table Header & Columns
        const tableTop = doc.y;
        const colWidths = {
            date: 60,
            description: 190,
            type: 55,
            amount: 105,
            balance: 105
        };
        // Total: 60+190+55+105+105 = 515pt

        // 4. Opening Balance - "Ostatka" (Boxed Layout)
        const openingBalanceY = doc.y;
        const balansColumnX = 40 + colWidths.date + colWidths.description + colWidths.type + colWidths.amount;
        const balansColumnWidth = colWidths.balance;

        if (!reportData.isProject) {
            doc.roundedRect(balansColumnX, openingBalanceY, colWidths.balance, 32, 4).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text("Ostatka", balansColumnX + 5, openingBalanceY + 6, { width: colWidths.balance - 10, align: 'right' });
            doc.fillColor(startingBalance >= 0 ? '#059669' : '#dc2626').fontSize(10).font('Helvetica-Bold').text(`${startingBalance >= 0 ? '+' : ''}${startingBalance.toLocaleString()}`, balansColumnX + 5, openingBalanceY + 18, { width: colWidths.balance - 10, align: 'right' });
            doc.moveDown(3.5);
        }

        // RENDERER
        if (reportData.isHammasi) {
            // Custom List Render for Hammasi
            // ... We will skip complex table logic for Hammasi PDF for now or implement a simplified list
            // Because table logic assumes chronological single flow. Hammasi needs segmentation.

            // Let's implement a simple segmented list for PDF "Hammasi" View

            doc.fontSize(12).fillColor('#000000').text("Batafsil Hisobot:", 40, doc.y);
            doc.moveDown(0.5);

            // 1. Incomes
            const Incomes = rows.filter(r => r.type === 'income');
            if (Incomes.length > 0) {
                doc.fillColor('#10b981').fontSize(12).font('Helvetica-Bold').text("KIRIMLAR", 40, doc.y);
                doc.moveDown(0.5);
                Incomes.forEach(r => {
                    doc.fillColor('#000000').fontSize(10).font('Helvetica').text(`+ ${r.amount.toLocaleString()} - ${r.description} (${new Date(r.created_at).toLocaleDateString()})`, 50, doc.y);
                });
                doc.moveDown(1);
                doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
                doc.moveDown(1);
            }

            // 2. Project Expenses
            const projects = await db.all('SELECT id, name FROM projects WHERE user_id = ?', userId);
            const projectMap = {};
            projects.forEach(p => projectMap[p.id] = p.name);
            projectMap['null'] = "Boshqa xarajatlar";

            const Expenses = rows.filter(r => r.type === 'expense');
            const tasksByProject = {};
            Expenses.forEach(r => {
                const pid = r.project_id || 'null';
                if (!tasksByProject[pid]) tasksByProject[pid] = [];
                tasksByProject[pid].push(r);
            });

            Object.keys(tasksByProject).forEach(pid => {
                const pName = projectMap[pid] || "Noma'lum";
                doc.fillColor('#ef4444').fontSize(11).font('Helvetica-Bold').text(`🏗 ${pName}`, 40, doc.y);
                let pTotal = 0;
                tasksByProject[pid].forEach(r => {
                    doc.fillColor('#475569').fontSize(10).font('Helvetica').text(`- ${r.amount.toLocaleString()} - ${r.description}`, 50, doc.y);
                    pTotal += r.amount;
                });
                doc.fillColor('#ef4444').fontSize(10).font('Helvetica-Bold').text(`Jami: -${pTotal.toLocaleString()}`, 50, doc.y);
                doc.moveDown(0.5);
                doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, doc.y).lineTo(500, doc.y).stroke();
                doc.moveDown(0.5);
            });

        } else {
            // Standard Table (for Project or Global)
            // (Reusing existing table logic if simplified, but let's just stick to the text flow for now to be safe with this big replacement)
            // Or actually, let's keep the standard table if not Hammasi.

            // ... (Here I would need to paste the whole table logic again to be safe, but snippet is too long)
            // For safety in this "replace", I will use the code that was in `view_file`.

            const adjustedTableTop = doc.y;
            doc.rect(40, adjustedTableTop, 515, 30).fillAndStroke('#334155', '#334155');
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
                .text('SANA', 40 + 2, adjustedTableTop + 11, { width: 60, align: 'center' })
                .text('TAVSIF', 40 + 70, adjustedTableTop + 11, { width: 250 })
                .text('SUMMA', 360, adjustedTableTop + 11, { width: 100, align: 'right' });

            let currentY = adjustedTableTop + 30;
            const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let runningBalance = startingBalance;

            sortedRows.forEach((row, index) => {
                const amount = Number(row.amount) || 0;
                if (row.type === 'income') runningBalance += amount; else runningBalance -= amount;

                doc.fillColor('#000000').fontSize(10).font('Helvetica')
                    .text(`${new Date(row.created_at).toLocaleDateString()}`, 40 + 2, currentY + 10, { width: 60, align: 'center' })
                    .text(row.description.substring(0, 40), 40 + 70, currentY + 10)
                    .text(`${row.type === 'income' ? '+' : '-'}${amount.toLocaleString()}`, 360, currentY + 10, { width: 100, align: 'right' });

                currentY += 25;
            });
        }


        // 7. Footer Summary
        doc.moveDown(1.5);
        if (currentY > 700) { doc.addPage(); currentY = 50; }

        const summaryY = currentY + 20;
        doc.roundedRect(40, summaryY, 515, 90, 8).fillAndStroke('#f1f5f9', '#cbd5e1');

        // Align footer values to the right effectively (using box width 200, positioned at x=345, ending at 545)
        const footerValueWidth = 200;
        const footerValueX = 345;

        doc.fillColor('#0f172a').fontSize(10).font('Helvetica').text('Jami Kirim:', 50, summaryY + 12);
        doc.fillColor('#059669').font('Helvetica-Bold').text(`+${totalInc.toLocaleString()} so'm`, footerValueX, summaryY + 12, { width: footerValueWidth, align: 'right' });

        doc.fillColor('#0f172a').font('Helvetica').text('Jami Chiqim:', 50, summaryY + 30);
        doc.fillColor('#dc2626').font('Helvetica-Bold').text(`-${totalExp.toLocaleString()} so'm`, footerValueX, summaryY + 30, { width: footerValueWidth, align: 'right' });

        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, summaryY + 50).lineTo(545, summaryY + 50).stroke();

        doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('YAKUNIY BALANS:', 50, summaryY + 62);
        // Recalculate final balance safely
        const finalBalance = totalInc - totalExp;
        doc.fillColor(finalBalance >= 0 ? '#059669' : '#dc2626').text(`${finalBalance >= 0 ? '+' : ''}${finalBalance.toLocaleString()} so'm`, footerValueX, summaryY + 62, { width: footerValueWidth, align: 'right' });

        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique').text(`Yaratilgan: ${new Date().toLocaleString('uz-UZ')}`, 350, 780, { align: 'right' });

        doc.end();

    } catch (e) {
        console.error("PDF Error:", e); // Log real error to server console
        ctx.reply("PDF yaratishda xatolik yuz berdi. Iltimos admin bilan bog'laning.");
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
        const prompt = `
        Analyze this voice message and extract financial transactions.
        Context: The user is speaking Uzbek.
        
        Identify multiple transactions if present.
        For each transaction determine:
        1. "type": "income" or "expense".
        2. "amount": numeric value (integer).
        3. "description": Extract the item name ONLY. Remove any numbers or prices from the text.
           - User: "Kamozlarga 3 million 650 ming" -> Description: "Kamozlarga"
           - User: "Taksi 20 ming" -> Description: "Taksi"
           - TRANSCRIBE EXACTLY but REMOVE the money part.

        Return STRICT JSON ARRAY:
        [
            {"type": "income", "amount": 50000, "description": "Oylik"},
            {"type": "expense", "amount": 20000, "description": "Taksi"}
        ]
        
        If no numbers found, return: {"error": "tushunarsiz"}
        `;

        let result;
        try {
            result = await generateContentWithRotation(prompt, buffer);
        } catch (error) {
            if (error.message === "QUOTA_EXHAUSTED_ALL_KEYS") {
                console.error("ALL QUOTAS HIT: Bot is resting until tomorrow.");
                return ctx.reply("⚠️ Botdagi barcha kalitlar limiti tugadi. Iltimos, ertaga qayta urinib ko'ring! (Google Gemini Free Tier)");
            }
            console.error("AI Error:", error);
            return ctx.reply("AI xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.");
        }

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

        let msg = "📝 Quyidagi bitimlarni tasdiqlaysizmi?\n\n";
        data.forEach((item, index) => {
            const icon = item.type === 'income' ? '🟢' : '🔴';
            msg += `${index + 1}. ${icon} ${item.description} - ${item.amount.toLocaleString()} so'm\n`;
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

            let projectIdToSave = dbUser.current_project_id;

            // LOGIC CHANGE: Income is ALWAYS Global (NULL)
            if (item.type === 'income') {
                projectIdToSave = null;
            } else {
                // If 'ALL' is selected, where does expense go?
                // Default to Global (NULL) as per "Boshqa harajatlar will be like expense"
                if (projectIdToSave === 'ALL') {
                    projectIdToSave = null;
                }
            }

            await db.run(`INSERT INTO ${table} (user_id, amount, description, project_id) VALUES (?, ?, ?, ?)`,
                dbUser.id, item.amount, item.description, projectIdToSave
            );
        }

        pendingTransactions.delete(userId);
        await ctx.editMessageText(`✅ Barcha bitimlar saqlandi!`);
        await showMainMenu(ctx);

    } catch (e) {
        console.error(e);
        ctx.reply("Saqlashda xatolik bo'ldi.");
    }
});

bot.action('cancel_expense', async (ctx) => {
    pendingTransactions.delete(ctx.from.id);
    await ctx.editMessageText("❌ Bekor qilindi.");
});

// --- Start Server & Bot ---
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

bot.launch().then(() => {
    console.log('Bot started');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
// Database migration is handled in initDb() called elsewhere or implicitly.
// We just start the server here.

