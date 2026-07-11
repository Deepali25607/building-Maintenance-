const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, can, canAccessApartment } = require("../permissions");
const { requireFeature } = require("../features");
const { notify } = require("../notifications");

// Smart Daily Visitor Management — RECURRING service providers (maids, cooks,
// drivers, sweepers, milkmen…) with automatic IN/OUT attendance. Face descriptors
// (128-float vectors) are computed in the browser at enrollment; the kiosk posts
// a live descriptor and we match it here against the org's enrolled staff.
// Manual punch stays available as a fallback for gate staff.
const router = express.Router();
router.use(requireAuth);
router.use(requireFeature("staff"));

// Built-in service types. Orgs can add their own on top — stored as a JSON
// array of {key,label,icon} in apartments.staff_categories.
const BUILTIN_CATEGORIES = [
  "maid", "cook", "driver", "sweeper", "gardener", "electrician", "plumber",
  "milkman", "newspaper", "laundry", "nanny", "tutor", "carpenter", "other",
];

function customCategories(apartmentId) {
  const row = db.prepare("SELECT staff_categories FROM apartments WHERE id = ?").get(apartmentId);
  try {
    const arr = JSON.parse(row?.staff_categories || "[]");
    return Array.isArray(arr) ? arr.filter((c) => c && c.key) : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(apartmentId, list) {
  db.prepare("UPDATE apartments SET staff_categories = ? WHERE id = ?")
    .run(JSON.stringify(list), apartmentId);
}

function categoryKeys(apartmentId) {
  return [...BUILTIN_CATEGORIES, ...customCategories(apartmentId).map((c) => c.key)];
}

// Full list for pickers: built-ins (client owns their labels/icons) + org custom.
function categoryList(apartmentId) {
  return [
    ...BUILTIN_CATEGORIES.map((key) => ({ key, custom: false })),
    ...customCategories(apartmentId).map((c) => ({
      key: c.key, label: c.label || c.key, icon: c.icon || null, custom: true,
    })),
  ];
}

function resolveCategory(apartmentId, category) {
  return categoryKeys(apartmentId).includes(category) ? category : "other";
}

// Euclidean distance between two same-length face descriptors. face-api.js
// convention: < ~0.5 is a confident same-person match, > 0.6 a different person.
const MATCH_THRESHOLD = 0.52;
// Ignore repeat punches within this window (the kiosk scans continuously and
// the same face lingering in frame must not toggle IN/OUT/IN…).
const PUNCH_COOLDOWN_SECONDS = 90;

// "Managers" = anyone who can run the kiosk / edit staff (org_admin, committee,
// maintenance/gate). Residents only see helpers assigned to their own flats.
function isManager(user) {
  return can(user, "staff", "edit");
}

function parseDescriptor(x) {
  if (!Array.isArray(x) || x.length !== 128) return null;
  const out = new Array(128);
  for (let i = 0; i < 128; i++) {
    const v = Number(x[i]);
    if (!Number.isFinite(v)) return null;
    out[i] = v;
  }
  return out;
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function localToday() {
  return db.prepare("SELECT date('now','localtime') AS d").get().d;
}

function flatLabel(block, flatNumber) {
  return `${block ? block + "-" : ""}${flatNumber || ""}`;
}

// Flats (with owners) a staff member serves — for cards and notifications.
const flatsForStaff = db.prepare(
  `SELECT f.id, f.block, f.flat_number, f.owner_id, u.name AS owner_name
     FROM staff_flats sf
     JOIN flats f ON f.id = sf.flat_id
     LEFT JOIN users u ON u.id = f.owner_id
    WHERE sf.staff_id = ?
    ORDER BY f.block, f.flat_number`
);

// Public shape: never ship the raw face descriptor back out — clients only need
// to know whether a face is enrolled.
function publicStaff(row) {
  if (!row) return null;
  const { face_descriptor, ...rest } = row;
  return {
    ...rest,
    face_enrolled: !!face_descriptor,
    flats: flatsForStaff.all(row.id).map((f) => ({ ...f, label: flatLabel(f.block, f.flat_number) })),
  };
}

function getStaff(id) {
  return db.prepare("SELECT * FROM staff WHERE id = ?").get(id);
}

// Validate + replace a staff member's flat assignments (all must be in-org).
function setStaffFlats(staffId, apartmentId, flatIds) {
  if (!Array.isArray(flatIds)) return { error: null }; // not provided — leave as-is
  const clean = [...new Set(flatIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  for (const fid of clean) {
    const f = db.prepare("SELECT id, apartment_id FROM flats WHERE id = ?").get(fid);
    if (!f || f.apartment_id !== apartmentId) return { error: "Invalid flat for this organization" };
  }
  db.transaction(() => {
    db.prepare("DELETE FROM staff_flats WHERE staff_id = ?").run(staffId);
    const ins = db.prepare("INSERT INTO staff_flats (staff_id, flat_id) VALUES (?,?)");
    for (const fid of clean) ins.run(staffId, fid);
  })();
  return { error: null };
}

// ─── Punch engine ─────────────────────────────────────────────────────────
// The kiosk runs in an explicit IN or OUT mode (`direction`); manual buttons
// also send the direction they show. With no direction we fall back to toggle
// semantics (open session today → OUT, else IN). Multiple sessions per day are
// expected (milkman morning + evening).
// Returns { direction, session, duplicate, noop, reason }:
//   duplicate — nothing changed (cooldown re-scan, or already IN when IN asked)
//   noop/not_in — OUT asked but there's no open session to close
function punch(staff, method, confidence, byUserId, direction = null) {
  const today = localToday();

  const open = db.prepare(
    "SELECT * FROM staff_attendance WHERE staff_id = ? AND date = ? AND out_at IS NULL ORDER BY id DESC LIMIT 1"
  ).get(staff.id, today);
  const want = direction === "in" || direction === "out" ? direction : (open ? "out" : "in");

  // Cooldown: the face loop re-recognizes the same lingering face within
  // seconds. With an explicit direction, only same-direction repeats are
  // suppressed — a quick IN followed by a deliberate OUT is legitimate.
  const last = db.prepare(
    "SELECT * FROM staff_attendance WHERE staff_id = ? ORDER BY id DESC LIMIT 1"
  ).get(staff.id);
  if (last) {
    const lastDirection = last.out_at ? "out" : "in";
    const lastTs = last.out_at || last.in_at;
    const { s } = db.prepare(
      "SELECT (julianday(datetime('now')) - julianday(?)) * 86400.0 AS s"
    ).get(lastTs);
    const withinCooldown = s != null && s < PUNCH_COOLDOWN_SECONDS;
    if (withinCooldown && (!direction || lastDirection === want)) {
      return { direction: lastDirection, session: last, duplicate: true };
    }
  }

  if (want === "in" && open) {
    return { direction: "in", session: open, duplicate: true, reason: "already_in" };
  }
  if (want === "out" && !open) {
    return { direction: "out", session: null, noop: true, reason: "not_in" };
  }

  let session;
  if (want === "out") {
    db.prepare(
      "UPDATE staff_attendance SET out_at = datetime('now'), out_method = ?, out_confidence = ? WHERE id = ?"
    ).run(method, confidence, open.id);
    session = db.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(open.id);
  } else {
    const info = db.prepare(
      `INSERT INTO staff_attendance (apartment_id, staff_id, date, in_method, in_confidence, marked_by)
       VALUES (?,?,?,?,?,?)`
    ).run(staff.apartment_id, staff.id, today, method, confidence, byUserId || null);
    session = db.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(info.lastInsertRowid);
  }

  // Tell the residents this helper works for. Best-effort, never blocks the punch.
  const owners = flatsForStaff.all(staff.id).map((f) => f.owner_id).filter(Boolean);
  if (owners.length) {
    const when = new Date(`${(want === "in" ? session.in_at : session.out_at).replace(" ", "T")}Z`)
      .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    notify({
      apartmentId: staff.apartment_id,
      userIds: owners,
      type: want === "in" ? "staff_checked_in" : "staff_checked_out",
      title: want === "in" ? "Your helper has arrived" : "Your helper has left",
      body: `${staff.name} (${staff.category}) checked ${want.toUpperCase()} at ${when}${method === "face" ? " · verified by Face ID" : ""}.`,
      link: "/staff",
      excludeUserId: byUserId,
    });
  }

  return { direction: want, session, duplicate: false };
}

// ─── Directory ────────────────────────────────────────────────────────────

// Minimal flat picker for assignment (mirrors visitors/flat-options — avoids
// granting flats.view to gate staff).
router.get("/flat-options", requirePermission("staff", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.json({ flats: [] });
  const rows = db.prepare(
    `SELECT f.id, f.block, f.flat_number, f.owner_id, u.name AS owner_name
       FROM flats f LEFT JOIN users u ON u.id = f.owner_id
      WHERE f.apartment_id = ?
      ORDER BY f.block, f.flat_number`
  ).all(apId);
  res.json({ flats: rows.map((r) => ({ ...r, label: flatLabel(r.block, r.flat_number) })) });
});

// List staff. Managers see the whole org; residents only helpers assigned to
// flats they own. Each row carries today's live status for the register view.
router.get("/", requirePermission("staff", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.json({ staff: [], categories: BUILTIN_CATEGORIES.map((key) => ({ key, custom: false })) });

  const rows = isManager(req.user)
    ? db.prepare("SELECT * FROM staff WHERE apartment_id = ? ORDER BY active DESC, name").all(apId)
    : db.prepare(
        `SELECT DISTINCT s.* FROM staff s
           JOIN staff_flats sf ON sf.staff_id = s.id
           JOIN flats f ON f.id = sf.flat_id
          WHERE s.apartment_id = ? AND f.owner_id = ?
          ORDER BY s.active DESC, s.name`
      ).all(apId, req.user.id);

  const today = localToday();
  const todayRows = db.prepare(
    "SELECT * FROM staff_attendance WHERE apartment_id = ? AND date = ? ORDER BY id"
  ).all(apId, today);
  const byStaff = {};
  for (const a of todayRows) (byStaff[a.staff_id] ||= []).push(a);

  const staff = rows.map((r) => {
    const sessions = byStaff[r.id] || [];
    const lastSession = sessions[sessions.length - 1] || null;
    return {
      ...publicStaff(r),
      today: {
        sessions,
        status: !lastSession ? "absent" : lastSession.out_at ? "left" : "inside",
      },
    };
  });

  res.json({ staff, categories: categoryList(apId), date: today });
});

// Register a service provider (optionally with a face enrolled at creation).
router.post("/", requirePermission("staff", "create"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "No organization context" });

  const { name, category, phone, address, id_proof, photo_url, notes, face_descriptor, flat_ids } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });

  const cat = resolveCategory(apId, category);
  let descriptor = null;
  if (face_descriptor != null) {
    descriptor = parseDescriptor(face_descriptor);
    if (!descriptor) return res.status(400).json({ error: "Invalid face descriptor — re-scan the face" });
  }

  const info = db.prepare(
    `INSERT INTO staff (apartment_id, name, category, phone, address, id_proof, photo_url, notes,
                        face_descriptor, face_enrolled_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    apId, String(name).trim(), cat,
    phone ? String(phone).trim() : null,
    address ? String(address).trim() : null,
    id_proof ? String(id_proof).trim() : null,
    photo_url ? String(photo_url).trim() : null,
    notes ? String(notes).trim() : null,
    descriptor ? JSON.stringify(descriptor) : null,
    descriptor ? new Date().toISOString() : null,
    req.user.id
  );

  const { error } = setStaffFlats(info.lastInsertRowid, apId, flat_ids);
  if (error) {
    db.prepare("DELETE FROM staff WHERE id = ?").run(info.lastInsertRowid);
    return res.status(400).json({ error });
  }

  res.status(201).json({ staff: publicStaff(getStaff(info.lastInsertRowid)) });
});

// Update details, re-enroll or clear the face, reassign flats, activate/deactivate.
router.patch("/:id", requirePermission("staff", "edit"), (req, res) => {
  const s = getStaff(Number(req.params.id));
  if (!s) return res.status(404).json({ error: "Staff member not found" });
  if (!canAccessApartment(req.user, s.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }

  const b = req.body || {};
  const sets = [];
  const vals = [];
  const strField = (key) => {
    if (b[key] === undefined) return;
    sets.push(`${key} = ?`);
    vals.push(b[key] ? String(b[key]).trim() : null);
  };
  if (b.name !== undefined) {
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: "Name is required" });
    sets.push("name = ?");
    vals.push(String(b.name).trim());
  }
  if (b.category !== undefined) {
    sets.push("category = ?");
    vals.push(resolveCategory(s.apartment_id, b.category));
  }
  strField("phone"); strField("address"); strField("id_proof"); strField("photo_url"); strField("notes");
  if (b.active !== undefined) {
    sets.push("active = ?");
    vals.push(b.active ? 1 : 0);
  }
  if (b.face_descriptor !== undefined) {
    if (b.face_descriptor === null) {
      sets.push("face_descriptor = NULL", "face_enrolled_at = NULL");
    } else {
      const d = parseDescriptor(b.face_descriptor);
      if (!d) return res.status(400).json({ error: "Invalid face descriptor — re-scan the face" });
      sets.push("face_descriptor = ?", "face_enrolled_at = ?");
      vals.push(JSON.stringify(d), new Date().toISOString());
    }
  }

  if (sets.length) {
    db.prepare(`UPDATE staff SET ${sets.join(", ")} WHERE id = ?`).run(...vals, s.id);
  }
  const { error } = setStaffFlats(s.id, s.apartment_id, b.flat_ids);
  if (error) return res.status(400).json({ error });

  res.json({ staff: publicStaff(getStaff(s.id)) });
});

router.delete("/:id", requirePermission("staff", "delete"), (req, res) => {
  const s = getStaff(Number(req.params.id));
  if (!s) return res.status(404).json({ error: "Staff member not found" });
  if (!canAccessApartment(req.user, s.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  db.prepare("DELETE FROM staff WHERE id = ?").run(s.id);
  res.json({ ok: true });
});

// ─── Service types (categories) ───────────────────────────────────────────

// Add an org-defined service type, e.g. "Yoga Trainer" 🧘. The key is a slug
// derived from the label; built-in keys can't be shadowed.
router.post("/categories", requirePermission("staff", "create"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "No organization context" });

  const label = String(req.body?.label || "").trim();
  if (!label) return res.status(400).json({ error: "Service type name is required" });
  if (label.length > 40) return res.status(400).json({ error: "Service type name is too long (max 40)" });
  const icon = req.body?.icon ? String(req.body.icon).trim().slice(0, 8) : null;

  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  if (!key) return res.status(400).json({ error: "Service type name must contain letters or numbers" });
  if (categoryKeys(apId).includes(key)) {
    return res.status(409).json({ error: "A service type with this name already exists" });
  }

  const list = customCategories(apId);
  list.push({ key, label, icon });
  saveCustomCategories(apId, list);

  res.status(201).json({ key, categories: categoryList(apId) });
});

// Remove an org-defined type. Built-ins can't be removed. Staff already using
// the removed key keep it (their card just shows the raw label).
router.delete("/categories/:key", requirePermission("staff", "delete"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "No organization context" });
  const key = String(req.params.key);
  const list = customCategories(apId);
  if (!list.some((c) => c.key === key)) {
    return res.status(404).json({ error: "Custom service type not found (built-in types can't be removed)" });
  }
  saveCustomCategories(apId, list.filter((c) => c.key !== key));
  res.json({ categories: categoryList(apId) });
});

// ─── Attendance ───────────────────────────────────────────────────────────

// The AI kiosk: the browser detects a live face, computes its descriptor and
// posts it here with the kiosk's mode (direction: 'in' | 'out'). We match
// against the org's enrolled, active staff and punch in that direction.
// 404 (no_match) → kiosk shows "not recognized".
router.post("/recognize", requirePermission("staff", "edit"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "No organization context" });

  const direction = req.body?.direction;
  if (direction !== undefined && direction !== "in" && direction !== "out") {
    return res.status(400).json({ error: "direction must be 'in' or 'out'" });
  }

  const probe = parseDescriptor(req.body?.descriptor);
  if (!probe) return res.status(400).json({ error: "Invalid face descriptor" });

  const candidates = db.prepare(
    "SELECT * FROM staff WHERE apartment_id = ? AND active = 1 AND face_descriptor IS NOT NULL"
  ).all(apId);

  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    let stored;
    try { stored = JSON.parse(c.face_descriptor); } catch { continue; }
    if (!Array.isArray(stored) || stored.length !== 128) continue;
    const d = euclidean(probe, stored);
    if (d < bestDist) { bestDist = d; best = c; }
  }

  if (!best || bestDist > MATCH_THRESHOLD) {
    return res.status(404).json({
      error: "Face not recognized — register this person or mark attendance manually",
      code: "no_match",
    });
  }

  // Confidence ~ how far inside the acceptance radius the match landed.
  const confidence = Math.max(0, Math.min(1, 1 - bestDist / 0.6));
  const result = punch(best, "face", Number(confidence.toFixed(3)), req.user.id, direction || null);

  res.json({
    staff: publicStaff(best),
    direction: result.direction,
    duplicate: !!result.duplicate,
    noop: !!result.noop,
    reason: result.reason || null,
    session: result.session,
    confidence: Number(confidence.toFixed(3)),
    distance: Number(bestDist.toFixed(3)),
  });
});

// Manual fallback punch (gate staff). Accepts an explicit direction from the
// button that was pressed; omitting it falls back to toggle semantics.
router.post("/:id/punch", requirePermission("staff", "edit"), (req, res) => {
  const s = getStaff(Number(req.params.id));
  if (!s) return res.status(404).json({ error: "Staff member not found" });
  if (!canAccessApartment(req.user, s.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  if (!s.active) return res.status(409).json({ error: "This staff member is deactivated" });

  const direction = req.body?.direction;
  if (direction !== undefined && direction !== "in" && direction !== "out") {
    return res.status(400).json({ error: "direction must be 'in' or 'out'" });
  }

  const result = punch(s, "manual", null, req.user.id, direction || null);
  res.json({
    direction: result.direction,
    duplicate: !!result.duplicate,
    noop: !!result.noop,
    reason: result.reason || null,
    session: result.session,
  });
});

// Daily register: every session for a given day (default today, server-local).
router.get("/attendance", requirePermission("staff", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.json({ sessions: [] });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? req.query.date : localToday();

  const params = [apId, date];
  let scope = "";
  if (!isManager(req.user)) {
    scope = ` AND a.staff_id IN (
      SELECT sf.staff_id FROM staff_flats sf JOIN flats f ON f.id = sf.flat_id WHERE f.owner_id = ?)`;
    params.push(req.user.id);
  }

  const sessions = db.prepare(
    `SELECT a.*, s.name, s.category, s.photo_url
       FROM staff_attendance a
       JOIN staff s ON s.id = a.staff_id
      WHERE a.apartment_id = ? AND a.date = ?${scope}
      ORDER BY a.in_at DESC, a.id DESC`
  ).all(...params);

  res.json({ sessions, date });
});

// Monthly report: per-staff days present, visit count and total hours inside.
router.get("/attendance/report", requirePermission("staff", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.json({ report: [] });
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || ""))
    ? req.query.month
    : localToday().slice(0, 7);

  const params = [month, apId];
  let scope = "";
  if (!isManager(req.user)) {
    scope = ` AND s.id IN (
      SELECT sf.staff_id FROM staff_flats sf JOIN flats f ON f.id = sf.flat_id WHERE f.owner_id = ?)`;
    params.push(req.user.id);
  }

  const report = db.prepare(
    `SELECT s.id, s.name, s.category, s.photo_url, s.active,
            COUNT(DISTINCT a.date)  AS days_present,
            COUNT(a.id)             AS visits,
            ROUND(COALESCE(SUM(CASE WHEN a.out_at IS NOT NULL
                  THEN (julianday(a.out_at) - julianday(a.in_at)) * 24.0 END), 0), 1) AS hours,
            SUM(CASE WHEN a.in_method = 'face' THEN 1 ELSE 0 END) AS face_punches
       FROM staff s
       LEFT JOIN staff_attendance a ON a.staff_id = s.id AND substr(a.date, 1, 7) = ?
      WHERE s.apartment_id = ?${scope}
      GROUP BY s.id
      ORDER BY days_present DESC, s.name`
  ).all(...params);

  res.json({ report, month });
});

module.exports = router;
