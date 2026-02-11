
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

        CREATE TABLE IF NOT EXISTS categories(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id BIGINT,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- 'income' or 'expense'
            icon TEXT DEFAULT '📦',
        color TEXT DEFAULT '#3b82f6',
        is_default BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(telegram_id)
    );

        CREATE TABLE IF NOT EXISTS income(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount DECIMAL(10, 2),
        description TEXT,
        category_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
    );

        CREATE TABLE IF NOT EXISTS expenses(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount DECIMAL(10, 2),
        description TEXT,
        category_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(category_id) REFERENCES categories(id)
    );
    `);

    // Safe Column Migration (sqlite doesn't support IF NOT EXISTS in ALTER COLUMN)
    try {
        await db.exec("ALTER TABLE income ADD COLUMN category_id INTEGER REFERENCES categories(id)");
    } catch (e) { /* Column likely exists */ }

    try {
        await db.exec("ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)");
    } catch (e) { /* Column likely exists */ }

    // Cleanup unwanted categories
    await db.run("DELETE FROM categories WHERE name = 'Kafe/Restoran' AND icon = 'xxxx'");
    await db.run("UPDATE categories SET icon = '💼' WHERE name = 'Biznes' AND icon = 'xxxx'");

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
