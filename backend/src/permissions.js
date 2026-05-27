const MODULES = [
  "users",
  "flats",
  "bills",
  "incidents",
  "expenses",
  "vendors",
  "announcements",
  "reports",
  "theme",
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
  super_admin: { _all: true },
  org_admin: { _all: true },
  committee: {
    users: { view: true, create: true, edit: true },
    flats: { view: true, create: true, edit: true },
    bills: { view: true, create: true, edit: true },
    incidents: { view: true, create: true, edit: true },
    expenses: { view: true, create: true, edit: true },
    vendors: { view: true, create: true, edit: true },
    announcements: { view: true, create: true, edit: true },
    reports: { view: true },
  },
  treasurer: {
    users: { view: true },
    flats: { view: true },
    bills: { view: true, create: true, edit: true },
    incidents: { view: true },
    expenses: { view: true, create: true, edit: true },
    vendors: { view: true, create: true, edit: true },
    announcements: { view: true },
    reports: { view: true },
  },
  resident: {
    flats: { view: true },
    bills: { view: true },
    incidents: { view: true, create: true },
    announcements: { view: true },
  },
  maintenance: {
    incidents: { view: true, edit: true },
    announcements: { view: true },
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
  if (isPlatformAdmin(user)) return true;
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
  if (isPlatformAdmin(user)) return true;
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
