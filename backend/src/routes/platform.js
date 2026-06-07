const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePlatformAdmin } = require("../permissions");

const router = express.Router();

// The platform owner's public-facing contact/support details. These are the
// fields the operator can edit; everything else on the row is bookkeeping.
const SETTINGS_FIELDS = [
  "company_name",
  "sales_email",
  "sales_phone",
  "support_email",
  "support_phone",
  "whatsapp_number",
  "contact_message",
  "chatbot_greeting",
];

function getSettings() {
  return db.prepare("SELECT * FROM platform_settings WHERE id = 1").get() || {};
}

function publicContact(s) {
  return {
    company_name: s.company_name || "",
    sales_email: s.sales_email || "",
    sales_phone: s.sales_phone || "",
    support_email: s.support_email || "",
    support_phone: s.support_phone || "",
    whatsapp_number: s.whatsapp_number || "",
    contact_message: s.contact_message || "",
    chatbot_greeting: s.chatbot_greeting || "",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Public endpoints (no auth) ───────────────────────────────────────────
// Needed pre-auth on the trial-suspended screen, the in-app Contact page, and
// the chatbot greeting.

router.get("/contact", (_req, res) => {
  res.json({ contact: publicContact(getSettings()) });
});

// Submit a contact / sales enquiry. Deliberately public so a locked-out tenant
// (expired trial, no valid session) can still reach the sales team.
router.post("/contact-message", (req, res) => {
  const { name, email, phone, subject, message, org_code, source } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Your name is required" });
  if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: "A valid email is required" });
  if (!message || !String(message).trim()) return res.status(400).json({ error: "A message is required" });

  const allowedSources = ["contact", "chatbot", "trial_block"];
  const src = allowedSources.includes(source) ? source : "contact";

  const info = db.prepare(
    `INSERT INTO contact_messages (org_code, name, email, phone, subject, message, source)
     VALUES (?,?,?,?,?,?,?)`
  ).run(
    org_code ? String(org_code).trim() : null,
    String(name).trim(),
    String(email).trim(),
    phone ? String(phone).trim() : null,
    subject ? String(subject).trim() : null,
    String(message).trim(),
    src
  );
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// ─── Platform-admin only below ────────────────────────────────────────────
router.use(requireAuth, requirePlatformAdmin);

// Update the contact/support settings. Accepts a partial body — only provided
// fields change; omitted ones keep their current value.
router.put("/contact", (req, res) => {
  const cur = getSettings();
  const next = {};
  for (const f of SETTINGS_FIELDS) {
    next[f] = req.body && req.body[f] !== undefined ? String(req.body[f] ?? "") : (cur[f] ?? "");
  }
  db.prepare(
    `UPDATE platform_settings SET
       company_name = ?, sales_email = ?, sales_phone = ?, support_email = ?,
       support_phone = ?, whatsapp_number = ?, contact_message = ?, chatbot_greeting = ?,
       updated_at = datetime('now')
     WHERE id = 1`
  ).run(
    next.company_name, next.sales_email, next.sales_phone, next.support_email,
    next.support_phone, next.whatsapp_number, next.contact_message, next.chatbot_greeting
  );
  res.json({ contact: publicContact(getSettings()) });
});

// Inbox of inbound enquiries for the platform team.
router.get("/contact-messages", (_req, res) => {
  const messages = db.prepare(
    "SELECT * FROM contact_messages ORDER BY (status = 'new') DESC, created_at DESC, id DESC LIMIT 300"
  ).all();
  const unread = db.prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'").get().n;
  res.json({ messages, unread });
});

// Mark an enquiry read / handled (or back to new).
router.patch("/contact-messages/:id", (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!["new", "read", "handled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const ex = db.prepare("SELECT id FROM contact_messages WHERE id = ?").get(id);
  if (!ex) return res.status(404).json({ error: "Message not found" });
  db.prepare("UPDATE contact_messages SET status = ? WHERE id = ?").run(status, id);
  res.json({ ok: true });
});

module.exports = router;
