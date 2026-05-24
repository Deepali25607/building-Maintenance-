const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super_admin','committee','treasurer','resident','maintenance')),
      avatar_url TEXT,
      bio TEXT,
      move_in_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS flats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      block TEXT,
      flat_number TEXT NOT NULL,
      floor INTEGER,
      area_sqft INTEGER,
      monthly_rate REAL NOT NULL DEFAULT 0,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(apartment_id, block, flat_number)
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flat_id INTEGER NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      amount REAL NOT NULL,
      penalty REAL NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','partial')),
      paid_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(flat_id, period)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'online',
      reference TEXT,
      paid_at TEXT DEFAULT (datetime('now')),
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      flat_id INTEGER REFERENCES flats(id) ON DELETE SET NULL,
      raised_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','resolved','closed')),
      sla_hours INTEGER DEFAULT 48,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      service TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      description TEXT,
      invoice_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('draft','pending_approval','approved','paid','rejected')),
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id INTEGER,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

migrate();

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn("users", "avatar_url", "TEXT");
ensureColumn("users", "bio", "TEXT");
ensureColumn("users", "move_in_date", "TEXT");
ensureColumn("users", "occupation", "TEXT");
ensureColumn("users", "family_members", "TEXT");
ensureColumn("users", "emergency_contact", "TEXT");
ensureColumn("users", "vehicle_info", "TEXT");
ensureColumn("users", "permissions", "TEXT");
ensureColumn("announcements", "active_until", "TEXT");
ensureColumn("announcements", "completed", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("announcements", "completed_at", "TEXT");
ensureColumn("apartments", "theme_key", "TEXT");
ensureColumn("apartments", "theme_custom", "TEXT");
ensureColumn("apartments", "tagline", "TEXT");
ensureColumn("incidents", "attachments", "TEXT");
ensureColumn("flats", "opening_balance", "REAL NOT NULL DEFAULT 0");

// Seed a sensible default tagline if missing (one-off)
db.prepare("UPDATE apartments SET tagline = COALESCE(tagline, 'Premium Residences')").run();

module.exports = db;
