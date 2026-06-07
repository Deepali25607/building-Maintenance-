const db = require("./db");

// Notification engine (BRD Module 12).
//
// The in-app notification IS the `notifications` row — always delivered. External
// channels are PLUGGABLE adapters: each is "enabled" only when its credentials
// are configured (env), otherwise it cleanly no-ops. To ship a real integration
// later, fill in a `send()` here — no call site changes needed.
const CHANNELS = [
  { name: "email", enabled: () => !!process.env.SMTP_URL, send: (_n, _u) => {} },
  { name: "sms", enabled: () => !!process.env.SMS_API_KEY, send: (_n, _u) => {} },
  { name: "whatsapp", enabled: () => !!process.env.WHATSAPP_API_KEY, send: (_n, _u) => {} },
  { name: "push", enabled: () => !!process.env.PUSH_PUBLIC_KEY, send: (_n, _u) => {} },
];

function safeEnabled(c) {
  try { return !!c.enabled(); } catch { return false; }
}

// Status of every channel — drives an admin/diagnostics view.
function channelStatus() {
  return [
    { name: "in_app", configured: true },
    ...CHANNELS.map((c) => ({ name: c.name, configured: safeEnabled(c) })),
  ];
}

const insertNotif = db.prepare(
  "INSERT INTO notifications (apartment_id, user_id, type, title, body, link) VALUES (?,?,?,?,?,?)"
);

// Create in-app notifications for a set of recipients and fan out to enabled
// external channels. Best-effort: never throws into the caller's request flow.
// Returns the number of recipients notified in-app.
function notify({ apartmentId, userIds, type, title, body = null, link = null, excludeUserId = null }) {
  const ids = [...new Set((userIds || []).filter((id) => id && id !== excludeUserId))];
  if (!apartmentId || ids.length === 0) return 0;

  try {
    db.transaction(() => {
      for (const uid of ids) insertNotif.run(apartmentId, uid, type, title, body, link);
    })();
  } catch (e) {
    console.error("notify(): in-app insert failed:", e.message);
    return 0;
  }

  const active = CHANNELS.filter(safeEnabled);
  if (active.length) {
    try {
      const placeholders = ids.map(() => "?").join(",");
      const users = db.prepare(
        `SELECT id, name, email, phone FROM users WHERE id IN (${placeholders})`
      ).all(...ids);
      for (const u of users) {
        for (const c of active) {
          try { c.send({ type, title, body, link }, u); }
          catch (e) { console.error(`notify(): channel ${c.name} failed:`, e.message); }
        }
      }
    } catch (e) {
      console.error("notify(): external fan-out failed:", e.message);
    }
  }
  return ids.length;
}

// ── Recipient helpers ─────────────────────────────────────────────────────
function recipientsByRole(apartmentId, roles) {
  if (!apartmentId || !roles || !roles.length) return [];
  const ph = roles.map(() => "?").join(",");
  return db.prepare(
    `SELECT id FROM users WHERE apartment_id = ? AND active = 1 AND role IN (${ph})`
  ).all(apartmentId, ...roles).map((r) => r.id);
}

function allActiveUsers(apartmentId) {
  if (!apartmentId) return [];
  return db.prepare("SELECT id FROM users WHERE apartment_id = ? AND active = 1").all(apartmentId).map((r) => r.id);
}

// Roles that handle/triage complaints within an org.
const STAFF_ROLES = ["org_admin", "committee", "treasurer"];

module.exports = { notify, recipientsByRole, allActiveUsers, channelStatus, STAFF_ROLES };
