
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Initialize database
async function openDb() {
    return open({
        filename: './db.sqlite',
        driver: sqlite3.Database
    });
}
async function initDb() {
    const db = await openDb();
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id BIGINT UNIQUE,
            username TEXT,
            status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
            active_mode TEXT DEFAULT 'construction', -- 'personal', 'construction'
            current_project_id INTEGER REFERENCES projects(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS balances(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL, -- e.g. "Naqd", "Humo"
            currency TEXT DEFAULT 'UZS', -- 'UZS', 'USD'
            amount DECIMAL(15, 2) DEFAULT 0,
            emoji TEXT,
            color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS debt_contacts(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS debt_ledger(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            contact_id INTEGER,
            type TEXT NOT NULL CHECK(type IN ('BORROW', 'LEND', 'REPAY', 'RECEIVE')),
            amount DECIMAL(15, 2) NOT NULL CHECK (amount >= 0),
            currency TEXT DEFAULT 'UZS',
            date DATE NOT NULL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(contact_id) REFERENCES debt_contacts(id)
        );

        CREATE TABLE IF NOT EXISTS transfers(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            from_balance_id INTEGER,
            to_balance_id INTEGER,
            amount DECIMAL(15, 2) NOT NULL,
            fee DECIMAL(15, 2) DEFAULT 0,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(from_balance_id) REFERENCES balances(id),
            FOREIGN KEY(to_balance_id) REFERENCES balances(id)
        );

        CREATE TABLE IF NOT EXISTS categories(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id BIGINT,
            name TEXT NOT NULL,
            type TEXT NOT NULL, -- 'income', 'expense'
            scope TEXT DEFAULT 'construction', -- 'personal', 'construction'
            icon TEXT DEFAULT '📦',
            color TEXT DEFAULT '#3b82f6',
            is_default BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(telegram_id)
        );

        CREATE TABLE IF NOT EXISTS income(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount DECIMAL(15, 2),
            description TEXT,
            category_id INTEGER,
            project_id INTEGER,
            balance_id INTEGER,
            currency TEXT DEFAULT 'UZS',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(category_id) REFERENCES categories(id),
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(balance_id) REFERENCES balances(id),
            CHECK (balance_id IS NULL OR (balance_id IS NOT NULL AND project_id IS NULL))
        );

        CREATE TABLE IF NOT EXISTS expenses(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount DECIMAL(15, 2),
            description TEXT,
            category_id INTEGER,
            project_id INTEGER, -- Link to project
            balance_id INTEGER,
            currency TEXT DEFAULT 'UZS',
            transfer_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(category_id) REFERENCES categories(id),
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(balance_id) REFERENCES balances(id),
            CHECK (balance_id IS NULL OR (balance_id IS NOT NULL AND project_id IS NULL))
        );

        CREATE TABLE IF NOT EXISTS projects(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id BIGINT,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(telegram_id)
        );
    `);

    // Safe Column Migrations for Users
    try { await db.exec("ALTER TABLE users ADD COLUMN active_mode TEXT DEFAULT 'construction'"); } catch (e) { }
    try { await db.exec("ALTER TABLE users ADD COLUMN current_project_id INTEGER REFERENCES projects(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'"); } catch (e) { } // Legacy fix

    // Safe Column Migrations for Categories
    try { await db.exec("ALTER TABLE categories ADD COLUMN scope TEXT DEFAULT 'construction'"); } catch (e) { }

    // Safe Column Migrations for Income
    try { await db.exec("ALTER TABLE income ADD COLUMN category_id INTEGER REFERENCES categories(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE income ADD COLUMN project_id INTEGER REFERENCES projects(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE income ADD COLUMN balance_id INTEGER REFERENCES balances(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE income ADD COLUMN currency TEXT DEFAULT 'UZS'"); } catch (e) { }

    // Safe Column Migrations for Expenses
    try { await db.exec("ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE expenses ADD COLUMN project_id INTEGER REFERENCES projects(id)"); } catch (e) { } // Legacy fix
    try { await db.exec("ALTER TABLE expenses ADD COLUMN balance_id INTEGER REFERENCES balances(id)"); } catch (e) { }
    try { await db.exec("ALTER TABLE expenses ADD COLUMN currency TEXT DEFAULT 'UZS'"); } catch (e) { }
    try { await db.exec("ALTER TABLE expenses ADD COLUMN transfer_id INTEGER REFERENCES transfers(id)"); } catch (e) { }


    // Cleanup unwanted categories (Legacy)
    await db.run("DELETE FROM categories WHERE name = 'Kafe/Restoran' AND icon = 'xxxx'");
    await db.run("UPDATE categories SET icon = '💼' WHERE name = 'Biznes' AND icon = 'xxxx'");

    // Seed Default Balances (Naqd - UZS) for ALL Users who don't have one
    const users = await db.all("SELECT id FROM users");
    for (const user of users) {
        const balance = await db.get("SELECT id FROM balances WHERE user_id = ? AND title = 'Naqd'", user.id);
        if (!balance) {
            await db.run("INSERT INTO balances (user_id, title, currency, amount, emoji, color) VALUES (?, 'Naqd', 'UZS', 0, '💵', '#10b981')", user.id);
            console.log(`✅ Default 'Naqd' balance created for user ${user.id}`);
        }
    }

    // Seed Default Categories
    const catCount = await db.get('SELECT COUNT(*) as count FROM categories');
    if (catCount.count === 0) {
        const defaultCats = [
            { name: 'Oylik', type: 'income', icon: '💰', color: '#10b981' },
            { name: 'Biznes', type: 'income', icon: '💼', color: '#3b82f6' },
            { name: 'Sovg\'a', type: 'income', icon: '🎁', color: '#8b5cf6' },
            { name: 'Oziq-ovqat', type: 'expense', icon: '🛒', color: '#f59e0b' },
            { name: 'Transport', type: 'expense', icon: '🚕', color: '#ef4444' },
            { name: 'Uy-ro\'zg\'or', type: 'expense', icon: '🏠', color: '#6366f1' },
            { name: 'Kiyim-kechak', type: 'expense', icon: '👕', color: '#ec4899' },
            { name: 'Ta\'lim', type: 'expense', icon: '📚', color: '#14b8a6' },
            { name: 'Sog\'liq', type: 'expense', icon: '💊', color: '#ef4444' }
        ];

        const stmt = await db.prepare('INSERT INTO categories (name, type, icon, color, is_default) VALUES (?, ?, ?, ?, 1)');
        for (const cat of defaultCats) {
            await stmt.run(cat.name, cat.type, cat.icon, cat.color);
        }
        await stmt.finalize();
        console.log('✅ Default categories seeded');
    }

    console.log('Database initialized');
    return db;
}

export { openDb, initDb };
