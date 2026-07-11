// Feature gating per the multi-tenant SaaS model. Every functionality is a
// "feature" that can be enabled/disabled per organization. The subscription plan
// (see backend/src/plans.js) declares each feature's DEFAULT on/off state; the
// Platform Admin can OVERRIDE individual features per org on top of that default.
//
// This file is the single source of truth for WHAT features exist. The per-plan
// defaults live in plans.js; the per-org overrides live in apartments.features (JSON).
const { planFor } = require("./plans");

// category: 'module' (a nav module / page) | 'premium' (a capability/add-on)
// core: true  → always available, never gateable (the essentials every tenant needs)
const FEATURE_CATALOG = [
  // ─── Core (always on) ───────────────────────────────────────────────────
  { key: "dashboard", label: "Dashboard", category: "module", core: true },
  { key: "flats", label: "Flats", category: "module", core: true },
  { key: "users", label: "Users / Residents", category: "module", core: true },
  { key: "bills", label: "Maintenance Bills", category: "module", core: true },
  { key: "incidents", label: "Incidents", category: "module", core: true },
  { key: "announcements", label: "Announcements", category: "module", core: true },
  { key: "theme", label: "Theme", category: "module", core: true },
  { key: "contact", label: "Help & Contact", category: "module", core: true },

  // ─── Gateable modules ───────────────────────────────────────────────────
  { key: "towers", label: "Towers / Blocks", category: "module" },
  { key: "visitors", label: "Visitor Management", category: "module" },
  { key: "staff", label: "Staff Attendance (Face ID)", category: "module" },
  { key: "vendors", label: "Vendor Management", category: "module" },
  { key: "expenses", label: "Expense Tracking", category: "module" },
  { key: "accounting", label: "Accounting & Finance", category: "module" },
  { key: "reports", label: "Reports & Analytics", category: "module" },

  // ─── Gateable premium capabilities ──────────────────────────────────────
  { key: "sla", label: "SLA & Escalation", category: "premium" },
  { key: "notifications", label: "Notification Engine", category: "premium" },
  { key: "chatbot", label: "Support Chatbot", category: "premium" },
  { key: "bulk_import", label: "Bulk Resident Import", category: "premium" },
  { key: "white_label", label: "White-label Branding", category: "premium" },
  { key: "custom_domain", label: "Custom Domain", category: "premium" },
];

const FEATURE_KEYS = FEATURE_CATALOG.map((f) => f.key);
const CORE_KEYS = FEATURE_CATALOG.filter((f) => f.core).map((f) => f.key);

function isValidFeature(key) {
  return FEATURE_KEYS.includes(key);
}

function isCoreFeature(key) {
  return CORE_KEYS.includes(key);
}

// Resolve the plan's DEFAULT feature map: { key: bool } across the whole catalog.
// Core features are always true. A gateable feature is on iff the plan lists it in
// its `features` array. Falls back gracefully for plans without an explicit list.
function planDefaults(planKey) {
  const plan = planFor(planKey);
  const enabled = new Set(Array.isArray(plan.features) ? plan.features : []);
  const map = {};
  for (const f of FEATURE_CATALOG) {
    map[f.key] = f.core ? true : enabled.has(f.key);
  }
  return map;
}

// Parse the per-org override JSON (sparse { key: bool }). Mirrors parsePermissions.
function parseFeatures(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// The effective, fully-resolved feature map for an org: plan defaults merged with
// the org's sparse overrides. Core features are always forced on; unknown override
// keys are ignored.
function effectiveFeatures(planKey, overridesRaw) {
  const map = planDefaults(planKey);
  const overrides = parseFeatures(overridesRaw);
  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      if (!isValidFeature(key) || isCoreFeature(key)) continue;
      map[key] = !!val;
    }
  }
  return map;
}

function hasFeature(planKey, overridesRaw, key) {
  return !!effectiveFeatures(planKey, overridesRaw)[key];
}

// Express middleware: 403 unless the requesting user's org has `key` enabled.
// Reads from req.features, attached by requireAuth. Platform admins (no apartment,
// hence no req.features) are not subject to feature gates — but they also have no
// tenant-data permissions, so they never reach these routes anyway.
function requireFeature(key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    // No feature map (e.g. platform admin with no apartment) → don't block here.
    const features = req.features;
    if (features && features[key] === false) {
      return res.status(403).json({
        error: `This feature is not included in your current plan: ${key}`,
        code: "feature_unavailable",
        feature: key,
      });
    }
    next();
  };
}

module.exports = {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  CORE_KEYS,
  isValidFeature,
  isCoreFeature,
  planDefaults,
  parseFeatures,
  effectiveFeatures,
  hasFeature,
  requireFeature,
};
