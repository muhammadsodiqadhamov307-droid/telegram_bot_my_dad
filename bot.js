
import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai'; // CORRECT IMPORT for newer SDK
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { openDb } from './database.js';
import PDFDocument from 'pdfkit';

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
    console.error("❌ CRTICAL ERROR: BOT_TOKEN is missing in .env");
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
    ctx.reply(`Salom ${ctx.from.first_name}! Men sizning shaxsiy moliya yordamchingizman. \n\n💸 Xarajat yoki daromad qo'shish uchun menga ovozli xabar yuboring.\n\n👇 Yoki quyidagi tugmalardan foydalaning:`, {
        reply_markup: {
            keyboard: [
                ['💰 Balans', '📅 Bugungi hisobot'],
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
        const expense = await db.get('SELECT SUM(amount) as total FROM expenses WHERE user_id = ?', user.id);

        const totalIncome = income.total || 0;
        const totalExpense = expense.total || 0;
        const balance = totalIncome - totalExpense;

        ctx.reply(`💰 **Sizning Balansingiz:**\n\n🟢 Jami Kirim: ${totalIncome.toLocaleString()} so'm\n🔴 Jami Chiqim: ${totalExpense.toLocaleString()} so'm\n\n💵 **Hozirgi Balans: ${balance.toLocaleString()} so'm**`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        ctx.reply("Xatolik yuz berdi.");
    }
});

// Handle "📅 Bugungi hisobot" button
bot.hears('📅 Bugungi hisobot', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) return ctx.reply("Iltimos, avval /start ni bosing.");

        const rows = await db.all(`
            SELECT 'income' as type, amount, description, created_at FROM income 
            WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')
            UNION ALL
            SELECT 'expense' as type, amount, description, created_at FROM expenses 
            WHERE user_id = ? AND date(created_at, 'localtime') = date('now', 'localtime')
            ORDER BY created_at DESC
        `, user.id, user.id);

        if (rows.length === 0) {
            return ctx.reply("📅 Bugun hech qanday bitim amalga oshirilmadi.");
        }

        let message = "📅 **Bugungi Hisobot:**\n\n";
        let totalInc = 0;
        let totalExp = 0;

        rows.forEach(row => {
            const symbol = row.type === 'income' ? '🟢' : '🔴';
            const sign = row.type === 'income' ? '+' : '-';
            if (row.type === 'income') totalInc += row.amount;
            else totalExp += row.amount;

            message += `${symbol} ${row.description}: ${sign}${row.amount.toLocaleString()} so'm\n`;
        });

        message += `\n----------------\n🟢 Kirim: +${totalInc.toLocaleString()}\n🔴 Chiqim: -${totalExp.toLocaleString()}\n💵 Farq: ${(totalInc - totalExp).toLocaleString()}`;

        ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        ctx.reply("Xatolik yuz berdi.");
    }
});

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

// Get User Data (Balance, Income, Expense total)
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const db = await openDb();
        const user = await getUser(telegramId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        const income = await db.get('SELECT SUM(amount) as total FROM income WHERE user_id = ?', user.id);
        const expense = await db.get('SELECT SUM(amount) as total FROM expenses WHERE user_id = ?', user.id);

        const totalIncome = income.total || 0;
        const totalExpense = expense.total || 0;
        const balance = totalIncome - totalExpense;

        res.json({ balance, totalIncome, totalExpense });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add Income
app.post('/api/income', async (req, res) => {
    try {
        const { telegramId, amount, description } = req.body;
        const db = await openDb();
        let user = await getUser(telegramId);
        if (!user) {
            // In a real app, we might want to ensure creation, but here assuming user started bot
            return res.status(404).json({ error: 'User not found, please start bot first' });
        }

        await db.run('INSERT INTO income (user_id, amount, description) VALUES (?, ?, ?)', user.id, amount, description);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get History (Limit 10)
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
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Generate PDF Report
app.get('/api/report/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const db = await openDb();
        const user = await getUser(telegramId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Fetch all data for report
        const rows = await db.all(`
            SELECT 'income' as type, amount, description, created_at FROM income WHERE user_id = ?
            UNION ALL
            SELECT 'expense' as type, amount, description, created_at FROM expenses WHERE user_id = ?
            ORDER BY created_at DESC
        `, user.id, user.id);

        const doc = new PDFDocument();
        const filename = `report_${telegramId}_${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

        doc.pipe(res);

        // PDF Content
        doc.fontSize(20).text('Moliya Hisoboti', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Foydalanuvchi: ${user.username || telegramId}`);
        doc.text(`Sana: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        let totalInc = 0;
        let totalExp = 0;

        rows.forEach(row => {
            const date = new Date(row.created_at).toLocaleDateString();
            const symbol = row.type === 'income' ? '+' : '-';
            const color = row.type === 'income' ? 'green' : 'red';

            if (row.type === 'income') totalInc += row.amount;
            else totalExp += row.amount;

            doc.fillColor(color)
                .text(`${date} | ${row.description}: ${symbol}${row.amount.toLocaleString()} so'm`);
        });

        doc.moveDown();
        doc.fillColor('black').text('--------------------------------');
        doc.text(`Jami Daromad: ${totalInc.toLocaleString()} so'm`);
        doc.text(`Jami Xarajat: ${totalExp.toLocaleString()} so'm`);
        doc.text(`Balans: ${(totalInc - totalExp).toLocaleString()} so'm`, { active: true }); // Bold?

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'PDF generation failed' });
    }
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
            // Basic migration workaround if full migration fails or is not set up
            await db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id BIGINT UNIQUE,
                    username TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS income (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    amount DECIMAL(10,2),
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    amount DECIMAL(10,2),
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            `);
        });

        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });

        bot.launch().then(() => {
            console.log('Bot started');
        }).catch((err) => {
            console.error('Bot launch failed:', err);
        });
    } catch (e) {
        console.error("Startup error:", e);
    }
})();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

