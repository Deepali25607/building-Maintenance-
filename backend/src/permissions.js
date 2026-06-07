const MODULES = [
  "users",
  "flats",
  "towers",
  "bills",
  "incidents",
  "expenses",
  "vendors",
  "announcements",
  "visitors",
  "reports",
  "theme",
  "contact",
];
const ACTIONS = ["view", "create", "edit", "delete"];

// Roles:
//   super_admin  — PLATFORM admin. No apartment binding required. Sees and manages
//                  every organization. Used by the SaaS operator. Treated as
//                  "platform_admin" semantically.
//   org_admin    — ORGANIZATION admin. Full permissions inside their apartment_id
//                  only. Cannot cross tenants. Created via org signup.
//   committee, treasurer, resident, maintenance — per-tenant scoped roles.
const ROLE_DEFAULTS = {
  // Platform operator. Deliberately has NO tenant-data permissions — their power
  // is platform administration (orgs, subscriptions, plans), enforced separately
  // via isPlatformAdmin / requirePlatformAdmin. This keeps residents' personal and
  // financial data private from the SaaS operator (data isolation).
  super_admin: {},
  org_admin: { _all: true },
  committee: {
    users: { view: true, create: true, edit: true },
    flats: { view: true, create: true, edit: true },
    towers: { view: true, create: true, edit: true, delete: true },
    bills: { view: true, create: true, edit: true },
    incidents: { view: true, create: true, edit: true },
    expenses: { view: true, create: true, edit: true },
    vendors: { view: true, create: true, edit: true },
    announcements: { view: true, create: true, edit: true },
    visitors: { view: true, create: true, edit: true, delete: true },
    reports: { view: true },
    contact: { view: true },
  },
  treasurer: {
    users: { view: true },
    flats: { view: true },
    towers: { view: true },
    bills: { view: true, create: true, edit: true },
    incidents: { view: true },
    expenses: { view: true, create: true, edit: true },
    vendors: { view: true, create: true, edit: true },
    announcements: { view: true },
    visitors: { view: true },
    reports: { view: true },
    contact: { view: true },
  },
  resident: {
    flats: { view: true },
    bills: { view: true },
    incidents: { view: true, create: true },
    announcements: { view: true },
    // Residents see/approve visits to their own flat and can pre-register guests.
    visitors: { view: true, create: true },
    contact: { view: true },
  },
  maintenance: {
    incidents: { view: true, edit: true },
    announcements: { view: true },
    // Gate/security staff: log visitors and run the check-in/out lifecycle.
    visitors: { view: true, create: true, edit: true },
    contact: { view: true },
  },
};

function parsePermissions(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function effectivePermissions(user) {
  const custom = parsePermissions(user.permissions);
  if (custom) return custom;
  return ROLE_DEFAULTS[user.role] || {};
}

function can(user, module, action) {
  if (!user) return false;
  // NOTE: platform admins are intentionally NOT granted blanket access here.
  // They have no tenant-data permissions; platform powers go through
  // isPlatformAdmin / requirePlatformAdmin instead.
  const perms = effectivePermissions(user);
  if (perms._all) return true;
  return !!perms?.[module]?.[action];
}

function requirePermission(module, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!can(req.user, module, action)) {
      return res.status(403).json({ error: `Forbidden — missing permission: ${module}.${action}` });
    }
    next();
  };
}

// ─── Multi-tenant helpers ─────────────────────────────────────────────────

// Platform admins (the SaaS operator) can cross every tenant. Everyone
// else is locked to their own apartment_id.
function isPlatformAdmin(user) {
  return user?.role === "super_admin";
}

// Returns true if the requesting user can read/write data belonging to the
// given apartment_id. Platform admins can touch any tenant; everyone else
// only their own. Pass `null` apartment ids straight through (e.g. when
// asking whether the user can create resources in their own tenant).
function canAccessApartment(user, apartmentId) {
  if (!user) return false;
  // Platform admins are NOT given access to tenant data — they belong to no
  // apartment and must not read/write residents' records (data isolation).
  if (apartmentId == null) return true; // creating in own tenant
  return user.apartment_id === Number(apartmentId);
}

// Middleware: 403 if the requester isn't a platform admin. Used to gate
// cross-tenant operations like listing/creating organizations.
function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: "Forbidden — platform admin only" });
  }
  next();
}

module.exports = {
  MODULES,
  ACTIONS,
  ROLE_DEFAULTS,
  parsePermissions,
  effectivePermissions,
  can,
  requirePermission,
  isPlatformAdmin,
  canAccessApartment,
  requirePlatformAdmin,
};
