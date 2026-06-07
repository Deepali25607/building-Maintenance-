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
      role TEXT NOT NULL CHECK (role IN ('super_admin','org_admin','committee','treasurer','resident','maintenance')),
      avatar_url TEXT,
      bio TEXT,
      move_in_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Apartment structure hierarchy (BRD Module 3): Organization → Tower → Floor → Flat.
    -- A tower belongs to one organization; flats optionally reference a tower.
    CREATE TABLE IF NOT EXISTS towers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT,
      total_floors INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(apartment_id, name)
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

    -- Per-recipient in-app notifications (BRD Module 12). One row per user per
    -- event; external channels (email/SMS/WhatsApp/push) fan out from here.
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Visitor management: gate/security logs a visitor and selects the flat they
    -- want to meet; the flat's resident (host) is notified to approve/deny. Status
    -- walks the gate lifecycle. host_user_id defaults to the flat owner.
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      flat_id INTEGER REFERENCES flats(id) ON DELETE SET NULL,
      host_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      phone TEXT,
      purpose TEXT,
      vehicle_no TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','denied','checked_in','checked_out','expired')),
      logged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expected_at TEXT,
      approved_at TEXT,
      checked_in_at TEXT,
      checked_out_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Platform-operator (SaaS owner) contact/support settings — a single row (id=1).
    -- Surfaced on the trial-suspended screen, the in-app Contact page, and the chatbot.
    -- Editable only by the platform admin.
    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT,
      sales_email TEXT,
      sales_phone TEXT,
      support_email TEXT,
      support_phone TEXT,
      whatsapp_number TEXT,
      contact_message TEXT,
      chatbot_greeting TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Inbound enquiries from tenants — contact form, chatbot escalation, or the
    -- trial-block screen. The platform admin reads these from the Platform area.
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      org_code TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'contact',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','handled')),
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
// Optional app-wide background image for the community (URL). Set by org admins.
ensureColumn("apartments", "background_url", "TEXT");
// Human-readable, unique Organization ID per the multi-tenant BRD (e.g. ORG001).
// Derived from the numeric PK so it's stable and collision-free; the numeric id
// stays the real foreign key everywhere — org_code is a display/identity handle.
ensureColumn("apartments", "org_code", "TEXT");
// Subscription plan per the BRD (starter/professional/enterprise). Drives the
// flat-count cap enforced on flat creation. See backend/src/plans.js.
ensureColumn("apartments", "plan", "TEXT NOT NULL DEFAULT 'starter'");
// When plan = 'trial', the ISO date the free trial ends. NULL for paid plans.
ensureColumn("apartments", "trial_ends_at", "TEXT");
// Per-organization SLA windows by priority (JSON, e.g. {"urgent":4,...}).
// NULL falls back to the global defaults in backend/src/sla.js.
ensureColumn("apartments", "sla_config", "TEXT");
ensureColumn("incidents", "attachments", "TEXT");
// Escalation matrix tracking (BRD Module 6). Level 0 = not escalated; each
// escalation bumps the level and stamps escalated_at. See backend/src/sla.js.
ensureColumn("incidents", "escalation_level", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("incidents", "escalated_at", "TEXT");
ensureColumn("flats", "opening_balance", "REAL NOT NULL DEFAULT 0");
// Link a flat to its tower (BRD Module 3). Nullable — flats can be unassigned,
// and deleting a tower sets this back to NULL rather than removing flats.
ensureColumn("flats", "tower_id", "INTEGER REFERENCES towers(id) ON DELETE SET NULL");

// One-off: widen the users.role CHECK to allow the multi-tenant org_admin role.
// SQLite can't ALTER a CHECK in place, so swap the table when the old constraint
// is detected. Safe to run on every boot — it's a no-op if already migrated.
(function migrateRoleCheck() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get();
  if (!row || !row.sql) return;
  if (row.sql.includes("'org_admin'")) return; // already migrated

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('super_admin','org_admin','committee','treasurer','resident','maintenance')),
        avatar_url TEXT,
        bio TEXT,
        move_in_date TEXT,
        occupation TEXT,
        family_members TEXT,
        emergency_contact TEXT,
        vehicle_info TEXT,
        permissions TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (id, apartment_id, name, email, phone, password_hash, role,
                             avatar_url, bio, move_in_date, occupation, family_members,
                             emergency_contact, vehicle_info, permissions, active, created_at)
      SELECT id, apartment_id, name, email, phone, password_hash, role,
             avatar_url, bio, move_in_date, occupation, family_members,
             emergency_contact, vehicle_info, permissions, active, created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  });
  // Foreign keys must be off during a table swap or referencing rows break.
  db.pragma("foreign_keys = OFF");
  try { tx(); } finally { db.pragma("foreign_keys = ON"); }
  console.log("Migrated users.role CHECK to allow org_admin.");
})();

// Seed a sensible default tagline if missing (one-off)
db.prepare("UPDATE apartments SET tagline = COALESCE(tagline, 'Premium Residences')").run();

// Backfill an Organization ID for any apartment that predates the org_code column.
// printf('ORG%03d', id) yields ORG001, ORG010, ORG100, ORG1000… — unique because id is.
db.prepare("UPDATE apartments SET org_code = printf('ORG%03d', id) WHERE org_code IS NULL OR org_code = ''").run();
// Enforce uniqueness so two orgs can never share a code.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_apartments_org_code ON apartments(org_code)");
// Fast unread lookups for the notification bell.
db.exec("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at)");
// Visitor lookups: by org/status for the gate log, by host for a resident's feed.
db.exec("CREATE INDEX IF NOT EXISTS idx_visitors_org ON visitors(apartment_id, status, created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_visitors_host ON visitors(host_user_id, status)");

// WhatsApp business number for the chatbot "Chat on WhatsApp" hand-off (added later).
ensureColumn("platform_settings", "whatsapp_number", "TEXT");

// Seed the single platform-settings row with placeholders the operator edits later.
// INSERT OR IGNORE keeps existing edits intact across restarts.
db.prepare(`INSERT OR IGNORE INTO platform_settings
  (id, company_name, sales_email, sales_phone, support_email, support_phone, whatsapp_number, contact_message, chatbot_greeting)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
  "Apartment Management Platform",
  "sales@apartmentplatform.com",
  "+91 98765 43210",
  "support@apartmentplatform.com",
  "+91 98765 43211",
  "+91 98765 43210",
  "Have a question, need help, or want to upgrade your plan? Our team is here for you.",
  "Hi! 👋 I'm your assistant. Ask me about billing, plans, or technical help — or I can connect you with our team."
);
// Backfill a WhatsApp number for the pre-existing settings row (column added after seed).
db.prepare("UPDATE platform_settings SET whatsapp_number = COALESCE(whatsapp_number, '+91 98765 43210') WHERE id = 1").run();

module.exports = db;
