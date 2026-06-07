// SLA tracking & escalation matrix for complaints/incidents (BRD Module 6).

// Priority → DEFAULT SLA window (hours). Higher priority = tighter deadline.
// Each organization can override these (apartments.sla_config); this is the
// fallback when an org hasn't customized them.
const SLA_MATRIX = {
  urgent: 4,
  high: 24,
  medium: 48,
  low: 72,
};

const PRIORITIES = ["urgent", "high", "medium", "low"];
const MIN_SLA_HOURS = 1;
const MAX_SLA_HOURS = 8760; // 1 year

// Merge a (possibly partial/untrusted) custom matrix over the defaults, keeping
// only valid integer hours in range. Always returns a complete 4-priority matrix.
function sanitizeMatrix(custom) {
  const out = { ...SLA_MATRIX };
  if (custom && typeof custom === "object") {
    for (const p of PRIORITIES) {
      const v = Number(custom[p]);
      if (Number.isFinite(v) && v >= MIN_SLA_HOURS && v <= MAX_SLA_HOURS) out[p] = Math.round(v);
    }
  }
  return out;
}

// Parse an org's stored sla_config (JSON string or object) → full matrix.
function parseMatrix(raw) {
  if (!raw) return { ...SLA_MATRIX };
  try {
    return sanitizeMatrix(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return { ...SLA_MATRIX };
  }
}

// Escalation matrix: who owns an unresolved complaint as it ages past SLA.
// Level 0 is the normal assignee; each manual escalation moves it up a tier.
const ESCALATION_MATRIX = [
  { level: 0, label: "Maintenance staff", note: "First responder — assigned staff handles the complaint." },
  { level: 1, label: "Committee", note: "Breached SLA — committee steps in to expedite." },
  { level: 2, label: "Org admin", note: "Repeatedly overdue — escalated to the organization admin." },
];
const MAX_ESCALATION_LEVEL = ESCALATION_MATRIX[ESCALATION_MATRIX.length - 1].level;

const PRIORITY_ORDER = ["low", "medium", "high", "urgent"];

// Resolve the SLA window for a priority, optionally against a custom org matrix.
function defaultSlaHours(priority, matrix = SLA_MATRIX) {
  return matrix[priority] ?? SLA_MATRIX[priority] ?? SLA_MATRIX.medium;
}

// Raise a priority one notch (low→medium→high→urgent); caps at urgent.
function bumpPriority(priority) {
  const i = PRIORITY_ORDER.indexOf(priority);
  if (i < 0) return priority;
  return PRIORITY_ORDER[Math.min(i + 1, PRIORITY_ORDER.length - 1)];
}

// SQLite stores created_at as "YYYY-MM-DD HH:MM:SS" (UTC, no zone); resolved_at/
// closed_at are JS ISO strings ("…Z"). Parse both as UTC robustly.
function parseTs(ts) {
  if (!ts) return null;
  if (ts.includes("T")) return new Date(ts);
  return new Date(ts.replace(" ", "T") + "Z");
}

const ACTIVE_STATES = new Set(["open", "assigned", "in_progress"]);
const DUE_SOON_FRACTION = 0.25; // within the last 25% of the window → "due soon"

// Compute the SLA standing of one incident row. Returns a plain object suitable
// for embedding in the API response. `nowMs` is injected for testability.
function slaStatus(incident, nowMs = Date.now()) {
  const created = parseTs(incident.created_at);
  const hours = Number(incident.sla_hours) || defaultSlaHours(incident.priority);
  if (!created) {
    return { sla_hours: hours, due_at: null, state: "unknown", breached: false, hours_remaining: null };
  }
  const dueMs = created.getTime() + hours * 3600 * 1000;
  const due_at = new Date(dueMs).toISOString();

  // Resolved/closed: the clock stops at the resolution time → met or breached.
  if (!ACTIVE_STATES.has(incident.status)) {
    const stop = parseTs(incident.resolved_at) || parseTs(incident.closed_at);
    const stopMs = stop ? stop.getTime() : nowMs;
    const breached = stopMs > dueMs;
    return {
      sla_hours: hours,
      due_at,
      state: breached ? "breached" : "met",
      breached,
      hours_remaining: null,
    };
  }

  // Active: how much time is left (negative = overdue).
  const remainingMs = dueMs - nowMs;
  const hours_remaining = Math.round((remainingMs / (3600 * 1000)) * 10) / 10;
  let state;
  if (remainingMs <= 0) state = "breached";
  else if (remainingMs <= hours * 3600 * 1000 * DUE_SOON_FRACTION) state = "due_soon";
  else state = "on_track";

  return { sla_hours: hours, due_at, state, breached: remainingMs <= 0, hours_remaining };
}

module.exports = {
  SLA_MATRIX,
  PRIORITIES,
  MIN_SLA_HOURS,
  MAX_SLA_HOURS,
  ESCALATION_MATRIX,
  MAX_ESCALATION_LEVEL,
  sanitizeMatrix,
  parseMatrix,
  defaultSlaHours,
  bumpPriority,
  slaStatus,
};
