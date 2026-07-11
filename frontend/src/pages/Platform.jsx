import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";

export default function Platform() {
  const [tab, setTab] = useState("orgs");
  const [orgs, setOrgs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  function load() {
    setLoading(true);
    api.get("/apartments")
      .then((r) => setOrgs(r.data.apartments || []))
      .catch((e) => setErr(e.response?.data?.error || "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    api.get("/apartments/plans").then((r) => setPlans(r.data.plans || [])).catch(() => {});
    api.get("/apartments/features-catalog").then((r) => setCatalog(r.data.features || [])).catch(() => {});
    api.get("/platform/contact-messages").then((r) => setUnreadMsgs(r.data.unread || 0)).catch(() => {});
  }, []);

  async function changePlan(orgId, plan) {
    setErr("");
    setMsg("");
    try {
      await api.patch(`/apartments/${orgId}/plan`, { plan });
      const p = plans.find((x) => x.key === plan);
      setMsg(`Plan updated to ${p?.name || plan}.`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to change plan");
    }
  }

  // Override a single feature for an org. value = true | false | null (reset).
  async function setFeature(orgId, key, value) {
    setErr("");
    setMsg("");
    try {
      await api.patch(`/apartments/${orgId}/features`, { features: { [key]: value } });
      setMsg("Features updated.");
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to update features");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setErr("");
    setMsg("");
    try {
      await api.delete(`/apartments/${deleting.id}`);
      setMsg(`Deleted "${deleting.name}".`);
      setDeleting(null);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Delete failed");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Platform administration</h1>
        <p className="text-muted text-sm">
          Every organization on this instance, with aggregate usage and subscription plan. Resident
          data inside each community stays private to that community — it isn't accessible from here.
        </p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-line">
        <TabButton active={tab === "orgs"} onClick={() => setTab("orgs")}>Organizations</TabButton>
        <TabButton active={tab === "contact"} onClick={() => setTab("contact")}>Contact &amp; Support</TabButton>
        <TabButton active={tab === "messages"} onClick={() => setTab("messages")} badge={unreadMsgs}>Messages</TabButton>
      </div>

      {msg && <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {tab === "orgs" && (
        loading ? (
          <div className="text-sm text-muted text-center py-12">Loading organizations…</div>
        ) : orgs.length === 0 ? (
          <div className="card p-8 text-center text-sm text-muted">No organizations yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {orgs.map((o) => (
              <OrgCard key={o.id} org={o}
                plans={plans}
                catalog={catalog}
                onChangePlan={(plan) => changePlan(o.id, plan)}
                onSetFeature={(key, value) => setFeature(o.id, key, value)}
                onDelete={() => setDeleting(o)}
              />
            ))}
          </div>
        )
      )}

      {tab === "contact" && <ContactSettings />}
      {tab === "messages" && <MessagesInbox onUnreadChange={setUnreadMsgs} />}

      <Modal open={!!deleting} onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-danger" onClick={confirmDelete}>Yes, delete permanently</button>
        </>}>
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800">
            <div className="font-semibold mb-1">⚠ This cannot be undone</div>
            All {deleting?.flat_count || 0} flats, {deleting?.bill_count || 0} bills,
            all incidents, vendors, expenses, and announcements for this organization
            will be removed. User accounts associated with the org will be detached
            (their <code>apartment_id</code> set to NULL) but not deleted.
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OrgCard({ org, plans, catalog, onChangePlan, onSetFeature, onDelete }) {
  const [showFeatures, setShowFeatures] = useState(false);
  const limit = org.flat_limit; // null === unlimited
  const used = org.flat_count ?? 0;
  const atLimit = limit !== null && used >= limit;
  const flatsLabel = `${used} / ${limit === null ? "∞" : limit}`;

  // Plan default for a feature = core OR listed in the plan's feature set.
  const planFeatures = new Set((plans.find((p) => p.key === org.plan)?.features) || []);
  const planDefault = (key, core) => core || planFeatures.has(key);

  const gateable = (catalog || []).filter((c) => !c.core);
  const enabledCount = gateable.filter((c) => !!org.features?.[c.key]).length;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-display text-xl font-semibold text-brand-700 truncate">{org.name}</div>
            {org.org_code && (
              <span className="badge bg-slate-100 text-slate-600 font-mono text-[10px] shrink-0">{org.org_code}</span>
            )}
          </div>
          {org.tagline && <div className="text-xs text-accent uppercase tracking-wide mt-0.5">{org.tagline}</div>}
          {org.address && <div className="text-xs text-muted mt-1 truncate">📍 {org.address}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {org.plan_name && (
            <span className="badge bg-violet-100 text-violet-700">{org.plan_name}</span>
          )}
          {org.plan === "trial" && (
            <span className={`badge ${org.trial_expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
              {org.trial_expired ? "trial expired" : `${org.trial_days_left}d left`}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Users" value={org.user_count ?? 0} />
        <Stat label="Flats" value={flatsLabel} tone={atLimit ? "red" : undefined} />
        <Stat label="Bills" value={org.bill_count ?? 0} />
        <Stat label="Open issues" value={org.open_incidents ?? 0} tone={org.open_incidents > 0 ? "red" : undefined} />
        <Stat label="Active announcements" value={org.active_announcements ?? 0} />
        <Stat label="Org ID" value={org.org_code || `#${org.id}`} />
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <label className="text-[10px] uppercase tracking-wide text-muted block mb-1">Subscription plan</label>
        <select className="input text-xs py-1.5"
          value={org.plan || "starter"}
          onChange={(e) => onChangePlan(e.target.value)}>
          {(plans || []).map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} — {p.blurb}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <button onClick={() => setShowFeatures((s) => !s)}
          className="w-full flex items-center justify-between text-[10px] uppercase tracking-wide text-muted hover:text-fg">
          <span>Features &amp; modules</span>
          <span>{enabledCount}/{gateable.length} on · {showFeatures ? "▲" : "▼"}</span>
        </button>
        {showFeatures && (
          <div className="mt-3 space-y-1.5">
            {gateable.map((c) => {
              const def = planDefault(c.key, c.core);
              const on = !!org.features?.[c.key];
              const overridden = on !== def;
              return (
                <div key={c.key} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="truncate">{c.label}</span>
                    <span className="ml-1.5 text-[10px] text-muted">
                      ({c.category === "premium" ? "premium" : "module"} · default {def ? "on" : "off"})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {overridden && (
                      <button onClick={() => onSetFeature(c.key, null)}
                        title="Reset to plan default"
                        className="text-[10px] text-brand-700 hover:underline">reset</button>
                    )}
                    <button onClick={() => onSetFeature(c.key, !on)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        on ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                           : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                      {on ? "On" : "Off"}{overridden ? " ✦" : ""}
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="text-[10px] text-muted pt-1">✦ = overridden from the plan default</div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-line flex justify-end">
        <button onClick={onDelete} className="btn-secondary text-xs text-red-600">
          🗑 Delete organization
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-md bg-surface-2/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-semibold ${tone === "red" ? "text-red-600" : "text-fg"}`}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, badge, children }) {
  return (
    <button onClick={onClick}
      className={`relative px-3 sm:px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
        active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-fg"
      }`}>
      {children}
      {badge > 0 && (
        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold align-middle">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// Platform-operator's public contact/support details — what tenants see on the
// in-app Contact page, the chatbot, and the trial-suspended screen.
const CONTACT_FIELDS = [
  { key: "company_name", label: "Company name", placeholder: "Apartment Management Platform" },
  { key: "sales_email", label: "Sales email", type: "email", placeholder: "sales@…" },
  { key: "sales_phone", label: "Sales phone", placeholder: "+91 …" },
  { key: "support_email", label: "Support email", type: "email", placeholder: "support@…" },
  { key: "support_phone", label: "Support phone", placeholder: "+91 …" },
  { key: "whatsapp_number", label: "WhatsApp number", placeholder: "+91 98765 43210", hint: "Used for the chatbot's \"Chat on WhatsApp\" button (include country code)" },
];

function ContactSettings() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/platform/contact").then((r) => setForm(r.data.contact)).catch((e) =>
      setErr(e.response?.data?.error || "Failed to load contact settings"));
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await api.put("/platform/contact", form);
      setForm(r.data.contact);
      setMsg("Contact details saved. Tenants will see these immediately.");
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <div className="text-sm text-muted text-center py-12">Loading…</div>;

  return (
    <form onSubmit={save} className="card p-5 max-w-2xl space-y-4">
      <div>
        <h2 className="font-semibold">Contact &amp; support details</h2>
        <p className="text-xs text-muted">Shown to every organization on their Help &amp; Contact page, in the chatbot, and on the trial-ended screen.</p>
      </div>
      {msg && <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="p-2.5 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CONTACT_FIELDS.map((f) => (
          <div key={f.key} className={f.key === "company_name" ? "sm:col-span-2" : ""}>
            <label className="label">{f.label}</label>
            <input className="input" type={f.type || "text"} placeholder={f.placeholder}
              value={form[f.key] || ""}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            {f.hint && <div className="text-[11px] text-muted mt-1">{f.hint}</div>}
          </div>
        ))}
      </div>

      <div>
        <label className="label">Intro message <span className="text-slate-400">(Help &amp; Contact page + suspended screen)</span></label>
        <textarea className="input min-h-[72px]" value={form.contact_message || ""}
          onChange={(e) => setForm({ ...form, contact_message: e.target.value })} />
      </div>
      <div>
        <label className="label">Chatbot greeting <span className="text-slate-400">(first message in the assistant)</span></label>
        <textarea className="input min-h-[72px]" value={form.chatbot_greeting || ""}
          onChange={(e) => setForm({ ...form, chatbot_greeting: e.target.value })} />
      </div>

      <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save contact details"}</button>
    </form>
  );
}

const SOURCE_LABEL = {
  contact: { text: "Contact page", cls: "bg-sky-100 text-sky-700" },
  chatbot: { text: "Chatbot", cls: "bg-violet-100 text-violet-700" },
  trial_block: { text: "Trial ended", cls: "bg-amber-100 text-amber-800" },
};

function MessagesInbox({ onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  function load() {
    setLoading(true);
    api.get("/platform/contact-messages")
      .then((r) => { setMessages(r.data.messages || []); onUnreadChange?.(r.data.unread || 0); })
      .catch((e) => setErr(e.response?.data?.error || "Failed to load messages"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(m, status) {
    await api.patch(`/platform/contact-messages/${m.id}`, { status }).catch(() => {});
    setMessages((xs) => xs.map((x) => (x.id === m.id ? { ...x, status } : x)));
    api.get("/platform/contact-messages").then((r) => onUnreadChange?.(r.data.unread || 0)).catch(() => {});
  }

  if (loading) return <div className="text-sm text-muted text-center py-12">Loading messages…</div>;
  if (err) return <div className="card p-6 text-sm text-red-600">{err}</div>;
  if (messages.length === 0) return <div className="card p-8 text-center text-sm text-muted">No enquiries yet.</div>;

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const src = SOURCE_LABEL[m.source] || SOURCE_LABEL.contact;
        return (
          <div key={m.id} className={`card p-4 ${m.status === "new" ? "border-l-4 border-l-brand-500" : ""}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{m.name}</span>
                  <span className={`badge ${src.cls}`}>{src.text}</span>
                  {m.org_code && <span className="badge bg-slate-100 text-slate-600 font-mono text-[10px]">{m.org_code}</span>}
                  {m.status === "new" && <span className="badge bg-red-100 text-red-700">new</span>}
                  {m.status === "handled" && <span className="badge bg-emerald-100 text-emerald-700">handled</span>}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  <a href={`mailto:${m.email}`} className="text-brand-700 hover:underline">{m.email}</a>
                  {m.phone && <> · {m.phone}</>}
                  {" · "}{timeAgo(m.created_at)}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {m.status === "new" && (
                  <button onClick={() => setStatus(m, "read")} className="btn-secondary text-xs">Mark read</button>
                )}
                {m.status !== "handled" ? (
                  <button onClick={() => setStatus(m, "handled")} className="btn-secondary text-xs text-emerald-700">Mark handled</button>
                ) : (
                  <button onClick={() => setStatus(m, "new")} className="btn-secondary text-xs">Reopen</button>
                )}
              </div>
            </div>
            {m.subject && <div className="text-sm font-medium mt-2">{m.subject}</div>}
            <div className="text-sm text-fg/80 mt-1 whitespace-pre-wrap">{m.message}</div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "";
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
