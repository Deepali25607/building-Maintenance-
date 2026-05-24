require("dotenv").config();
const app = require("./src/app");
const { seed } = require("./src/seed");

// Auto-seed on boot. Idempotent: the first run on an empty DB creates demo
// users/flats/bills; subsequent runs only refresh backfill data (profiles,
// payments, defaulter records) and skip the destructive seed transaction.
// Set AUTO_SEED=false to opt out in production once data is in place.
if (process.env.AUTO_SEED !== "false") {
  try {
    seed();
  } catch (e) {
    console.error("Auto-seed failed (continuing to start server):", e.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Apartment Management API running on http://localhost:${PORT}`);
});
