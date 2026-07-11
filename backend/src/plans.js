// Subscription plans per the multi-tenant BRD (§6 / Module 1).
// flat_limit === null means unlimited. These are the source of truth for both
// the platform UI (plan management) and server-side enforcement (flat caps).
//
// `features` lists the GATEABLE feature keys (see backend/src/features.js) enabled
// by default on this plan. Core features are always on and are NOT listed here.
// The Platform Admin can override individual features per org on top of these
// defaults. white_label/custom_domain booleans are kept (derived from `features`)
// for backwards compatibility.
const TRIAL_DAYS = 14;

const PLANS = {
  trial: {
    key: "trial",
    name: "Free Trial",
    flat_limit: 500,
    // Trial unlocks the full product (minus white-label/custom-domain) so
    // evaluators can experience every module before they buy.
    features: [
      "towers", "visitors", "staff", "vendors", "expenses", "accounting", "reports",
      "sla", "notifications", "chatbot", "bulk_import",
    ],
    is_trial: true,
    trial_days: TRIAL_DAYS,
    blurb: `${TRIAL_DAYS}-day free trial · up to 500 flats`,
  },
  starter: {
    key: "starter",
    name: "Starter",
    flat_limit: 100,
    // Lean tier: core modules + basic expense tracking.
    features: ["expenses"],
    blurb: "Up to 100 flats",
  },
  professional: {
    key: "professional",
    name: "Professional",
    flat_limit: 500,
    features: [
      "towers", "visitors", "staff", "vendors", "expenses", "accounting", "reports",
      "sla", "notifications", "chatbot", "bulk_import",
    ],
    blurb: "Up to 500 flats",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    flat_limit: null, // unlimited
    features: [
      "towers", "visitors", "staff", "vendors", "expenses", "accounting", "reports",
      "sla", "notifications", "chatbot", "bulk_import",
      "white_label", "custom_domain",
    ],
    blurb: "Unlimited flats · white label · custom domain",
  },
};

// Derive the legacy white_label / custom_domain booleans from each plan's
// feature list so the two stay in sync from a single source.
for (const p of Object.values(PLANS)) {
  const set = new Set(p.features || []);
  p.white_label = set.has("white_label");
  p.custom_domain = set.has("custom_domain");
}

const DEFAULT_PLAN = "starter";

function isValidPlan(key) {
  return Object.prototype.hasOwnProperty.call(PLANS, key);
}

// Always returns a plan object; falls back to the default for unknown/missing keys.
function planFor(key) {
  return PLANS[key] || PLANS[DEFAULT_PLAN];
}

// null = unlimited
function flatLimit(key) {
  return planFor(key).flat_limit;
}

// Ordered list for UI rendering (trial → most capable).
const PLAN_LIST = [PLANS.trial, PLANS.starter, PLANS.professional, PLANS.enterprise];

// Compute trial standing for an org. Returns null for non-trial plans.
function trialInfo(plan, trialEndsAt) {
  if (plan !== "trial" || !trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  const msLeft = end - Date.now();
  return {
    trial_ends_at: trialEndsAt,
    trial_days_left: Math.max(0, Math.ceil(msLeft / (24 * 3600 * 1000))),
    trial_expired: msLeft <= 0,
  };
}

// ISO timestamp `days` from now — used to stamp trial_ends_at at signup.
function trialEndDate(days = TRIAL_DAYS) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

// True only for a trial plan whose window has elapsed. Used to hard-block access
// (login + every authenticated request) once the free trial ends.
function trialExpired(plan, trialEndsAt) {
  const info = trialInfo(plan, trialEndsAt);
  return !!(info && info.trial_expired);
}

module.exports = { PLANS, PLAN_LIST, DEFAULT_PLAN, TRIAL_DAYS, isValidPlan, planFor, flatLimit, trialInfo, trialEndDate, trialExpired };
