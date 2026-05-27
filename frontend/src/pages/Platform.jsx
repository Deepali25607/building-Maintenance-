import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Platform() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(null);

  function load() {
    setLoading(true);
    api.get("/apartments")
      .then((r) => setOrgs(r.data.apartments || []))
      .catch((e) => setErr(e.response?.data?.error || "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function viewAs(orgId) {
    localStorage.setItem("viewing_org_id", String(orgId));
    // Reload so every page re-fetches with the new header.
    window.location.href = "/";
  }

  function exitViewAs() {
    localStorage.removeItem("viewing_org_id");
    window.location.reload();
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

  const viewingOrgId = localStorage.getItem("viewing_org_id");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Platform administration</h1>
        <p className="text-muted text-sm">
          Every organization on this instance. As the platform admin you can switch context into any
          tenant ("View as"), or remove a tenant entirely.
        </p>
      </div>

      {msg && <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {loading ? (
        <div className="text-sm text-muted text-center py-12">Loading organizations…</div>
      ) : orgs.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No organizations yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orgs.map((o) => (
            <OrgCard key={o.id} org={o}
              isViewing={String(o.id) === viewingOrgId}
              isHomeOrg={user?.apartment_id === o.id}
              onViewAs={() => viewAs(o.id)}
              onDelete={() => setDeleting(o)}
            />
          ))}
        </div>
      )}

      {viewingOrgId && (
        <div className="mt-6 text-center">
          <button onClick={exitViewAs} className="btn-secondary text-xs">
            Exit "View as" mode
          </button>
        </div>
      )}

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

function OrgCard({ org, isViewing, isHomeOrg, onViewAs, onDelete }) {
  return (
    <div className={`card p-5 ${isViewing ? "ring-2 ring-amber-400" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold text-brand-700 truncate">{org.name}</div>
          {org.tagline && <div className="text-xs text-accent uppercase tracking-wide mt-0.5">{org.tagline}</div>}
          {org.address && <div className="text-xs text-muted mt-1 truncate">📍 {org.address}</div>}
        </div>
        {isHomeOrg && (
          <span className="badge bg-brand-100 text-brand-700 shrink-0">your home org</span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Users" value={org.user_count ?? 0} />
        <Stat label="Flats" value={org.flat_count ?? 0} />
        <Stat label="Bills" value={org.bill_count ?? 0} />
        <Stat label="Open issues" value={org.open_incidents ?? 0} tone={org.open_incidents > 0 ? "red" : undefined} />
        <Stat label="Active announcements" value={org.active_announcements ?? 0} />
        <Stat label="Org ID" value={`#${org.id}`} />
      </div>

      <div className="mt-4 pt-3 border-t border-line flex flex-wrap gap-2">
        <button onClick={onViewAs} disabled={isViewing}
          className="btn-primary text-xs">
          {isViewing ? "✓ Currently viewing" : "View as this org"}
        </button>
        {!isHomeOrg && (
          <button onClick={onDelete} className="btn-secondary text-xs text-red-600">
            🗑 Delete
          </button>
        )}
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
