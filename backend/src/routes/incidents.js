const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, can, canAccessApartment } = require("../permissions");
const { requireFeature } = require("../features");
const {
  SLA_MATRIX, PRIORITIES, ESCALATION_MATRIX, MAX_ESCALATION_LEVEL,
  sanitizeMatrix, parseMatrix, defaultSlaHours, bumpPriority, slaStatus,
} = require("../sla");
const { notify, recipientsByRole, STAFF_ROLES } = require("../notifications");

// Roles allowed to configure community SLA policy.
const SLA_ADMIN_ROLES = ["org_admin", "committee"];

// The SLA matrix in force for an organization (custom or default).
function orgMatrix(apartmentId) {
  const row = db.prepare("SELECT sla_config FROM apartments WHERE id = ?").get(apartmentId);
  return parseMatrix(row?.sla_config);
}

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = [
  "Water Leakage",
  "Electrical Issue",
  "Security Issue",
  "Lift Issue",
  "Parking Issue",
  "Cleaning Issue",
  "Other",
];

router.get("/categories", (_req, res) => res.json({ categories: CATEGORIES }));

function parseAttachments(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

// Attach parsed attachments and the computed SLA standing to a row.
function decorateOne(r) {
  return { ...r, attachments: parseAttachments(r.attachments), sla: slaStatus(r) };
}
function decorate(rows) {
  return rows.map(decorateOne);
}

// Expose this org's SLA windows + escalation tiers, and whether the caller may edit.
router.get("/sla/config", requireFeature("sla"), (req, res) => {
  res.json({
    sla_matrix: orgMatrix(req.user.apartment_id),
    defaults: SLA_MATRIX,
    escalation_matrix: ESCALATION_MATRIX,
    editable: SLA_ADMIN_ROLES.includes(req.user.role),
  });
});

// Update this org's per-priority SLA windows. Admin/committee only.
router.put("/sla/config", requireFeature("sla"), (req, res) => {
  if (!SLA_ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Only an org admin or committee can change SLA settings" });
  }
  const incoming = req.body?.sla_matrix || req.body || {};
  // Reject values outside the allowed range rather than silently clamping.
  for (const p of PRIORITIES) {
    if (incoming[p] !== undefined) {
      const v = Number(incoming[p]);
      if (!Number.isFinite(v) || v < 1 || v > 8760) {
        return res.status(400).json({ error: `${p} SLA must be a whole number of hours between 1 and 8760` });
      }
    }
  }
  const matrix = sanitizeMatrix(incoming);
  db.prepare("UPDATE apartments SET sla_config = ? WHERE id = ?")
    .run(JSON.stringify(matrix), req.user.apartment_id);
  res.json({ sla_matrix: matrix });
});

router.get("/", requirePermission("incidents", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const where = ["i.apartment_id = ?"];
  const params = [apId];
  if (req.query.status) { where.push("i.status = ?"); params.push(req.query.status); }
  if (req.query.priority) { where.push("i.priority = ?"); params.push(req.query.priority); }
  if (req.user.role === "resident") { where.push("i.raised_by = ?"); params.push(req.user.id); }
  if (req.user.role === "maintenance") { where.push("i.assigned_to = ?"); params.push(req.user.id); }
  const incidents = db
    .prepare(
      `SELECT i.*, f.flat_number, f.block,
              ru.name AS raised_by_name,
              au.name AS assigned_to_name
       FROM incidents i
       LEFT JOIN flats f ON f.id = i.flat_id
       LEFT JOIN users ru ON ru.id = i.raised_by
       LEFT JOIN users au ON au.id = i.assigned_to
       WHERE ${where.join(" AND ")}
       ORDER BY
         CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         i.created_at DESC`
    )
    .all(...params);

  let decorated = decorate(incidents);

  // SLA standing summary across the (status/priority-filtered) set, computed
  // before any breached-only narrowing so the banner reflects the real totals.
  const summary = decorated.reduce(
    (acc, i) => {
      if (i.sla.state === "breached") acc.breached += 1;
      else if (i.sla.state === "due_soon") acc.due_soon += 1;
      if (i.escalation_level > 0) acc.escalated += 1;
      return acc;
    },
    { breached: 0, due_soon: 0, escalated: 0, total: decorated.length }
  );

  // Optional view: only complaints currently breaching SLA.
  if (req.query.breached === "1" || req.query.breached === "true") {
    decorated = decorated.filter((i) => i.sla.state === "breached");
  }

  res.json({ incidents: decorated, summary });
});

router.post("/", requirePermission("incidents", "create"), (req, res) => {
  const { category, title, description, priority = "medium", flat_id, sla_hours, attachments } = req.body || {};
  if (!category || !title) return res.status(400).json({ error: "category and title required" });
  // Default the SLA window from THIS ORG's priority matrix unless one is given explicitly.
  const effectiveSla = sla_hours == null || sla_hours === ""
    ? defaultSlaHours(priority, orgMatrix(req.user.apartment_id))
    : Number(sla_hours);
  let resolvedFlatId = flat_id;
  if (!resolvedFlatId && req.user.role === "resident") {
    const f = db.prepare("SELECT id FROM flats WHERE owner_id = ?").get(req.user.id);
    resolvedFlatId = f?.id || null;
  }
  const cleanAttachments = Array.isArray(attachments)
    ? attachments.filter((x) => typeof x === "string").slice(0, 10)
    : null;
  const info = db
    .prepare(
      `INSERT INTO incidents (apartment_id, flat_id, raised_by, category, title, description, priority, sla_hours, attachments)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.apartment_id, resolvedFlatId || null, req.user.id,
      category, title, description || null, priority, effectiveSla,
      cleanAttachments ? JSON.stringify(cleanAttachments) : null
    );
  const created = db.prepare("SELECT * FROM incidents WHERE id = ?").get(info.lastInsertRowid);
  // Notify the org's complaint-handling staff (not the person who raised it).
  notify({
    apartmentId: req.user.apartment_id,
    userIds: recipientsByRole(req.user.apartment_id, STAFF_ROLES),
    excludeUserId: req.user.id,
    type: "complaint_raised",
    title: "New complaint raised",
    body: `${category}: ${title}`,
    link: "/incidents",
  });
  res.status(201).json({ incident: decorateOne(created) });
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const incident = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  if (!incident) return res.status(404).json({ error: "Not found" });
  if (!canAccessApartment(req.user, incident.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  const { status, assigned_to, priority, description, attachments } = req.body || {};

  if (!can(req.user, "incidents", "edit")) {
    return res.status(403).json({ error: "Forbidden — missing permission: incidents.edit" });
  }

  let resolved_at = incident.resolved_at;
  let closed_at = incident.closed_at;
  if (status === "resolved" && !resolved_at) resolved_at = new Date().toISOString();
  if (status === "closed" && !closed_at) closed_at = new Date().toISOString();

  let finalStatus = status ?? incident.status;
  if (assigned_to && incident.status === "open") finalStatus = "assigned";

  const attachmentsJson = attachments === undefined
    ? undefined
    : Array.isArray(attachments)
      ? JSON.stringify(attachments.filter((x) => typeof x === "string").slice(0, 10))
      : null;

  db.prepare(
    `UPDATE incidents SET
       status = ?,
       assigned_to = COALESCE(?, assigned_to),
       priority = COALESCE(?, priority),
       description = COALESCE(?, description),
       resolved_at = ?,
       closed_at = ?,
       attachments = CASE WHEN ? IS NOT NULL THEN ? ELSE attachments END
     WHERE id = ?`
  ).run(
    finalStatus, assigned_to ?? null, priority ?? null, description ?? null, resolved_at, closed_at,
    attachmentsJson === undefined ? null : 1, attachmentsJson === undefined ? null : attachmentsJson,
    id
  );
  // Notify the resident who raised it when their complaint is marked resolved.
  if (finalStatus === "resolved" && incident.status !== "resolved" && incident.raised_by) {
    notify({
      apartmentId: incident.apartment_id, userIds: [incident.raised_by], excludeUserId: req.user.id,
      type: "complaint_resolved",
      title: "Complaint resolved",
      body: `Your complaint "${incident.title}" was marked resolved.`,
      link: "/incidents",
    });
  }

  const updated = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  res.json({ incident: decorateOne(updated) });
});

// Escalate a complaint up the matrix (BRD Module 6). Bumps escalation_level,
// stamps escalated_at, optionally raises priority a notch, and logs a comment.
router.post("/:id/escalate", requireFeature("sla"), (req, res) => {
  const id = Number(req.params.id);
  const incident = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  if (!incident) return res.status(404).json({ error: "Not found" });
  if (!canAccessApartment(req.user, incident.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  if (!can(req.user, "incidents", "edit")) {
    return res.status(403).json({ error: "Forbidden — missing permission: incidents.edit" });
  }
  if (["resolved", "closed"].includes(incident.status)) {
    return res.status(400).json({ error: "Cannot escalate a resolved or closed complaint" });
  }
  if (incident.escalation_level >= MAX_ESCALATION_LEVEL) {
    return res.status(400).json({ error: "Already at the highest escalation level" });
  }

  const nextLevel = incident.escalation_level + 1;
  const raisePriority = req.body?.raise_priority !== false; // default: also bump priority
  const newPriority = raisePriority ? bumpPriority(incident.priority) : incident.priority;
  const tier = ESCALATION_MATRIX.find((t) => t.level === nextLevel);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE incidents SET escalation_level = ?, escalated_at = ?, priority = ? WHERE id = ?"
    ).run(nextLevel, now, newPriority, id);
    db.prepare(
      "INSERT INTO incident_comments (incident_id, user_id, body) VALUES (?,?,?)"
    ).run(
      id, req.user.id,
      `⏫ Escalated to level ${nextLevel} (${tier?.label || "next tier"})` +
        (raisePriority && newPriority !== incident.priority ? ` · priority raised to ${newPriority}` : "")
    );
  });
  tx();

  const updated = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  res.json({ incident: decorateOne(updated) });
});

router.get("/:id/comments", (req, res) => {
  const id = Number(req.params.id);
  const incident = db.prepare("SELECT apartment_id FROM incidents WHERE id = ?").get(id);
  if (!incident) return res.status(404).json({ error: "Incident not found" });
  if (!canAccessApartment(req.user, incident.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.role AS author_role
       FROM incident_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.incident_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(id);
  res.json({ comments });
});

router.post("/:id/comments", (req, res) => {
  const id = Number(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "body required" });
  const incident = db.prepare("SELECT apartment_id FROM incidents WHERE id = ?").get(id);
  if (!incident) return res.status(404).json({ error: "Incident not found" });
  if (!canAccessApartment(req.user, incident.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  const info = db
    .prepare("INSERT INTO incident_comments (incident_id, user_id, body) VALUES (?,?,?)")
    .run(id, req.user.id, body);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
