
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
// Wrapper to handle 429 with STRICT Round-Robin
async function generateContentWithRotation(prompt, buffer) {
    let attempts = 0;

    // We try each key at least once
    while (attempts < apiKeys.length) {
        try {
            // ALWAYS get a fresh key for every attempt/request
            const genAI = getNextGenAI();
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            const generatePromise = model.generateContent([
                prompt,
                {
                    inlineData: {
                        mimeType: "audio/ogg",
                        data: buffer.toString('base64')
                    }
                }
            ]);

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), 45000)
            );

            const result = await Promise.race([generatePromise, timeoutPromise]);
            return result; // Success!

        } catch (error) {
            attempts++;
            // Check for Quota Limit (429) or Overloaded (503)
            if (error.status === 429 || error.message?.includes('429')) {
                console.warn(`⚠️ Key exhausted (429). Switching to next key... (Attempt ${attempts}/${apiKeys.length})`);
                // Wait briefly before retry to prevent rapid-fire failures
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                throw error; // Rethrow heavily corrupted errors immediately
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
    // Default status is 'pending' for new users
    await db.run('INSERT OR IGNORE INTO users (telegram_id, username, status) VALUES (?, ?, ?)', telegramId, username, 'pending');
    return getUser(telegramId);
}

async function checkUserApproval(ctx) {
    let user = await getUser(ctx.from.id);

    // IF user doesn't exist (e.g. sent voice before /start), create them as PENDING
    if (!user) {
        user = await createUser(ctx.from.id, ctx.from.username);
        // We should also notify admin here, similar to /start
        const adminId = process.env.ADMIN_ID;
        if (adminId) {
            // Escape HTML special chars function
            const escapeHtml = (text) => text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

            await ctx.telegram.sendMessage(adminId,
                `🆕 <b>Yangi Foydalanuvchi (Avto)!</b>\n\n👤 Ism: ${escapeHtml(ctx.from.first_name)}\n🆔 ID: <code>${ctx.from.id}</code>\n🔗 Username: @${escapeHtml(ctx.from.username) || 'Yo\'q'}`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Ruxsat berish", callback_data: `admin_approve_${ctx.from.id}` },
                                { text: "❌ Rad etish", callback_data: `admin_reject_${ctx.from.id}` }
                            ]
                        ]
                    }
                }
            ).catch(e => console.error("Admin notify error:", e));
        }
    }

    if (user.status === 'approved') return true;

    // Debug Log
    console.log(`Checking Admin Approval: Env AdminID: '${process.env.ADMIN_ID}', UserID: '${ctx.from.id}'`);

    // FIX: If this is the ADMIN, and they are stuck in pending (e.g. notification failed), auto-approve them.
    if (process.env.ADMIN_ID && String(process.env.ADMIN_ID).trim() === String(ctx.from.id).trim()) {
        const db = await openDb();
        await db.run("UPDATE users SET status = 'approved' WHERE telegram_id = ?", ctx.from.id);
        await ctx.reply("👑 Admin aniqlandi. Siz avtomatik tasdiqlandingiz.");
        return true;
    }

    if (user.status === 'rejected') {
        await ctx.reply("❌ Sizning so'rovingiz rad etilgan. Botdan foydalana olmaysiz.");
        return false;
    }

    // Pending
    const adminUsername = process.env.ADMIN_USERNAME ? `@${process.env.ADMIN_USERNAME}` : "Admin";
    await ctx.reply(`⏳ Admin tasdig'i kutilmoqda...\n\nAgar holat o'zgarmasa, iltimos ${adminUsername} bilan bog'laning.`);
    return false;
}

async function ensureSalaryCategory(userId) {
    const db = await openDb();
    let cat = await db.get("SELECT * FROM categories WHERE user_id = ? AND name = 'Ustalar oyligi'", userId);
    if (!cat) {
        await db.run("INSERT INTO categories (user_id, name, type, icon, color, is_default) VALUES (?, 'Ustalar oyligi', 'expense', '👷', '#f59e0b', 1)", userId);
        cat = await db.get("SELECT * FROM categories WHERE user_id = ? AND name = 'Ustalar oyligi'", userId);
    }
    return cat;
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
        if (dbUser.current_project_id === 'ALL') {
            currentContextName = "🌐 Hammasi (Umumiy)";
        } else {
            const currentProject = projects.find(p => p.id === dbUser.current_project_id);
            currentContextName = currentProject ? `🏗 ${currentProject.name}` : "Noma'lum";
        }
    } else {
        currentContextName = "📂 Boshqa xarajatlar";
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

    // Show 'Ustalar Oyligi' in Inline Menu if a project is selected
    if (dbUser.current_project_id && dbUser.current_project_id !== 'ALL') {
        const p = projects.find(prj => prj.id === dbUser.current_project_id);
        if (p) {
            inlineKeyboard.push([{ text: "👷 Ustalar Oyligi", callback_data: 'salary_mode_start' }]);
        }
    }

    // 2. Global Option & Reports
    inlineKeyboard.push([
        { text: "🌐 Hammasi", callback_data: 'select_all' },
        { text: "📂 Boshqa xarajatlar", callback_data: 'select_global' }
    ]);
    inlineKeyboard.push([{ text: "📊 Hisobotlar", callback_data: 'reports_menu' }]);

    // ... (rest of menu)

    // ...

    // 3. Web App
    inlineKeyboard.push([{ text: "📱 Moliya Dashboard", web_app: { url: process.env.WEBAPP_URL || 'https://pulnazorat-bot.duckdns.org' } }]);

    const keyboard = { inline_keyboard: inlineKeyboard };

    // Persistent Keyboard for Management
    const persistentKeyboardRows = [['➕ Obyekt Yaratish', '🗑 Obyekt O\'chirish']];

    // Show 'Ustalar Oyligi' only if a specific project is selected
    if (dbUser.current_project_id && dbUser.current_project_id !== 'ALL') {
        const p = projects.find(p => p.id === dbUser.current_project_id);
        if (p) {
            persistentKeyboardRows.push(['👷 Ustalar Oyligi']);
        }
    }

    const persistentKeyboard = {
        keyboard: persistentKeyboardRows,
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
        if (e.description && e.description.includes("message is not modified")) {
            return; // Ignore harmless error
        }
        console.error("Menu Error:", e);
        // Fallback
        await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
}

bot.start(async (ctx) => {
    let user = await getUser(ctx.from.id);

    if (!user) {
        user = await createUser(ctx.from.id, ctx.from.username);

        // Notify Admin
        const adminId = process.env.ADMIN_ID;
        if (adminId) {
            // Escape HTML special chars function
            const escapeHtml = (text) => text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "";

            await ctx.telegram.sendMessage(adminId,
                `🆕 <b>Yangi Foydalanuvchi!</b>\n\n👤 Ism: ${escapeHtml(ctx.from.first_name)}\n🆔 ID: <code>${ctx.from.id}</code>\n🔗 Username: @${escapeHtml(ctx.from.username) || 'Yo\'q'}`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Ruxsat berish", callback_data: `admin_approve_${ctx.from.id}` },
                                { text: "❌ Rad etish", callback_data: `admin_reject_${ctx.from.id}` }
                            ]
                        ]
                    }
                }
            );
        }
    }

    // FIX: Auto-approve Admin in /start as well
    if (process.env.ADMIN_ID && String(process.env.ADMIN_ID).trim() === String(ctx.from.id).trim() && user.status !== 'approved') {
        const db = await openDb();
        await db.run("UPDATE users SET status = 'approved' WHERE telegram_id = ?", ctx.from.id);
        user.status = 'approved'; // Update local object
        await ctx.reply("👑 Admin aniqlandi. Siz avtomatik tasdiqlandingiz.");
    }

    if (user.status !== 'approved') {
        const adminUsername = process.env.ADMIN_USERNAME ? `@${process.env.ADMIN_USERNAME}` : "Admin";
        return ctx.reply(`⏳ Assalomu alaykum! Botdan foydalanish uchun admin tasdig'i kerak.\n\nTasdiqlash uchun ${adminUsername} ga yozishingiz mumkin.`, {
            reply_markup: { remove_keyboard: true } // Remove persistent keyboard if any
        });
    }

    await showMainMenu(ctx, false);
});

// Admin Actions
bot.action(/admin_approve_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const db = await openDb();
    await db.run("UPDATE users SET status = 'approved' WHERE telegram_id = ?", userId);

    // Notify Admin
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ Ruxsat berildi!`);

    // Notify User
    try {
        const adminUsername = process.env.ADMIN_USERNAME ? `@${process.env.ADMIN_USERNAME}` : "Admin";
        await ctx.telegram.sendMessage(userId, `✅ Sizning so'rovingiz ${adminUsername} tomonidan tasdiqlandi! /start bosib ishlatishingiz mumkin.`);
    } catch (e) {
        console.error("Failed to notify user", e);
    }
});

bot.action(/admin_reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const db = await openDb();
    await db.run("UPDATE users SET status = 'rejected' WHERE telegram_id = ?", userId);

    // Notify Admin
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ Rad etildi.`);

    // Notify User
    try {
        await ctx.telegram.sendMessage(userId, "❌ Sizning so'rovingiz rad etildi.");
    } catch (e) {
        console.error("Failed to notify user", e);
    }
});

// Create Middleware for other actions
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();

    // Skip for start command as it handles its own logic
    if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start')) return next();

    // Skip for admin actions
    if (ctx.callbackQuery && ctx.callbackQuery.data && ctx.callbackQuery.data.startsWith('admin_')) return next();

    const isApproved = await checkUserApproval(ctx);
    if (isApproved) {
        return next();
    }

    // If checkUserApproval returned false, it already sent the "Pending/Rejected" message.
    // We just stop execution here.
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

bot.action('select_all', async (ctx) => {
    const db = await openDb();
    await db.run('UPDATE users SET current_project_id = ? WHERE telegram_id = ?', 'ALL', ctx.from.id);
    await ctx.answerCbQuery(`Hammasi (Umumiy ko'rinish) tanlandi`);
    await showMainMenu(ctx, true);
});

// Create Project Flow
const creatingProjectUsers = new Set();
const salaryModeUsers = new Set();


bot.hears('👷 Ustalar Oyligi', async (ctx) => {
    salaryModeUsers.add(ctx.from.id);
    await ctx.reply("👷 **Ustalar Oyligi**\n\nKimga va qancha oylik berildi?\nOvozli xabar yoki yozma shaklda yuboring.\n_Masalan: Ali 100, Vali 200..._", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 Bekor qilish", callback_data: 'cancel_salary_mode' }]
            ]
        }
    });
});

bot.action('salary_mode_start', async (ctx) => {
    salaryModeUsers.add(ctx.from.id);
    await ctx.reply("👷 **Ustalar Oyligi**\n\nKimga va qancha oylik berildi?\nOvozli xabar yoki yozma shaklda yuboring.\n_Masalan: Ali 100, Vali 200..._", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 Bekor qilish", callback_data: 'cancel_salary_mode' }]
            ]
        }
    });
    await ctx.answerCbQuery();
});

bot.action('cancel_salary_mode', async (ctx) => {
    salaryModeUsers.delete(ctx.from.id);
    await ctx.answerCbQuery("Bekor qilindi.");
    await showMainMenu(ctx, true);
});

bot.hears('➕ Obyekt Yaratish', async (ctx) => {
    creatingProjectUsers.add(ctx.from.id);
    await ctx.reply("Yangi obyekt nomini yozing:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 Orqaga", callback_data: 'cancel_create_project' }]
            ]
        }
    });
});

bot.action('cancel_create_project', async (ctx) => {
    creatingProjectUsers.delete(ctx.from.id);
    await ctx.answerCbQuery("Bekor qilindi.");
    await showMainMenu(ctx, true);
});

bot.hears('🗑 Obyekt O\'chirish', async (ctx) => {
    const db = await openDb();
    const projects = await db.all('SELECT * FROM projects WHERE user_id = ?', ctx.from.id);

    if (projects.length === 0) {
        return ctx.reply("Sizda hech qanday obyekt yo'q.");
    }

    const inlineKeyboard = [];
    let row = [];
    projects.forEach(p => {
        row.push({ text: `❌ ${p.name}`, callback_data: `confirm_delete_project_${p.id}` });
        if (row.length === 2) {
            inlineKeyboard.push(row);
            row = [];
        }
    });
    if (row.length > 0) inlineKeyboard.push(row);

    inlineKeyboard.push([{ text: "🔙 Orqaga", callback_data: 'main_menu' }]);

    await ctx.reply("O'chirmoqchi bo'lgan obyektingizni tanlang:", {
        reply_markup: { inline_keyboard: inlineKeyboard }
    });
});

bot.action(/confirm_delete_project_(.+)/, async (ctx) => {
    const projectId = ctx.match[1];
    const db = await openDb();

    // Check if project exists
    const project = await db.get('SELECT * FROM projects WHERE id = ?', projectId);
    if (!project) {
        await ctx.answerCbQuery("Obyekt topilmadi.", true);
        return showMainMenu(ctx, true);
    }

    // Confirmation Dialog
    await ctx.editMessageText(`⚠️ **${project.name}** o'chirilmoqda!\n\nUnga bog'liq barcha kirim-chiqimlar ham o'chib ketadi. Tasdiqlaysizmi?`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Ha, o'chirish", callback_data: `delete_project_final_${projectId}` },
                    { text: "❌ Yo'q, qaytish", callback_data: 'main_menu' }
                ]
            ]
        }
    });
});

bot.action(/delete_project_final_(.+)/, async (ctx) => {
    const projectId = ctx.match[1];
    const db = await openDb();

    try {
        const project = await db.get('SELECT * FROM projects WHERE id = ?', projectId);
        if (!project) {
            await ctx.answerCbQuery("Obyekt topilmadi.", true);
            return showMainMenu(ctx, true);
        }

        await db.run('DELETE FROM income WHERE project_id = ?', projectId);
        await db.run('DELETE FROM expenses WHERE project_id = ?', projectId);
        await db.run('DELETE FROM projects WHERE id = ?', projectId);

        // Reset current project if user was on it
        const user = await getUser(ctx.from.id);
        if (user.current_project_id == projectId) {
            await db.run('UPDATE users SET current_project_id = NULL WHERE telegram_id = ?', ctx.from.id);
        }

        await ctx.answerCbQuery(`"${project.name}" o'chirildi!`, true);
        await showMainMenu(ctx, true);

    } catch (e) {
        console.error("Delete Error:", e);
        await ctx.answerCbQuery("Xatolik yuz berdi.", true);
    }
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

    if (salaryModeUsers.has(userId)) {
        if (text.startsWith('/')) return next();
        await processSalaryInput(ctx, text, 'text');
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
                { text: '📆 Shu oy', callback_data: 'report_month' }
            ],
            [
                { text: '🔙 Orqaga', callback_data: 'main_menu' },
                { text: '🏠 Bosh menyu', callback_data: 'main_menu' }
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

        // Fetch Salary Category for Comparison
        const salaryCat = await ensureSalaryCategory(userId);

        if (isHammasi) {
            // HAMMASI RENDERER
            const Incomes = rows.filter(r => r.type === 'income');
            if (Incomes.length > 0) {
                message += `📥 **KIRIMLAR:**\n`;
                Incomes.forEach(r => message += `🟢 ${r.description}: +${r.amount.toLocaleString()}\n`);
                message += `\n------------------------------------------------\n`;
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

                const pExpenses = tasksByProject[pid];
                const pSalaries = pExpenses.filter(r => r.category_id === salaryCat.id);
                const pRegular = pExpenses.filter(r => r.category_id !== salaryCat.id);

                if (pRegular.length > 0) {
                    pRegular.forEach(r => {
                        message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
                        pTotal += r.amount;
                    });
                }

                if (pSalaries.length > 0) {
                    message += `   👷 **Ustalar Oyligi:**\n`;
                    pSalaries.forEach(r => {
                        message += `   🔸 ${r.description}: -${r.amount.toLocaleString()}\n`;
                        pTotal += r.amount;
                    });
                }

                message += `   Jami: -${pTotal.toLocaleString()}\n`;
                message += `------------------------------------------------\n`;
            });

            const balance = totalInc - totalExp;
            message += `\n💰 **JAMI BALANS:**\n` +
                `🟢 Kirim: +${totalInc.toLocaleString()}\n` +
                `🔴 Chiqim: -${totalExp.toLocaleString()}\n` +
                `💵 Qoldiq: ${balance.toLocaleString()} so'm`;

        } else {
            // PROJECT & BOSHQA RENDERER (Expenses Only)
            const salaries = rows.filter(r => r.category_id === salaryCat.id);
            const regular = rows.filter(r => r.category_id !== salaryCat.id);

            if (regular.length > 0) {
                message += `🛠 **Xarajatlar:**\n`;
                regular.forEach(r => {
                    message += `🔴 ${r.description}: -${r.amount.toLocaleString()}\n`;
                });
            }

            if (salaries.length > 0) {
                message += `\n👷 **Ustalar Oyligi:**\n`;
                salaries.forEach(r => {
                    message += `� ${r.description}: -${r.amount.toLocaleString()}\n`;
                });
            }

            message += `\n────────────────\n` +
                ` Jami Chiqim: -${totalExp.toLocaleString()} so'm`;
        }

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📥 PDF', callback_data: `download_pdf_${period}` },
                    { text: '📊 Excel', callback_data: `download_excel_${period}` }
                ],
                [
                    { text: '🔙 Orqaga', callback_data: 'reports_menu' },
                    { text: '🏠 Bosh menyu', callback_data: 'main_menu' }
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
        const { rows, totalInc, totalExp, periodName, startDate, endDate, startingBalance, projectName, isHammasi } = await getReportData(db, user.id, period, user.current_project_id);
        const balance = totalInc - totalExp;

        // Fetch Project Names for Mapping
        const projectsList = await db.all('SELECT id, name FROM projects WHERE user_id = ?', userId);
        const projectMap = {};
        projectsList.forEach(p => projectMap[p.id] = p.name);
        projectMap['null'] = "Boshqa xarajatlar"; // Label for null project

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Hisobot ${startDate}`);

        // Column Setup
        worksheet.columns = [
            { width: 15 }, // Date
            { width: 35 }, // Description
            { width: 15 }, // Type/Category
            { width: 20 }, // Amount
            { width: 20 }  // Balance/Extra
        ];

        const salaryCat = await ensureSalaryCategory(userId);

        // --- STYLES ---
        const styles = {
            title: { font: { bold: true, size: 18, color: { argb: 'FF1e40af' } }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } } },
            headerVal: { font: { bold: true } },
            headerLabel: { font: { color: { argb: 'FF64748b' } } },
            cardTitle: { font: { bold: true, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center' } },
            cardVal: { font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center' } },
            tableHeader: { font: { bold: true, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'center', vertical: 'middle' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } } },
            cellDate: { alignment: { horizontal: 'center' } },
            cellAmountInc: { font: { bold: true, color: { argb: 'FF059669' } }, alignment: { horizontal: 'right' } },
            cellAmountExp: { font: { bold: true, color: { argb: 'FFdc2626' } }, alignment: { horizontal: 'right' } },
            sectionHeader: { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, alignment: { horizontal: 'left', indent: 1 } },
            listRowOdd: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf9fafb' } }
        };

        // 1. Report Title
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `MOLIYA HISOBOTI - ${projectName}`;
        titleCell.style = styles.title;
        worksheet.getRow(1).height = 30;

        // 2. Info Block
        worksheet.getCell('A2').value = 'Davr:';
        worksheet.getCell('B2').value = `${startDate} - ${endDate}`;
        worksheet.getCell('B2').font = styles.headerVal;

        worksheet.getCell('A3').value = 'Foydalanuvchi:';
        worksheet.getCell('B3').value = user.username || ctx.from.first_name;
        worksheet.getCell('B3').font = styles.headerVal;



        // Summary Cards (Stylized Row 6-7)
        if (isHammasi) {
            worksheet.mergeCells('A6:B6');
            const incLabel = worksheet.getCell('A6');
            incLabel.value = 'JAMI KIRIM';
            incLabel.style = styles.cardTitle;
            incLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };

            worksheet.mergeCells('A7:B7');
            const incVal = worksheet.getCell('A7');
            incVal.value = `+${totalInc.toLocaleString()} so'm`;
            incVal.style = styles.cardVal;
            incVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };

            worksheet.mergeCells('C6:D6');
            const expLabel = worksheet.getCell('C6');
            expLabel.value = 'JAMI CHIQIM';
            expLabel.style = styles.cardTitle;
            expLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };

            worksheet.mergeCells('C7:D7');
            const expVal = worksheet.getCell('C7');
            expVal.value = `-${totalExp.toLocaleString()} so'm`;
            expVal.style = styles.cardVal;
            expVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };

            worksheet.getCell('E6').value = 'BALANS';
            worksheet.getCell('E6').style = styles.cardTitle;
            worksheet.getCell('E6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };

            worksheet.getCell('E7').value = `${balance >= 0 ? '+' : ''}${balance.toLocaleString()} so'm`;
            worksheet.getCell('E7').style = styles.cardVal;
            worksheet.getCell('E7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3b82f6' } };
        } else {
            // Project/Global View (Expense Only Card)
            worksheet.mergeCells('C6:D6');
            const expLabel = worksheet.getCell('C6');
            expLabel.value = 'JAMI CHIQIM';
            expLabel.style = styles.cardTitle;
            expLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };

            worksheet.mergeCells('C7:D7');
            const expVal = worksheet.getCell('C7');
            expVal.value = `-${totalExp.toLocaleString()} so'm`;
            expVal.style = styles.cardVal;
            expVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFef4444' } };
        }

        // --- DATA RENDERING ---
        let currentRow = 10;

        if (isHammasi) {
            // 1. Incomes Section
            const incomes = rows.filter(r => r.type === 'income');
            if (incomes.length > 0) {
                worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
                const secHeader = worksheet.getCell(`A${currentRow}`);
                secHeader.value = "📥 MANBALAR (KIRIMLAR)";
                secHeader.style = styles.sectionHeader;
                secHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10b981' } };
                currentRow++;

                // Table Header
                const hRow = worksheet.getRow(currentRow);
                hRow.values = ['SANA', 'TAVSIF', 'TUR', 'SUMMA', ''];
                hRow.eachCell(c => c.style = styles.tableHeader);
                currentRow++;

                let secTotal = 0;
                incomes.forEach((r, idx) => {
                    secTotal += r.amount;
                    const row = worksheet.getRow(currentRow);
                    row.getCell(1).value = new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" });
                    row.getCell(1).alignment = { horizontal: 'center' };
                    row.getCell(2).value = r.description;
                    row.getCell(3).value = 'Kirim';
                    row.getCell(4).value = `+${r.amount.toLocaleString()}`;
                    row.getCell(4).style = styles.cellAmountInc;

                    if (idx % 2 === 1) row.fill = styles.listRowOdd;
                    row.eachCell({ includeEmpty: false }, (cell) => {
                        cell.border = { bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } } };
                    });
                    currentRow++;
                });

                worksheet.getCell(`C${currentRow}`).value = "Jami Kirim:";
                worksheet.getCell(`C${currentRow}`).font = { bold: true };
                worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                worksheet.getCell(`D${currentRow}`).value = `+${secTotal.toLocaleString()}`;
                worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FF059669' } };
                worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                currentRow += 2;
            }

            // 2. Project Sections
            const expenses = rows.filter(r => r.type === 'expense');
            const projectExpenses = {};
            expenses.forEach(r => {
                const pid = r.project_id || 'null';
                if (!projectExpenses[pid]) projectExpenses[pid] = [];
                projectExpenses[pid].push(r);
            });

            const sortedPids = Object.keys(projectExpenses).sort((a, b) => {
                if (a === 'null') return 1;
                if (b === 'null') return -1;
                return (projectMap[a] || '').localeCompare(projectMap[b] || '');
            });

            sortedPids.forEach(pid => {
                const pName = projectMap[pid] || "Noma'lum Obyekt";
                const pRows = projectExpenses[pid];

                // Project Header
                worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
                const secHeader = worksheet.getCell(`A${currentRow}`);
                secHeader.value = `🏗 ${pName}`;
                secHeader.style = styles.sectionHeader;
                secHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pid === 'null' ? 'FF64748b' : 'FF3b82f6' } };
                currentRow++;

                // Table Header
                const hRow = worksheet.getRow(currentRow);
                hRow.values = ['SANA', 'TAVSIF', 'TUR', 'SUMMA', ''];
                hRow.eachCell(c => c.style = styles.tableHeader);
                currentRow++;

                // Split Salaries
                const pSalaries = pRows.filter(r => r.category_id === salaryCat.id);
                const pRegular = pRows.filter(r => r.category_id !== salaryCat.id);

                let secTotal = 0;

                // Render Regular
                pRegular.forEach((r, idx) => {
                    secTotal += r.amount;
                    const row = worksheet.getRow(currentRow);
                    row.getCell(1).value = new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" });
                    row.getCell(1).alignment = { horizontal: 'center' };
                    row.getCell(2).value = r.description;
                    row.getCell(3).value = 'Chiqim';
                    row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } };
                    row.getCell(3).alignment = { horizontal: 'center' };
                    row.getCell(4).value = `-${r.amount.toLocaleString()}`;
                    row.getCell(4).style = styles.cellAmountExp;

                    if (idx % 2 === 1) row.fill = styles.listRowOdd;
                    row.eachCell({ includeEmpty: false }, (cell) => {
                        cell.border = { bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } } };
                    });
                    currentRow++;
                });

                // Render Salaries
                if (pSalaries.length > 0) {
                    const subHeader = worksheet.getRow(currentRow);
                    subHeader.getCell(2).value = "👷 Ustalar Oyligi";
                    subHeader.getCell(2).font = { bold: true, color: { argb: 'FFf59e0b' } };
                    currentRow++;

                    pSalaries.forEach((r, idx) => {
                        secTotal += r.amount;
                        const row = worksheet.getRow(currentRow);
                        row.getCell(1).value = new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" });
                        row.getCell(1).alignment = { horizontal: 'center' };
                        row.getCell(2).value = r.description;
                        row.getCell(3).value = 'Oylik';
                        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } };
                        row.getCell(3).alignment = { horizontal: 'center' };
                        row.getCell(4).value = `-${r.amount.toLocaleString()}`;
                        row.getCell(4).style = { font: { bold: true, color: { argb: 'FFf59e0b' } }, alignment: { horizontal: 'right' } };

                        if (idx % 2 === 1) row.fill = styles.listRowOdd;
                        row.eachCell({ includeEmpty: false }, (cell) => {
                            cell.border = { bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } } };
                        });
                        currentRow++;
                    });
                }

                // --- SUB-TOTALS ---
                const totalMaterials = pRegular.reduce((sum, r) => sum + r.amount, 0);
                const totalSalaries = pSalaries.reduce((sum, r) => sum + r.amount, 0);

                if (pRegular.length > 0) {
                    worksheet.getCell(`C${currentRow}`).value = "Jami Materiallar:";
                    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FF64748b' } }; // Slate 500
                    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                    worksheet.getCell(`D${currentRow}`).value = `-${totalMaterials.toLocaleString()}`;
                    worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFdc2626' } };
                    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                    currentRow++;
                }

                if (pSalaries.length > 0) {
                    worksheet.getCell(`C${currentRow}`).value = "Jami Ustalar Oyligi:";
                    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FFd97706' } }; // Amber 600
                    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                    worksheet.getCell(`D${currentRow}`).value = `-${totalSalaries.toLocaleString()}`;
                    worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFd97706' } };
                    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                    currentRow++;
                }

                // Section Total
                worksheet.getCell(`C${currentRow}`).value = `Jami ${pName}:`;
                worksheet.getCell(`C${currentRow}`).font = { bold: true };
                worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                worksheet.getCell(`D${currentRow}`).value = `-${secTotal.toLocaleString()}`;
                worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFdc2626' } };
                worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                currentRow += 2;
            });

        } else {
            // --- STANDARD VIEW (Single Project / Global) ---
            const adjustedTableTop = 10;
            worksheet.getRow(adjustedTableTop).values = ['SANA', 'TAVSIF', 'TUR', 'SUMMA', ''];
            worksheet.getRow(adjustedTableTop).eachCell(c => c.style = styles.tableHeader);
            currentRow = adjustedTableTop + 1;

            const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            const pSalaries = sortedRows.filter(r => r.category_id === salaryCat.id);
            const pRegular = sortedRows.filter(r => r.category_id !== salaryCat.id);

            // Render Regular
            pRegular.forEach((row, idx) => {
                const r = worksheet.getRow(currentRow);
                const date = new Date(row.created_at);

                r.getCell(1).value = date.toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" });
                r.getCell(1).alignment = { horizontal: 'center' };
                r.getCell(2).value = row.description;
                r.getCell(3).value = 'Chiqim';
                r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } };
                r.getCell(3).alignment = { horizontal: 'center' };
                r.getCell(4).value = `-${row.amount.toLocaleString()}`;
                r.getCell(4).style = styles.cellAmountExp;

                if (idx % 2 === 1) r.fill = styles.listRowOdd;
                r.eachCell({ includeEmpty: false }, (cell) => {
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } } };
                });
                currentRow++;
            });

            // Render Salaries
            if (pSalaries.length > 0) {
                const subHeader = worksheet.getRow(currentRow);
                subHeader.getCell(2).value = "👷 Ustalar Oyligi";
                subHeader.getCell(2).font = { bold: true, color: { argb: 'FFf59e0b' } };
                currentRow++;

                pSalaries.forEach((row, idx) => {
                    const r = worksheet.getRow(currentRow);
                    const date = new Date(row.created_at);

                    r.getCell(1).value = date.toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" });
                    r.getCell(1).alignment = { horizontal: 'center' };
                    r.getCell(2).value = row.description;
                    r.getCell(3).value = 'Oylik';
                    r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfef3c7' } }; // Amber light
                    r.getCell(3).alignment = { horizontal: 'center' };
                    r.getCell(4).value = `-${row.amount.toLocaleString()}`;
                    r.getCell(4).style = { font: { bold: true, color: { argb: 'FFf59e0b' } }, alignment: { horizontal: 'right' } };

                    if (idx % 2 === 1) r.fill = styles.listRowOdd;
                    r.eachCell({ includeEmpty: false }, (cell) => {
                        cell.border = { bottom: { style: 'thin', color: { argb: 'FFe5e7eb' } } };
                    });
                    currentRow++;
                });
            }

            // --- SUB-TOTALS ---
            const totalMaterials = pRegular.reduce((sum, r) => sum + r.amount, 0);
            const totalSalaries = pSalaries.reduce((sum, r) => sum + r.amount, 0);

            if (pRegular.length > 0) {
                worksheet.getCell(`C${currentRow}`).value = "Jami Materiallar:";
                worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FF64748b' } }; // Slate 500
                worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                worksheet.getCell(`D${currentRow}`).value = `-${totalMaterials.toLocaleString()}`;
                worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFdc2626' } };
                worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                currentRow++;
            }

            if (pSalaries.length > 0) {
                worksheet.getCell(`C${currentRow}`).value = "Jami Ustalar Oyligi:";
                worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FFd97706' } }; // Amber 600
                worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };
                worksheet.getCell(`D${currentRow}`).value = `-${totalSalaries.toLocaleString()}`;
                worksheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: 'FFd97706' } };
                worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
                currentRow++;
            }

            currentRow++;
            worksheet.getCell(`D${currentRow}`).value = 'Jami Chiqim:';
            worksheet.getCell(`D${currentRow}`).font = { bold: true };
            worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
            worksheet.getCell(`E${currentRow}`).value = `-${totalExp.toLocaleString()} so'm`;
            worksheet.getCell(`E${currentRow}`).font = { bold: true, color: { argb: 'FFdc2626' } };
            worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right' };
        }

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

    // UTC+5 Timezone Fix (Reliable)
    const now = new Date();
    const uztDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));

    const yyyy = uztDate.getFullYear();
    const mm = String(uztDate.getMonth() + 1).padStart(2, '0');
    const dd = String(uztDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (period === 'today') {
        dateFilter = `date(created_at, '+05:00') = '${todayStr}'`;
        startQueryFilter = `date(created_at, '+05:00') < '${todayStr}'`;
        periodName = "Bugungi";
        startDate = todayStr;
        endDate = todayStr;
    } else if (period === 'week') {
        const day = uztDate.getDay() || 7;
        const weekStart = new Date(uztDate);
        weekStart.setHours(-24 * (day - 1));
        const wYYYY = weekStart.getFullYear();
        const wMM = String(weekStart.getMonth() + 1).padStart(2, '0');
        const wDD = String(weekStart.getDate()).padStart(2, '0');
        const weekStartStr = `${wYYYY}-${wMM}-${wDD}`;

        dateFilter = `date(created_at, '+05:00') >= '${weekStartStr}'`;
        startQueryFilter = `date(created_at, '+05:00') < '${weekStartStr}'`;
        periodName = "Haftalik";
        startDate = weekStartStr;
        endDate = todayStr;
    } else if (period === 'month') {
        const monthStart = `${yyyy}-${mm}-01`;
        dateFilter = `date(created_at, '+05:00') >= '${monthStart}'`;
        startQueryFilter = `date(created_at, '+05:00') < '${monthStart}'`;
        periodName = "Oylik";
        startDate = monthStart;
        endDate = todayStr;
    }

    let rows = [];

    // QUERY LOGIC
    // QUERY LOGIC
    if (isHammasi) {
        const incomeRows = await db.all(`SELECT 'income' as type, amount, description, created_at, project_id, category_id FROM income WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC`, userId);
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id, category_id FROM expenses WHERE user_id = ? AND ${dateFilter} ORDER BY created_at DESC`, userId);
        rows = [...incomeRows, ...expenseRows];
    } else if (isProject) {
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id, category_id FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id = ? ORDER BY created_at DESC`, userId, projectId);
        rows = expenseRows;
    } else {
        // Global/Boshqa -> NOW EXPENSE ONLY
        const expenseRows = await db.all(`SELECT 'expense' as type, amount, description, created_at, project_id, category_id FROM expenses WHERE user_id = ? AND ${dateFilter} AND project_id IS NULL ORDER BY created_at DESC`, userId);
        rows = expenseRows;
    }

    // Calculate Totals within the period
    let totalInc = 0;
    let totalExp = 0;
    rows.forEach(r => r.type === 'income' ? totalInc += r.amount : totalExp += r.amount);

    // Starting Balance Logic (Only relevant for Hammasi)
    let startingBalance = 0;
    if (isHammasi) {
        // Only Hammasi (Global Income - Global Expenses) ?? 
        // Or All Income - All Expenses?
        // Hammasi View shows Global Income. Boshqa View shows Global Expenses. 
        // Balance calculation needs to be consistent. 
        // If Hammasi view is "All my money", it should be Total Income (Global) - Total Expenses (Global + Projects).

        const startIncQuery = `SELECT SUM(amount) as total FROM income WHERE user_id = ? AND ${startQueryFilter}`; // All income (assuming forced global)
        const startExpQuery = `SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND ${startQueryFilter}`; // All expenses
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
        const salaryCat = await ensureSalaryCategory(userId);

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
        if (reportData.isHammasi) {
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

        if (reportData.isHammasi) {
            doc.roundedRect(balansColumnX, openingBalanceY, colWidths.balance, 32, 4).fillAndStroke('#f8fafc', '#e2e8f0');
            doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text("Ostatka", balansColumnX + 5, openingBalanceY + 6, { width: colWidths.balance - 10, align: 'right' });
            doc.fillColor(startingBalance >= 0 ? '#059669' : '#dc2626').fontSize(10).font('Helvetica-Bold').text(`${startingBalance >= 0 ? '+' : ''}${startingBalance.toLocaleString()}`, balansColumnX + 5, openingBalanceY + 18, { width: colWidths.balance - 10, align: 'right' });
            doc.moveDown(3.5);
        }

        // RENDERER
        let currentY = doc.y;

        if (reportData.isHammasi) {

            doc.fontSize(12).fillColor('#000000').text("Batafsil Hisobot:", 40, doc.y);
            doc.moveDown(0.5);

            // 1. Incomes
            const Incomes = rows.filter(r => r.type === 'income');
            if (Incomes.length > 0) {
                doc.fillColor('#10b981').fontSize(12).font('Helvetica-Bold').text("KIRIMLAR", 40, doc.y);
                doc.moveDown(0.5);
                Incomes.forEach(r => {
                    doc.fillColor('#000000').fontSize(10).font('Helvetica').text(`+ ${r.amount.toLocaleString()} - ${r.description} (${new Date(r.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" })})`, 50, doc.y);
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

                const pExpenses = tasksByProject[pid];
                const pSalaries = pExpenses.filter(r => r.category_id === salaryCat.id);
                const pRegular = pExpenses.filter(r => r.category_id !== salaryCat.id);

                if (pRegular.length > 0) {
                    pRegular.forEach(r => {
                        doc.fillColor('#475569').fontSize(10).font('Helvetica').text(`- ${r.amount.toLocaleString()} - ${r.description}`, 50, doc.y);
                        pTotal += r.amount;
                    });
                }

                if (pSalaries.length > 0) {
                    doc.moveDown(0.2);
                    doc.fillColor('#f59e0b').fontSize(10).font('Helvetica-Bold').text(`👷 Ustalar Oyligi`, 50, doc.y);
                    pSalaries.forEach(r => {
                        doc.fillColor('#d97706').fontSize(10).font('Helvetica').text(`- ${r.amount.toLocaleString()} - ${r.description}`, 60, doc.y);
                        pTotal += r.amount;
                    });
                }

                doc.fillColor('#ef4444').fontSize(10).font('Helvetica-Bold').text(`Jami: -${pTotal.toLocaleString()}`, 50, doc.y);
                doc.moveDown(0.5);
                doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(50, doc.y).lineTo(500, doc.y).stroke();
                doc.moveDown(0.5);
            });

            currentY = doc.y;

        } else {
            // Standard Table (for Project or Global)
            const adjustedTableTop = doc.y;
            doc.rect(40, adjustedTableTop, 515, 30).fillAndStroke('#334155', '#334155');
            doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
                .text('SANA', 40 + 2, adjustedTableTop + 11, { width: 60, align: 'center' })
                .text('TAVSIF', 40 + 70, adjustedTableTop + 11, { width: 250 })
                .text('SUMMA', 360, adjustedTableTop + 11, { width: 100, align: 'right' });

            currentY = adjustedTableTop + 30;
            const sortedRows = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let runningBalance = startingBalance;

            sortedRows.forEach((row, index) => {
                const amount = Number(row.amount) || 0;
                if (row.type === 'income') runningBalance += amount; else runningBalance -= amount;

                // Color coding for Salary vs Regular
                let color = '#000000';
                if (row.category_id === salaryCat.id) color = '#d97706'; // Amber for salary

                doc.fillColor(color).fontSize(10).font('Helvetica')
                    .text(`${new Date(row.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Tashkent" })}`, 40 + 2, currentY + 10, { width: 60, align: 'center' })
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

        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica-Oblique').text(`Yaratilgan: ${new Date().toLocaleString('uz-UZ', { timeZone: "Asia/Tashkent" })}`, 350, 780, { align: 'right' });

        doc.end();

    } catch (e) {
        console.error("PDF Error:", e); // Log real error to server console
        ctx.reply("PDF yaratishda xatolik yuz berdi. Iltimos admin bilan bog'laning.");
    }
}


async function processSalaryInput(ctx, input, type, existingMsg = null) {
    try {
        let waitingMsg;
        if (existingMsg) {
            waitingMsg = existingMsg;
            await ctx.telegram.editMessageText(ctx.chat.id, waitingMsg.message_id, null, "⏳ Ishchilar ro'yxati tahlil qilinmoqda...");
        } else {
            waitingMsg = await ctx.reply("⏳ Ishchilar ro'yxati tahlil qilinmoqda...");
        }

        // Prepare Gemini Prompt
        const prompt = `
        Analyze this ${type} message (Uzbek language) regarding worker salaries (Ustalar oyligi).
        Extract worker names and payment amounts.
        
        Handle fractional numbers:
        - "yarim" means 0.5 (half). 
        - "bir yarim" = 1.5, "ikki yarim" = 2.5.
        - "3 yarim million" = 3,500,000.
        
        Return STRICT JSON ARRAY of objects:
        [
            { "description": "Worker Name", "amount": 100000, "type": "expense" }
        ]
        
        Example User: "Ali ga 200 ming, Valiga 150 ming berdim"
        Output: [{"description": "Ali", "amount": 200000, "type": "expense"}, {"description": "Vali", "amount": 150000, "type": "expense"}]

        IMPORTANT:
        - If the input is unintelligible or contains no numbers, return: {"error": "tushunarsiz"}
        - DO NOT return the example data ("Ali", "Vali") if the input does not match.
        - Clean the description to just the name/role. Remove "ga", "uchun", etc.
        `;

        let result;
        try {
            // Re-use logic or call generator
            // We need to construct the generation call. 
            // If text, generateContent(prompt + text).
            // If voice buffer, generateContent([prompt, inlineData]).

            const genAI = getNextGenAI();
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            if (type === 'text') {
                result = await model.generateContent(prompt + "\nUser Input: " + input);
            } else {
                result = await model.generateContent([
                    prompt,
                    { inlineData: { mimeType: "audio/ogg", data: input.toString('base64') } }
                ]);
            }

        } catch (error) {
            console.error("Gemini Salary Error:", error);
            await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);
            return ctx.reply("⚠️ Tahlil qilishda xatolik. Qayta urinib ko'ring.");
        }

        const text = result.response.text();
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        let data = JSON.parse(jsonStr);
        if (!Array.isArray(data)) data = [data];

        // Attach Category
        const salaryCat = await ensureSalaryCategory(ctx.from.id);
        data.forEach(item => {
            item.categoryId = salaryCat.id;
            item.description = `👷 ${item.description}`; // Add icon to desc
        });

        pendingTransactions.set(ctx.from.id, data);

        let msg = "👷 **Oylik To'lovlarni Tasdiqlang:**\n\n";
        let total = 0;
        data.forEach((item, index) => {
            msg += `${index + 1}. ${item.description}: ${item.amount.toLocaleString()} so'm\n`;
            total += item.amount;
        });
        msg += `\n**JAMI:** ${total.toLocaleString()} so'm`;

        await ctx.telegram.deleteMessage(ctx.chat.id, waitingMsg.message_id);

        // Remove from salary mode? No, wait until confirm or cancel.
        // Actually typical flow: confirm -> save -> exit mode. 
        // cancel -> exit mode.
        // But here we rely on callbacks. 
        // We can keep them in mode or not. 
        // Let's keep them in mode until they explicitly cancel or we finish.
        // But `confirm_expense` deletes `pendingTransactions`. 
        // It does NOT remove from `salaryModeUsers`. 
        // So user stays in mode? 
        // If user stays in mode, next text will be treated as salary.
        // This is good for batch entry.
        // Adding a specific "Exit" button in the prompt is good.

        await ctx.reply(msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Tasdiqlash', callback_data: 'confirm_expense' }],
                    [{ text: '❌ Bekor qilish', callback_data: 'cancel_expense' }] // This just clears pending
                ]
            }
        });

    } catch (e) {
        console.error("Process Salary Error:", e);
        ctx.reply("Tushunarsiz xabar. Qayta urinib ko'ring.");
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

        if (salaryModeUsers.has(ctx.from.id)) {
            await processSalaryInput(ctx, buffer, 'voice', processingMsg);
            return;
        }

        // Gemini Processing
        const prompt = `
        Analyze this voice message and extract financial transactions.
        Context: The user is speaking Uzbek.
        
        Identify multiple transactions if present.
        For each transaction determine:
        1. "type": "income" or "expense".
           - STRICTLY classify as "income" if words like: "Kirim", "Ostatka", "Tushum", "Qoldi", "Pribil", "Foyda", "Oldim" are used.
           - "Oldim" (Received/Took) -> type: "income" (e.g. "Bahodirdan oldim").
           - "Sotib oldim" (Bought) -> type: "expense".
           - "Berdim", "To'ladim", "Xarajat", "Ketdi" -> type: "expense".
        2. "amount": numeric value (integer). Handle "yarim" (half/0.5). e.g. "ikki yarim million" = 2,500,000.
        3. "description": Extract the item name ONLY. Remove any numbers or prices from the text.
           - User: "Kamozlarga 3 million 650 ming" -> Description: "Kamozlarga"
           - User: "Taksi 20 ming" -> Description: "Taksi"
           - TRANSCRIBE EXACTLY but REMOVE the money part.

        Return STRICT JSON ARRAY:
        [
            {"type": "income", "amount": 50000, "description": "Oylik"},
            {"type": "expense", "amount": 20000, "description": "Taksi"}
        ]
        
        IMPORTANT:
        - If no numbers found or audio is unclear, return: {"error": "tushunarsiz"}
        - DO NOT RETURN THE EXAMPLES ("Kamozlarga", "Taksi") if they are not in the input.
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

            await db.run(`INSERT INTO ${table} (user_id, amount, description, project_id, category_id) VALUES (?, ?, ?, ?, ?)`,
                dbUser.id, item.amount, item.description, projectIdToSave, item.categoryId || null
            );
        }

        pendingTransactions.delete(userId);

        // FIX: Remove user from salary mode so they return to normal expense mode
        salaryModeUsers.delete(userId);

        await ctx.editMessageText(`✅ Barcha bitimlar saqlandi!`);
        await showMainMenu(ctx);

    } catch (e) {
        console.error(e);
        ctx.reply("Saqlashda xatolik bo'ldi.");
    }
});

bot.action('cancel_expense', async (ctx) => {
    pendingTransactions.delete(ctx.from.id);
    salaryModeUsers.delete(ctx.from.id); // FIX: Also exit mode on cancel
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


