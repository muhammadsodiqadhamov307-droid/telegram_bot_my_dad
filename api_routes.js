import express from 'express';
import crypto from 'crypto';
import { openDb } from './database.js';

const router = express.Router();

// Middleware: Verify Telegram WebApp InitData
// Middleware: Verify Telegram WebApp InitData
const verifyInitData = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    // DEBUG BYPASS: Allow access if using BOT_TOKEN directly or a special debug flag
    // This helps in testing if the issue is strictly initData validation
    if (authHeader === `Bearer ${process.env.BOT_TOKEN}`) {
        console.log("⚠️ DEBUG AUTH USED");
        req.user = { id: 7204780521, first_name: "Debug", username: "debug_user" }; // Replace with your real ID if known
        return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log("Auth failed: Missing header");
        return res.status(401).json({ detail: "Not authenticated" });
    }

    const initData = authHeader.split(' ')[1];
    if (!initData) return res.status(401).json({ detail: "No initData found" });

    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');

        // Sort keys alphabetically
        const dataCheckArr = [];
        for (const [key, value] of urlParams.entries()) {
            dataCheckArr.push(`${key}=${value}`);
        }
        dataCheckArr.sort();
        const dataCheckString = dataCheckArr.join('\n');

        const botToken = process.env.BOT_TOKEN;
        if (!botToken) {
            console.error("CRITICAL: BOT_TOKEN is missing in .env");
            throw new Error("BOT_TOKEN missing");
        }

        // HMAC-SHA256 Signature Validation
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash !== hash) {
            console.error(`Hash mismatch! \nCalc: ${calculatedHash}\nRecv: ${hash}\nBotToken: ${botToken.substring(0, 5)}...`);
            return res.status(403).json({ detail: "Invalid authentication Hash Mismatch" });
        }

        // Parse user data
        const userDataStr = urlParams.get('user');
        const user = JSON.parse(userDataStr);
        req.user = user; // { id, first_name, username, ... }
        next();

    } catch (e) {
        console.error("Auth Error:", e);
        return res.status(403).json({ detail: `Authentication failed: ${e.message}` });
    }
};

// Apply middleware to all API routes
router.use(verifyInitData);

// --- User Profile ---
router.get('/user/profile', async (req, res) => {
    try {
        const db = await openDb();
        const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', req.user.id);

        if (!user) {
            // Auto-create user if missing (synced from Telegram auth)
            await db.run('INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)', req.user.id, req.user.username);
        }

        res.json({
            telegram_id: req.user.id,
            first_name: req.user.first_name,
            username: req.user.username,
            language: 'uz',
            currency: 'UZS'
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Server error" });
    }
});

// --- Transactions ---
router.get('/transactions', async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.user.id;
        const { limit = 100, type, category_id, start_date, end_date } = req.query;

        // Fetch User Internal ID
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.json([]);

        let query = `
            SELECT id, amount, description, category_id, created_at as transaction_date, 'income' as type 
            FROM income WHERE user_id = ?
            UNION ALL
            SELECT id, amount, description, category_id, created_at as transaction_date, 'expense' as type 
            FROM expenses WHERE user_id = ?
        `;

        const params = [userRow.id, userRow.id];

        // Note: Simple filtering on UNION results is harder in SQL without subquery.
        // For MVP, we fetch sorted by date desc and filter in JS or wrap in CTE.
        // Wrapping in CTE for sorting/filtering:
        let fullQuery = `
            SELECT t.*, c.name as category_name, c.icon, c.color 
            FROM (${query}) t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE 1=1
        `;

        if (type) {
            fullQuery += ` AND t.type = '${type}'`;
        }
        // Date filters would need ISO string comparison

        fullQuery += ` ORDER BY t.transaction_date DESC LIMIT ?`;
        params.push(limit);

        const rows = await db.all(fullQuery, params);

        res.json(rows.map(row => ({
            id: row.id,
            type: row.type,
            amount: row.amount,
            category_id: row.category_id,
            category_name: row.category_name || (row.type === 'income' ? 'Kirim' : 'Chiqim'), // Fallback
            description: row.description,
            transaction_date: row.transaction_date,
            created_at: row.transaction_date
        })));

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Database error" });
    }
});

router.post('/transactions', async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.user.id;
        const { type, amount, category_id, description, transaction_date } = req.body;

        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.status(404).json({ detail: "User not found" });

        let table = type === 'income' ? 'income' : 'expenses';

        // If category_id is missing, try to find "Boshqa" or default? 
        // Or just insert NULL.

        const result = await db.run(
            `INSERT INTO ${table} (user_id, amount, description, category_id, created_at) VALUES (?, ?, ?, ?, ?)`,
            userRow.id, amount, description, category_id, transaction_date || new Date().toISOString()
        );

        res.json({
            id: result.lastID,
            type,
            amount,
            category_id,
            description,
            transaction_date: transaction_date || new Date().toISOString()
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Creation failed" });
    }
});

router.delete('/transactions/:id', async (req, res) => {
    // This is tricky because we don't know the type from ID alone easily if IDs overlap
    // Assuming IDs are unique per table, we try both or require type in query?
    // Frontend likely sends ID.
    // For MVP, try delete from both or ask frontend to send type?
    // Standard REST DELETE usually creates unique ID per resource.
    // Our 'transactions' endpoint returns ID.
    // If IDs collide between income/expense, this is a problem.
    // Strategy: Frontend 'Transaction' object includes 'type'.
    // BUT DELETE is /transactions/{id}.
    // We can try to delete from both or pass ?type=...
    // Let's assume frontend might not pass type. 
    // We'll try to find it first.

    // BETTER: The Listing API returns ID.
    // We should probably safeguard this.
    // Let's try to delete from expenses first (more common), then income.

    try {
        const db = await openDb();
        const userId = req.user.id;
        // Need internal ID
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.status(404).json({ detail: "User not found" });

        // Try Delete Expense
        let result = await db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
        if (result.changes > 0) return res.json({ message: "Deleted" });

        // Try Delete Income
        result = await db.run('DELETE FROM income WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
        if (result.changes > 0) return res.json({ message: "Deleted" });

        res.status(404).json({ detail: "Not found" });

    } catch (e) {
        console.error(e);
        res.status(500).error;
    }
});

// --- Analytics ---
router.get('/analytics/summary', async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.user.id;
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.json({ total_income: 0, total_expense: 0, balance: 0 });

        const inc = await db.get('SELECT SUM(amount) as total FROM income WHERE user_id = ?', userRow.id);
        const exp = await db.get('SELECT SUM(amount) as total FROM expenses WHERE user_id = ?', userRow.id);

        const total_income = inc.total || 0;
        const total_expense = exp.total || 0;

        res.json({
            total_income,
            total_expense,
            balance: total_income - total_expense,
            transaction_count: 0 // Optional
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error" });
    }
});

router.get('/analytics/by-category', async (req, res) => {
    try {
        const db = await openDb();
        const userId = req.user.id;
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.json({});

        // Group by Category Name
        // Union Income and Expenses
        const query = `
            SELECT c.name, c.type, SUM(t.amount) as total, c.color, c.icon
            FROM (
                SELECT amount, category_id, 'income' as type FROM income WHERE user_id = ?
                UNION ALL
                SELECT amount, category_id, 'expense' as type FROM expenses WHERE user_id = ?
            ) t
            JOIN categories c ON t.category_id = c.id
            GROUP BY c.name
        `;

        const rows = await db.all(query, userRow.id, userRow.id);

        const result = {};
        rows.forEach(row => {
            if (!result[row.name]) {
                result[row.name] = { income: 0, expense: 0, icon: row.icon, color: row.color };
            }
            if (row.type === 'income') result[row.name].income += row.total;
            else result[row.name].expense += row.total;
        });

        res.json(result);

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error" });
    }
});

// --- Categories ---
router.get('/categories', async (req, res) => {
    try {
        const db = await openDb();
        const { type } = req.query;
        let query = 'SELECT * FROM categories WHERE (user_id = ? OR is_default = 1)';
        const params = [req.user.id];

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        const categories = await db.all(query, params);
        res.json(categories);
    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error" });
    }
});

export default router;
