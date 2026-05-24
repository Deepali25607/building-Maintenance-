require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

const uploadsRouter = require("./routes/uploads");
app.use("/api/uploads", express.static(uploadsRouter.UPLOAD_DIR));
app.use("/api/uploads", uploadsRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/apartments", require("./routes/apartments"));
app.use("/api/flats", require("./routes/flats"));
app.use("/api/bills", require("./routes/bills"));
app.use("/api/incidents", require("./routes/incidents"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/vendors", require("./routes/vendors"));
app.use("/api/announcements", require("./routes/announcements"));
app.use("/api/theme", require("./routes/theme"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/reports", require("./routes/reports"));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
