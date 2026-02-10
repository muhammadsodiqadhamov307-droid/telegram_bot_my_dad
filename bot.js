
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
    ctx.reply(`Salom ${ctx.from.first_name}! Men sizning shaxsiy moliya yordamchingizman. \n\n💸 Xarajat qo'shish uchun menga ovozli xabar yuboring.\n📊 Hisobot ko'rish uchun pastdagi tugmani bosing.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Ilovani ochish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }]
            ]
        }
    });
});

bot.on('voice', async (ctx) => {
    try {
        const fileId = ctx.message.voice.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);

        ctx.reply("Ovozli xabar tahlil qilinmoqda... ⏳");

        // Download audio
        const response = await fetch(fileLink.href);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Gemini Processing
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use 1.5 Flash as it is stable
        const prompt = `Ushbu ovozli xabardan xarajat ma'lumotini ajratib oling. 
        Agar xarajat bo'lsa, JSON formatida qaytaring: {"description": "...", "amount": 12345}.
        Agar tushunarsiz bo'lsa yoki xarajat bo'lmasa: {"error": "tushunarsiz"}.
        Amount raqam bo'lishi kerak. Description qisqa bo'lsin.`;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: "audio/ogg", // Telegram voice is typically ogg/opus
                    data: buffer.toString('base64')
                }
            }
        ]);

        const text = result.response.text();
        // Clean markdown code blocks if any
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(jsonStr);

        if (data.error) {
            return ctx.reply("Uzr, xarajatni tushuna olmadim. Qayta urinib ko'ring yoki qo'lda kiriting.");
        }

        // Ask for confirmation
        pendingTransactions.set(ctx.from.id, data);

        await ctx.reply(`Xarajatni tasdiqlaysizmi?\n\n📝 Tavsif: ${data.description}\n💰 Summa: ${data.amount.toLocaleString()} so'm`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ Ha', 'confirm_expense'),
                Markup.button.callback('❌ Yo\'q', 'cancel_expense')
            ])
        );

    } catch (error) {
        console.error("Voice processing error:", error);
        ctx.reply("Xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.");
    }
});

bot.action('confirm_expense', async (ctx) => {
    const userId = ctx.from.id;
    const data = pendingTransactions.get(userId);

    if (!data) {
        return ctx.reply("Sessiya eskirgan. Iltimos qaytadan yuboring.");
    }

    try {
        const db = await openDb();
        const user = await getUser(userId);
        if (!user) await createUser(userId, ctx.from.username); // Ensure user exists

        const dbUser = await getUser(userId); // Re-fetch ID

        await db.run('INSERT INTO expenses (user_id, amount, description) VALUES (?, ?, ?)',
            dbUser.id, data.amount, data.description
        );

        pendingTransactions.delete(userId);

        // Edit the message to remove buttons
        await ctx.editMessageText(`✅ Xarajat saqlandi:\n\n📝 ${data.description}\n💰 -${data.amount.toLocaleString()} so'm`);

    } catch (e) {
        console.error(e);
        ctx.reply("Saqlashda xatolik bo'ldi.");
    }
});

bot.action('cancel_expense', async (ctx) => {
    pendingTransactions.delete(ctx.from.id);
    await ctx.editMessageText("❌ Xarajat bekor qilindi.");
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
app.get('*', (req, res, next) => {
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

