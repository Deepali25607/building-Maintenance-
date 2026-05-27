const jwt = require("jsonwebtoken");
const db = require("../db");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, apartment_id: user.apartment_id },
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

    // Platform admins can scope a request to any tenant via the X-Org-Id
    // header. This lets the platform UI "view as" any organization without
    // a new login. Ignored for everyone else (no privilege escalation).
    let effectiveApartmentId = row.apartment_id;
    const orgHeader = req.headers["x-org-id"];
    if (orgHeader && row.role === "super_admin") {
      const requested = Number(orgHeader);
      if (Number.isFinite(requested) && requested > 0) {
        effectiveApartmentId = requested;
      }
    }

    req.user = {
      id: row.id,
      role: row.role,
      apartment_id: effectiveApartmentId,
      real_apartment_id: row.apartment_id, // original, before impersonation
      permissions: row.permissions,
    };
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
