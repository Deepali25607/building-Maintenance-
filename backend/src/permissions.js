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

const ROLE_DEFAULTS = {
  super_admin: { _all: true },
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
  if (user.role === "super_admin") return true;
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

module.exports = {
  MODULES,
  ACTIONS,
  ROLE_DEFAULTS,
  parsePermissions,
  effectivePermissions,
  can,
  requirePermission,
};
