const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { PRESETS, publicList, resolveTheme, DEFAULT_KEY } = require("../themes");
const { requirePermission } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

router.get("/presets", (_req, res) => {
  res.json({ presets: publicList(), default_key: DEFAULT_KEY });
});

router.get("/", (req, res) => {
  const apId = req.user.apartment_id;
  const ap = db.prepare("SELECT theme_key, theme_custom FROM apartments WHERE id = ?").get(apId);
  const theme = resolveTheme(ap?.theme_key, ap?.theme_custom);
  res.json({ theme });
});

router.put("/", requirePermission("theme", "edit"), (req, res) => {
  const { key, custom } = req.body || {};
  if (!key || !PRESETS[key]) {
    return res.status(400).json({ error: `Invalid theme key. Expected one of: ${Object.keys(PRESETS).join(", ")}` });
  }
  const serializedCustom = custom ? JSON.stringify(custom) : null;
  db.prepare("UPDATE apartments SET theme_key = ?, theme_custom = ? WHERE id = ?")
    .run(key, serializedCustom, req.user.apartment_id);
  const ap = db.prepare("SELECT theme_key, theme_custom FROM apartments WHERE id = ?").get(req.user.apartment_id);
  res.json({ theme: resolveTheme(ap.theme_key, ap.theme_custom) });
});

module.exports = router;
