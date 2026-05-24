import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-slate-200 text-slate-600",
  completed: "bg-blue-100 text-blue-700",
};

function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((new Date(dateStr) - new Date(today)) / 86400000);
}

export default function Announcements() {
  const { user, can } = useAuth();
  const [list, setList] = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [filter, setFilter] = useState("all"); // all | active | expired | completed

  function load() {
    api.get("/announcements").then((r) => setList(r.data.announcements));
  }
  useEffect(load, []);

  const canPost = can("announcements", "create");
  const canEdit = can("announcements", "edit");

  async function remove(id) {
    if (!confirm("Delete this announcement?")) return;
    await api.delete(`/announcements/${id}`);
    load();
  }
  async function markCompleted(a) {
    await api.patch(`/announcements/${a.id}`, { completed: 1 });
    load();
  }
  async function reopen(a) {
    await api.patch(`/announcements/${a.id}`, { completed: 0 });
    load();
  }
  async function extend(a) {
    const next = prompt("Extend active-until date (YYYY-MM-DD):", a.active_until || "");
    if (!next) return;
    await api.patch(`/announcements/${a.id}`, { active_until: next });
    load();
  }

  const counts = list.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});
  const filtered = filter === "all" ? list : list.filter((a) => a.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-slate-500 text-sm">
            Set an "active until" date so announcements automatically scroll on the dashboard until they expire or are marked completed.
          </p>
        </div>
        {canPost && <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Post announcement</button>}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap text-xs">
        {[
          { v: "all", label: `All (${list.length})`, tone: "bg-slate-100 text-slate-700 border-slate-200" },
          { v: "active", label: `Active (${counts.active || 0})`, tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
          { v: "expired", label: `Expired (${counts.expired || 0})`, tone: "bg-slate-200 text-slate-600 border-slate-300" },
          { v: "completed", label: `Completed (${counts.completed || 0})`, tone: "bg-blue-100 text-blue-700 border-blue-200" },
        ].map((opt) => (
          <button key={opt.v}
            onClick={() => setFilter(opt.v)}
            className={`px-3 py-1 rounded border font-medium ${
              filter === opt.v ? "ring-2 ring-offset-1 ring-current " + opt.tone : opt.tone + " opacity-70 hover:opacity-100"
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-slate-400 text-sm card p-6 text-center">
            {filter === "all" ? "No announcements yet." : `No ${filter} announcements.`}
          </div>
        )}
        {filtered.map((a) => {
          const days = daysFromToday(a.active_until);
          return (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold">{a.pinned ? "📌 " : ""}{a.title}</span>
                    <span className={`badge ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    {a.active_until && a.status === "active" && (
                      <span className="text-[11px] text-slate-500">
                        {days === 0 ? "ends today" :
                          days === 1 ? "1 day left" :
                          `${days} days left · until ${a.active_until}`}
                      </span>
                    )}
                    {a.active_until && a.status === "expired" && (
                      <span className="text-[11px] text-slate-500">expired {a.active_until}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {a.author_name} · {a.created_at?.slice(0, 16).replace("T", " ")}
                    {a.completed_at && ` · completed ${a.completed_at.slice(0, 10)}`}
                  </div>
                  <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{a.body}</div>
                </div>
              </div>

              {canEdit && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                  {a.status === "active" && (
                    <button className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      onClick={() => markCompleted(a)}>
                      ✓ Mark completed
                    </button>
                  )}
                  {(a.status === "active" || a.status === "expired") && (
                    <button className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                      onClick={() => extend(a)}>
                      📅 {a.active_until ? "Change date" : "Set active-until"}
                    </button>
                  )}
                  {a.status === "completed" && (
                    <button className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                      onClick={() => reopen(a)}>
                      ↺ Reopen
                    </button>
                  )}
                  <button className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 ml-auto"
                    onClick={() => remove(a.id)}>
                    🗑 Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <NewAnnouncement open={openNew} onClose={() => setOpenNew(false)} onCreated={load} />
    </div>
  );
}

function NewAnnouncement({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", body: "", pinned: 0, active_until: "" });
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    try {
      await api.post("/announcements", {
        title: form.title,
        body: form.body,
        pinned: form.pinned,
        active_until: form.active_until || null,
      });
      onCreated();
      onClose();
      setForm({ title: "", body: "", pinned: 0, active_until: "" });
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    }
  }

  // Sensible default: today + 7 days
  function suggestWeekFromNow() {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setForm({ ...form, active_until: d.toISOString().slice(0, 10) });
  }

  return (
    <Modal open={open} onClose={onClose} title="New announcement"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Post</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Water tank cleaning on the 15th" />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-[100px]" value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Short, scrollable text works best for the dashboard ticker." />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Active until (completion date)</label>
            <button type="button" onClick={suggestWeekFromNow}
              className="text-xs text-brand-700 hover:underline">+7 days</button>
          </div>
          <input className="input" type="date" value={form.active_until}
            onChange={(e) => setForm({ ...form, active_until: e.target.value })} />
          <p className="text-[11px] text-slate-400 mt-1">
            Leave empty for a permanent notice. Otherwise it will scroll on the dashboard until this date — or until you mark it completed.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.pinned}
            onChange={(e) => setForm({ ...form, pinned: e.target.checked ? 1 : 0 })} />
          Pin to top (also pinned in the ticker)
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
