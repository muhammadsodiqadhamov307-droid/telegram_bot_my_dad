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
        const { limit = 100, type, category_id, start_date, end_date, mode, balance_id, project_id } = req.query;

        // Fetch User Internal ID
        const userRow = await db.get('SELECT id, active_mode FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.json([]);

        // Determine Mode: Use query param or user's active mode
        const currentMode = mode || userRow.active_mode || 'construction';

        // Base Query
        // Personal: balance_id IS NOT NULL AND project_id IS NULL
        // Construction: project_id IS NOT NULL (or Global Construction: balance_id IS NULL)

        let whereClause = "user_id = ?";
        const params = [userRow.id];

        if (currentMode === 'personal') {
            whereClause += " AND balance_id IS NOT NULL";
            if (balance_id) {
                whereClause += " AND balance_id = ?";
                params.push(balance_id);
            }
        } else {
            // Construction
            whereClause += " AND balance_id IS NULL";
            if (project_id) {
                whereClause += " AND project_id = ?";
                params.push(project_id);
            }
        }

        let query = `
            SELECT id, amount, description, category_id, created_at as transaction_date, 'income' as type 
            FROM income WHERE ${whereClause}
            UNION ALL
            SELECT id, amount, description, category_id, created_at as transaction_date, 'expense' as type 
            FROM expenses WHERE ${whereClause}
        `;

        // We need to double the params because we use them in both parts of UNION
        const fullParams = [...params, ...params];

        let fullQuery = `
            SELECT t.*, c.name as category_name, c.icon, c.color 
            FROM (${query}) t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE 1=1
        `;

        if (type) {
            fullQuery += ` AND t.type = '${type}'`;
        }
        if (start_date && end_date) {
            fullQuery += ` AND t.transaction_date BETWEEN '${start_date}' AND '${end_date}'`;
        }

        fullQuery += ` ORDER BY t.transaction_date DESC LIMIT ?`;
        fullParams.push(limit);

        const rows = await db.all(fullQuery, fullParams);

        res.json(rows.map(row => ({
            id: row.id,
            type: row.type,
            amount: row.amount,
            category_id: row.category_id,
            category_name: row.category_name || (row.type === 'income' ? 'Kirim' : 'Chiqim'),
            description: row.description,
            transaction_date: row.transaction_date,
            created_at: row.transaction_date,
            color: row.color,
            icon: row.icon
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
        const { type, amount, category_id, description, transaction_date, balance_id, project_id, currency } = req.body;

        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', userId);
        if (!userRow) return res.status(404).json({ detail: "User not found" });

        let table = type === 'income' ? 'income' : 'expenses';

        // STRICT CONSTRAINT LOGIC HANDLING
        // Personal: balance_id required, project_id must be null
        // Construction: balance_id must be null, project_id optional (Global)

        let finalBalanceId = balance_id;
        let finalProjectId = project_id;

        // If balance_id is present, user intends Personal transaction. Force project_id NULL.
        if (finalBalanceId) {
            finalProjectId = null;

            // Update Balance Amount
            if (type === 'income') {
                await db.run('UPDATE balances SET amount = amount + ? WHERE id = ?', amount, finalBalanceId);
            } else {
                await db.run('UPDATE balances SET amount = amount - ? WHERE id = ?', amount, finalBalanceId);
            }
        } else {
            // Construction Mode
            finalBalanceId = null;
            // project_id can be null (Global) or set
        }

        const result = await db.run(
            `INSERT INTO ${table} (user_id, amount, description, category_id, balance_id, project_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            userRow.id, amount, description, category_id, finalBalanceId, finalProjectId, currency || 'UZS', transaction_date || new Date().toISOString()
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
        res.status(500).json({ detail: "Creation failed (Constraint Violation?)" });
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

        const { type } = req.query; // 'income' or 'expense'

        // Targeted Delete (Safe)
        if (type === 'income') {
            const result = await db.run('DELETE FROM income WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
            if (result.changes > 0) return res.json({ message: "Deleted income" });
        } else if (type === 'expense' || type === 'expenses') {
            const result = await db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
            if (result.changes > 0) return res.json({ message: "Deleted expense" });
        } else {
            // Fallback: Try Delete Expense First (Most likely)
            let result = await db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
            if (result.changes > 0) return res.json({ message: "Deleted expense" });

            // Try Delete Income
            result = await db.run('DELETE FROM income WHERE id = ? AND user_id = ?', req.params.id, userRow.id);
            if (result.changes > 0) return res.json({ message: "Deleted income" });
        }

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

// --- Balances ---
router.get('/balances', async (req, res) => {
    try {
        const db = await openDb();
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', req.user.id);
        if (!userRow) return res.json([]);

        const balances = await db.all('SELECT * FROM balances WHERE user_id = ? ORDER BY created_at ASC', userRow.id);
        res.json(balances);
    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error fetching balances" });
    }
});

router.post('/balances', async (req, res) => {
    try {
        const db = await openDb();
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', req.user.id);
        if (!userRow) return res.status(404).json({ detail: "User not found" });

        const { title, currency, amount, color, emoji } = req.body;

        const result = await db.run(
            'INSERT INTO balances (user_id, title, currency, amount, color, emoji) VALUES (?, ?, ?, ?, ?, ?)',
            userRow.id, title, currency || 'UZS', amount || 0, color, emoji
        );

        res.json({ id: result.lastID, ...req.body });
    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error creating balance" });
    }
});

// --- Debt Ledger & Contacts ---
router.get('/debts/contacts', async (req, res) => {
    try {
        const db = await openDb();
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', req.user.id);
        if (!userRow) return res.json([]);

        const { currency } = req.query;

        // Fetch contacts
        const contacts = await db.all('SELECT * FROM debt_contacts WHERE user_id = ?', userRow.id);

        // Calculate Totals per Contact per Currency from Ledger
        // I_OWE = SUM(BORROW) - SUM(REPAY)
        // OWED_TO_ME = SUM(LEND) - SUM(RECEIVE)

        const result = [];

        for (const contact of contacts) {
            let query = `
                SELECT 
                    SUM(CASE WHEN type = 'BORROW' THEN amount ELSE 0 END) as borrowed,
                    SUM(CASE WHEN type = 'REPAY' THEN amount ELSE 0 END) as repaid,
                    SUM(CASE WHEN type = 'LEND' THEN amount ELSE 0 END) as lent,
                    SUM(CASE WHEN type = 'RECEIVE' THEN amount ELSE 0 END) as received
                FROM debt_ledger 
                WHERE contact_id = ? AND currency = ?
            `;

            // If currency filter is applied
            const cur = currency || 'UZS'; // Default to UZS if not specified, or loop through all? 
            // The UI requests per currency usually. Let's support 'UZS' and 'USD' iteration if no currency needed.

            const stats = await db.get(query, contact.id, cur);

            const i_owe = (stats.borrowed || 0) - (stats.repaid || 0);
            const owed_to_me = (stats.lent || 0) - (stats.received || 0);

            // Only return if relevant to the requested currency (or if we return all)
            // For now, simple approach: Return contact with calculated totals for requested currency
            result.push({
                ...contact,
                currency: cur,
                total_i_owe: i_owe > 0 ? i_owe : 0,
                total_owed_to_me: owed_to_me > 0 ? owed_to_me : 0
            });
        }

        res.json(result);

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error fetching debts" });
    }
});

router.post('/debts/ledger', async (req, res) => {
    try {
        const db = await openDb();
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', req.user.id);

        const { contact_id, name, type, amount, currency, date, note } = req.body;
        // type: BORROW, LEND, REPAY, RECEIVE

        let cId = contact_id;

        // Auto-create contact if name provided but no ID
        if (!cId && name) {
            const result = await db.run('INSERT INTO debt_contacts (user_id, name) VALUES (?, ?)', userRow.id, name);
            cId = result.lastID;
        }

        if (!cId) return res.status(400).json({ detail: "Contact required" });

        await db.run(
            'INSERT INTO debt_ledger (user_id, contact_id, type, amount, currency, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
            userRow.id, cId, type, amount, currency || 'UZS', date || new Date().toISOString(), note
        );

        res.json({ success: true, contact_id: cId });

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Error adding debt entry" });
    }
});

// --- Transfers ---
router.post('/transfers', async (req, res) => {
    try {
        const db = await openDb();
        const userRow = await db.get('SELECT id FROM users WHERE telegram_id = ?', req.user.id);

        const { from_balance_id, to_balance_id, amount, fee, date } = req.body;
        const feeAmount = fee || 0;

        // Atomic Transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // 1. Create Transfer Record
            const transResult = await db.run(
                'INSERT INTO transfers (user_id, from_balance_id, to_balance_id, amount, fee, date) VALUES (?, ?, ?, ?, ?, ?)',
                userRow.id, from_balance_id, to_balance_id, amount, feeAmount, date || new Date().toISOString()
            );
            const transferId = transResult.lastID;

            // 2. Create OUT Transaction (Expense from Source)
            await db.run(
                'INSERT INTO expenses (user_id, amount, description, category_id, balance_id, currency, transfer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                userRow.id, amount, 'Transfer Out', null, from_balance_id, 'UZS', transferId, date // Note: Category? Maybe 'Transfer' category needed
            );

            // 3. Create IN Transaction (Income to Dest)
            await db.run(
                'INSERT INTO income (user_id, amount, description, category_id, balance_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', // transfer_id on income?
                userRow.id, amount, 'Transfer In', null, to_balance_id, 'UZS', date // Missing transfer_id on income table in plan, but useful
            );

            // 4. Handle Fee (Expense)
            if (feeAmount > 0) {
                await db.run(
                    'INSERT INTO expenses (user_id, amount, description, category_id, balance_id, currency, transfer_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    userRow.id, feeAmount, 'Transfer Fee', null, from_balance_id, 'UZS', transferId, date
                );
            }

            // 5. Update Balance Amounts
            await db.run('UPDATE balances SET amount = amount - ? WHERE id = ?', amount + feeAmount, from_balance_id);
            await db.run('UPDATE balances SET amount = amount + ? WHERE id = ?', amount, to_balance_id);

            await db.run('COMMIT');
            res.json({ success: true });

        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ detail: "Transfer failed" });
    }
});

export default router;
