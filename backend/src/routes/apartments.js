const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole, signToken } = require("../middleware/auth");
const { isPlatformAdmin, requirePlatformAdmin, effectivePermissions } = require("../permissions");
const { PLAN_LIST, planFor, isValidPlan, trialInfo, trialEndDate } = require("../plans");
const {
  FEATURE_CATALOG, isValidFeature, isCoreFeature, parseFeatures,
  effectiveFeatures, hasFeature,
} = require("../features");

const router = express.Router();

// Public plan catalog — the signup page (pre-auth) renders these for selection.
router.get("/plans", (_req, res) => {
  res.json({ plans: PLAN_LIST });
});

// Public branding endpoint — for the login screen, before auth.
// Returns the most-recently-created apartment (in single-tenant demos, the only one).
router.get("/branding", (_req, res) => {
  const ap = db.prepare("SELECT id, name, tagline FROM apartments ORDER BY id DESC LIMIT 1").get();
  res.json({
    name: ap?.name || "Apartment Community",
    tagline: ap?.tagline || "Resident Portal",
  });
});

// Public organization signup — creates a new apartment AND its first
// org_admin user in one atomic transaction. No auth required.
//
// Body: {
//   org:   { name (required), tagline?, address? },
//   admin: { name (required), email (required), password (required, ≥8), phone? }
// }
//
// Returns: { token, user, apartment } — caller can drop the token straight
// into localStorage and skip the login screen.
router.post("/signup", (req, res) => {
  const { org, admin } = req.body || {};
  if (!org?.name || !String(org.name).trim()) {
    return res.status(400).json({ error: "Organization name is required" });
  }
  if (!admin?.name || !admin?.email || !admin?.password) {
    return res.status(400).json({ error: "Admin name, email, and password are required" });
  }
  const email = String(admin.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Admin email is not valid" });
  }
  if (String(admin.password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  // Emails are globally unique across the platform (Phase 1 decision).
  const taken = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (taken) return res.status(409).json({ error: "An account with this email already exists" });

  // Chosen subscription plan (defaults to the free trial). Invalid → trial.
  const plan = isValidPlan(org.plan) ? org.plan : "trial";
  const trialEndsAt = plan === "trial" ? trialEndDate() : null;

  const tx = db.transaction(() => {
    const apInfo = db.prepare("INSERT INTO apartments (name, address, tagline, plan, trial_ends_at) VALUES (?,?,?,?,?)")
      .run(String(org.name).trim(), org.address?.trim() || null, org.tagline?.trim() || null, plan, trialEndsAt);
    const apartmentId = apInfo.lastInsertRowid;
    // Assign the unique, human-readable Organization ID (e.g. ORG001) from the new PK.
    db.prepare("UPDATE apartments SET org_code = printf('ORG%03d', id) WHERE id = ?").run(apartmentId);

    const hash = bcrypt.hashSync(admin.password, 10);
    const userInfo = db.prepare(
      "INSERT INTO users (apartment_id, name, email, phone, password_hash, role, active) VALUES (?,?,?,?,?,?,1)"
    ).run(apartmentId, String(admin.name).trim(), email, admin.phone?.trim() || null, hash, "org_admin");

    return { apartmentId, userId: userInfo.lastInsertRowid };
  });

  let result;
  try {
    result = tx();
  } catch (e) {
    return res.status(500).json({ error: "Failed to create organization", detail: e.message });
  }

  const user = db.prepare(
    "SELECT id, name, email, phone, role, apartment_id, avatar_url FROM users WHERE id = ?"
  ).get(result.userId);
  const apartment = withPlan(
    db.prepare("SELECT id, org_code, name, tagline, address, plan, trial_ends_at FROM apartments WHERE id = ?")
      .get(result.apartmentId)
  );

  const safe = {
    ...user,
    org_code: apartment?.org_code || null,
    permissions: effectivePermissions(user),
    apartment,
  };
  res.status(201).json({ token: signToken(safe), user: safe, apartment });
});

router.use(requireAuth);

// Attach plan metadata (name + flat_limit) so the UI doesn't need its own copy
// of the plan table. flat_limit null === unlimited. Includes trial standing.
function withPlan(ap) {
  if (!ap) return ap;
  const p = planFor(ap.plan);
  return {
    ...ap,
    plan: p.key,
    plan_name: p.name,
    flat_limit: p.flat_limit,
    // Resolved feature map (plan defaults + per-org overrides) for the client.
    features: effectiveFeatures(p.key, ap.features),
    ...(trialInfo(p.key, ap.trial_ends_at) || {}),
  };
}

router.get("/", (req, res) => {
  if (isPlatformAdmin(req.user)) {
    // Enrich with per-org counts so the platform UI can show health at a glance.
    const apartments = db.prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM users u WHERE u.apartment_id = a.id) AS user_count,
              (SELECT COUNT(*) FROM flats f WHERE f.apartment_id = a.id) AS flat_count,
              (SELECT COUNT(*) FROM bills b JOIN flats f ON f.id = b.flat_id
                 WHERE f.apartment_id = a.id) AS bill_count,
              (SELECT COUNT(*) FROM incidents i
                 WHERE i.apartment_id = a.id AND i.status != 'closed') AS open_incidents,
              (SELECT COUNT(*) FROM announcements an
                 WHERE an.apartment_id = a.id AND an.completed = 0) AS active_announcements
       FROM apartments a ORDER BY a.name`
    ).all();
    return res.json({ apartments: apartments.map(withPlan) });
  }
  const ap = db.prepare("SELECT * FROM apartments WHERE id = ?").get(req.user.apartment_id);
  res.json({ apartments: ap ? [withPlan(ap)] : [] });
});

// The feature catalog — what features exist, their category and whether they are
// core (always-on). Used by the Platform admin UI to render per-org toggles.
router.get("/features-catalog", (_req, res) => {
  res.json({ features: FEATURE_CATALOG });
});

router.get("/mine", (req, res) => {
  const ap = db.prepare("SELECT id, org_code, name, tagline, address, plan, background_url, trial_ends_at FROM apartments WHERE id = ?")
    .get(req.user.apartment_id);
  if (!ap) return res.status(404).json({ error: "Apartment not found" });
  // Include current flat usage so an org admin can see headroom against the cap.
  const used = db.prepare("SELECT COUNT(*) AS n FROM flats WHERE apartment_id = ?").get(req.user.apartment_id).n;
  res.json({ apartment: { ...withPlan(ap), flat_count: used } });
});

// Creating a new organization is platform-admin-only — that's the SaaS
// onboarding path. (Public signup endpoint comes in Phase 2.)
router.post("/", requirePlatformAdmin, (req, res) => {
  const { name, address, tagline, plan } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  if (plan !== undefined && !isValidPlan(plan)) {
    return res.status(400).json({ error: "Invalid subscription plan" });
  }
  const info = db.prepare("INSERT INTO apartments (name, address, tagline, plan) VALUES (?,?,?,?)")
    .run(name, address || null, tagline || null, plan || "starter");
  // Assign the unique Organization ID (e.g. ORG001) from the new PK.
  db.prepare("UPDATE apartments SET org_code = printf('ORG%03d', id) WHERE id = ?").run(info.lastInsertRowid);
  res.status(201).json({ apartment: withPlan(db.prepare("SELECT * FROM apartments WHERE id = ?").get(info.lastInsertRowid)) });
});

// Change an organization's subscription plan. Platform-admin only — plan/billing
// is a SaaS-operator concern, not something a tenant can self-upgrade for free.
router.patch("/:id/plan", requirePlatformAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { plan } = req.body || {};
  if (!isValidPlan(plan)) return res.status(400).json({ error: "Invalid subscription plan" });
  const existing = db.prepare("SELECT id FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });

  // Guard against downgrading below current usage — the cap would be violated.
  const used = db.prepare("SELECT COUNT(*) AS n FROM flats WHERE apartment_id = ?").get(id).n;
  const limit = planFor(plan).flat_limit;
  if (limit !== null && used > limit) {
    return res.status(409).json({
      error: `Cannot switch to ${planFor(plan).name}: this org has ${used} flats, over the ${limit}-flat limit.`,
    });
  }

  // Moving onto trial (re)starts the clock; any paid plan clears it.
  const trialEndsAt = plan === "trial" ? trialEndDate() : null;
  db.prepare("UPDATE apartments SET plan = ?, trial_ends_at = ? WHERE id = ?").run(plan, trialEndsAt, id);
  res.json({ apartment: withPlan(db.prepare("SELECT * FROM apartments WHERE id = ?").get(id)) });
});

// Override an organization's feature toggles on top of its plan defaults.
// Platform-admin only — enabling/disabling functionality is a SaaS-operator
// concern. Body: { features: { <key>: true | false | null } } where null RESETS
// the key back to the plan default. Overrides persist across plan changes and
// simply layer on the new plan's defaults.
router.patch("/:id/features", requirePlatformAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id, features FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });

  const incoming = req.body?.features;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ error: "features object is required" });
  }

  const overrides = parseFeatures(existing.features) || {};
  for (const [key, val] of Object.entries(incoming)) {
    if (!isValidFeature(key)) {
      return res.status(400).json({ error: `Unknown feature: ${key}` });
    }
    if (isCoreFeature(key)) {
      return res.status(400).json({ error: `Core feature cannot be changed: ${key}` });
    }
    if (val === null) {
      delete overrides[key]; // reset to plan default
    } else {
      overrides[key] = !!val;
    }
  }

  const next = Object.keys(overrides).length ? JSON.stringify(overrides) : null;
  db.prepare("UPDATE apartments SET features = ? WHERE id = ?").run(next, id);
  res.json({ apartment: withPlan(db.prepare("SELECT * FROM apartments WHERE id = ?").get(id)) });
});

// Org admins can rename / re-tagline their own apartment; platform admin can do any.
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });
  const isOwnOrg = req.user.apartment_id === id;
  const isOrgAdmin = req.user.role === "org_admin" && isOwnOrg;
  if (!isPlatformAdmin(req.user) && !isOrgAdmin) {
    return res.status(403).json({ error: "Only platform admin or this org's admin can update apartment" });
  }

  const { name, tagline, address, background_url } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "name cannot be empty" });
  }
  // White-label branding (org-wide background image) is a gated feature. Setting
  // a non-empty background requires the white_label feature on this org's plan.
  // Clearing it (empty string) is always allowed so downgrades can tidy up.
  if (background_url !== undefined && String(background_url).trim() &&
      !hasFeature(existing.plan, existing.features, "white_label")) {
    return res.status(403).json({
      error: "White-label branding is not included in your current plan.",
      code: "feature_unavailable",
      feature: "white_label",
    });
  }
  db.prepare(
    `UPDATE apartments SET
       name = COALESCE(?, name),
       tagline = CASE WHEN ? IS NOT NULL THEN ? ELSE tagline END,
       address = CASE WHEN ? IS NOT NULL THEN ? ELSE address END,
       background_url = CASE WHEN ? IS NOT NULL THEN ? ELSE background_url END
     WHERE id = ?`
  ).run(
    name ?? null,
    tagline === undefined ? null : 1, tagline === undefined ? null : (tagline || null),
    address === undefined ? null : 1, address === undefined ? null : (address || null),
    // pass an empty string to CLEAR the background; undefined leaves it unchanged.
    background_url === undefined ? null : 1, background_url === undefined ? null : (background_url || null),
    id
  );
  const updated = db.prepare("SELECT id, org_code, name, tagline, address, plan, background_url FROM apartments WHERE id = ?").get(id);
  res.json({ apartment: withPlan(updated) });
});

// Hard-delete an organization. Platform-admin-only. Foreign keys cascade
// to flats, bills, payments, incidents, vendors, expenses, announcements.
// Users are set NULL (so platform admin accounts survive even if their last
// associated tenant goes away).
router.delete("/:id", requirePlatformAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id, name FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });

  // Disallow deleting the apartment the requesting platform admin happens
  // to belong to — avoids accidentally locking themselves out.
  if (req.user.apartment_id === id) {
    return res.status(400).json({ error: "Cannot delete the organization you are signed into" });
  }

  const info = db.prepare("DELETE FROM apartments WHERE id = ?").run(id);
  res.json({ ok: true, deleted: existing, rows: info.changes });
});

module.exports = router;
