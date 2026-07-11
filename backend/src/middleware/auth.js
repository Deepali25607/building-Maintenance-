const jwt = require("jsonwebtoken");
const db = require("../db");
const { trialExpired } = require("../plans");
const { effectiveFeatures } = require("../features");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(user) {
  return jwt.sign(
    // organization_id is the human-readable Org ID (e.g. ORG001) per the BRD's
    // JWT shape; apartment_id remains the numeric tenant key used for joins.
    { id: user.id, role: user.role, apartment_id: user.apartment_id, organization_id: user.org_code || null },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, SECRET);
    // Load fresh role/apartment/permissions so permission changes take effect immediately
    const row = db
      .prepare("SELECT id, role, apartment_id, active, permissions FROM users WHERE id = ?")
      .get(payload.id);
    if (!row || !row.active) return res.status(401).json({ error: "User disabled or removed" });

    // A user is always bound to their own apartment. Cross-tenant "view as"
    // impersonation was removed so the platform operator cannot read tenant data.
    const org = row.apartment_id
      ? db.prepare("SELECT org_code, plan, trial_ends_at, features FROM apartments WHERE id = ?").get(row.apartment_id)
      : null;

    // Hard trial gate: a logged-in user whose org trial has since expired is cut
    // off mid-session. The `code` lets the client redirect to the contact screen.
    if (org && trialExpired(org.plan, org.trial_ends_at)) {
      return res.status(403).json({
        error: "Your organization's free trial has ended. Please contact our sales team to reactivate your account.",
        code: "trial_expired",
      });
    }

    req.user = {
      id: row.id,
      role: row.role,
      apartment_id: row.apartment_id,
      organization_id: org?.org_code || null, // human-readable Org ID (e.g. ORG001)
      permissions: row.permissions,
    };
    // Resolved feature map for this org (plan defaults + per-org overrides). Used
    // by requireFeature and route logic. null for platform admins (no apartment).
    req.features = org ? effectiveFeatures(org.plan, org.features) : null;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden — role not permitted" });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, SECRET };
