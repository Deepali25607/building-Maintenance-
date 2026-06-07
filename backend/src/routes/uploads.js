const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const INCIDENT_DIR = path.join(UPLOAD_DIR, "incidents");
const BACKGROUND_DIR = path.join(UPLOAD_DIR, "backgrounds");
fs.mkdirSync(AVATAR_DIR, { recursive: true });
fs.mkdirSync(INCIDENT_DIR, { recursive: true });
fs.mkdirSync(BACKGROUND_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: AVATAR_DIR,
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".png").toLowerCase();
    const safe = `av_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});

const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error("Only PNG, JPEG, GIF, or WEBP images are allowed"));
    }
    cb(null, true);
  },
});

router.post("/avatar", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `/api/uploads/avatars/${req.file.filename}` });
  });
});

// Multi-file upload for incident attachments (photos/videos of issues)
const incidentStorage = multer.diskStorage({
  destination: INCIDENT_DIR,
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".png").toLowerCase();
    const safe = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});

const incidentUpload = multer({
  storage: incidentStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error("Only PNG, JPEG, GIF, or WEBP images are allowed"));
    }
    cb(null, true);
  },
});

router.post("/incident", requireAuth, (req, res) => {
  incidentUpload.array("files", 5)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: "No files uploaded" });
    const urls = req.files.map((f) => `/api/uploads/incidents/${f.filename}`);
    res.json({ urls });
  });
});

// App-wide background image — larger limit (full-screen photos).
const backgroundUpload = multer({
  storage: multer.diskStorage({
    destination: BACKGROUND_DIR,
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
      cb(null, `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new Error("Only PNG, JPEG, GIF, or WEBP images are allowed"));
    cb(null, true);
  },
});

router.post("/background", requireAuth, (req, res) => {
  backgroundUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `/api/uploads/backgrounds/${req.file.filename}` });
  });
});

module.exports = router;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
