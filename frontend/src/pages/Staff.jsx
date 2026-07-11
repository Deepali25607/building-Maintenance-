import { useEffect, useRef, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";
import FaceScanner from "../components/FaceScanner.jsx";
import { averageDescriptors } from "../lib/faceapi.js";

// Smart Daily Visitor Management — recurring service providers (daily help)
// with AI face-recognition attendance. One-time guests live in /visitors.

const CATEGORY_META = {
  maid:        { label: "Maid",        icon: "🧹" },
  cook:        { label: "Cook",        icon: "🍳" },
  driver:      { label: "Driver",      icon: "🚗" },
  sweeper:     { label: "Sweeper",     icon: "🧽" },
  gardener:    { label: "Gardener",    icon: "🌿" },
  electrician: { label: "Electrician", icon: "⚡" },
  plumber:     { label: "Plumber",     icon: "🔧" },
  milkman:     { label: "Milkman",     icon: "🥛" },
  newspaper:   { label: "Newspaper",   icon: "📰" },
  laundry:     { label: "Laundry",     icon: "👕" },
  nanny:       { label: "Nanny",       icon: "🍼" },
  tutor:       { label: "Tutor",       icon: "📚" },
  carpenter:   { label: "Carpenter",   icon: "🪚" },
  other:       { label: "Other",       icon: "🧰" },
};
// Merge the built-in types with the org's custom ones (from GET /staff) into a
// lookup fn. Unknown keys (e.g. a deleted custom type still on old staff rows)
// fall back to showing the raw key.
function makeCatMeta(categories) {
  const map = { ...CATEGORY_META };
  for (const c of categories || []) {
    if (c.custom) map[c.key] = { label: c.label || c.key, icon: c.icon || "🔖" };
  }
  return (key) => map[key] || { label: key ? String(key).replace(/_/g, " ") : "Other", icon: "🔖" };
}
const builtinCatMeta = makeCatMeta([]);

const STATUS_META = {
  inside: { label: "Inside", cls: "bg-emerald-100 text-emerald-700" },
  left:   { label: "Visited", cls: "bg-sky-100 text-sky-700" },
  absent: { label: "Not visited", cls: "bg-slate-100 text-slate-500" },
};

// Backend timestamps are UTC "YYYY-MM-DD HH:MM:SS" — normalize before parsing.
function toDate(ts) {
  if (!ts) return null;
  return new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z");
}
function fmtTime(ts) {
  const d = toDate(ts);
  return d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function localISODate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function StaffAvatar({ s, size = "w-11 h-11", cat = builtinCatMeta }) {
  return s.photo_url ? (
    <img src={s.photo_url} alt="" className={`${size} rounded-full object-cover border border-line shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-surface-2 border border-line flex items-center justify-center text-lg shrink-0`}>
      {cat(s.category).icon}
    </div>
  );
}

export default function Staff() {
  const { can } = useAuth();
  const canCreate = can("staff", "create");
  const canManage = can("staff", "edit");
  const canDelete = can("staff", "delete");

  const [tab, setTab] = useState("today"); // today | directory | report
  const [staff, setStaff] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (new) | staff row
  const [kioskOpen, setKioskOpen] = useState(false);
  const cat = makeCatMeta(categories);

  function load() {
    setLoading(true);
    api.get("/staff")
      .then((r) => { setStaff(r.data.staff || []); setCategories(r.data.categories || []); })
      .catch((e) => setErr(e.response?.data?.error || "Failed to load staff"))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function manualPunch(s, direction) {
    setErr(""); setMsg("");
    try {
      const r = await api.post(`/staff/${s.id}/punch`, { direction });
      const d = r.data;
      setMsg(d.reason === "not_in"
        ? `${s.name} has no IN record today — mark IN first.`
        : d.duplicate
        ? `${s.name} is already marked ${d.direction.toUpperCase()}.`
        : `${s.name} marked ${d.direction === "in" ? "IN" : "OUT"} at ${fmtTime(d.direction === "in" ? d.session.in_at : d.session.out_at)}.`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Could not mark attendance");
    }
  }

  async function removeStaff(s) {
    if (!window.confirm(`Remove ${s.name} and their attendance history?`)) return;
    try {
      await api.delete(`/staff/${s.id}`);
      setMsg(`${s.name} removed.`);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Could not remove staff member");
    }
  }

  const insideCount = staff.filter((s) => s.today?.status === "inside").length;
  const visitedCount = staff.filter((s) => s.today?.status !== "absent").length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">Daily Staff &amp; Helpers</h1>
          <p className="text-muted text-sm">
            {canManage
              ? "Recurring service providers — attendance is auto-marked by AI face recognition at the gate."
              : "Your household helpers and their daily attendance, verified by face recognition at the gate."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <button className="btn-primary" onClick={() => setKioskOpen(true)}>📷 Face Kiosk</button>
          )}
          {canCreate && (
            <button className="btn-secondary" onClick={() => setEditing({})}>+ Register staff</button>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {/* Today at a glance */}
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-md">
        <div className="card p-3 text-center">
          <div className="text-xl font-bold">{staff.filter((s) => s.active).length}</div>
          <div className="text-[11px] text-muted">Active staff</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-xl font-bold text-emerald-600">{insideCount}</div>
          <div className="text-[11px] text-muted">Inside now</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-xl font-bold text-sky-600">{visitedCount}</div>
          <div className="text-[11px] text-muted">Visited today</div>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {[["today", "Today's attendance"], ["directory", "Staff directory"], ["report", "Monthly report"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-sm rounded-full px-3 py-1.5 border ${
              tab === k ? "bg-brand-600 text-white border-brand-600" : "border-line hover:bg-surface-2"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-12">Loading staff…</div>
      ) : tab === "today" ? (
        <TodayTab staff={staff} cat={cat} canManage={canManage} onPunch={manualPunch} />
      ) : tab === "directory" ? (
        <DirectoryTab staff={staff} cat={cat} canManage={canManage} canDelete={canDelete}
          onEdit={(s) => setEditing(s)} onDelete={removeStaff} />
      ) : (
        <ReportTab cat={cat} />
      )}

      {editing !== null && (
        <StaffForm
          initial={editing.id ? editing : null}
          categories={categories}
          cat={cat}
          canCreateType={canCreate}
          onCategoriesChanged={setCategories}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            setMsg(created ? "Staff member registered." : "Staff member updated.");
            load();
          }}
        />
      )}

      {kioskOpen && <FaceKiosk cat={cat} onClose={() => { setKioskOpen(false); load(); }} />}
    </div>
  );
}

// ─── Today's register ───────────────────────────────────────────────────────
function TodayTab({ staff, cat, canManage, onPunch }) {
  const active = staff.filter((s) => s.active);
  if (active.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">No staff registered yet.</div>;
  }
  // Inside first, then visited, then absent.
  const order = { inside: 0, left: 1, absent: 2 };
  const sorted = [...active].sort((a, b) => order[a.today?.status] - order[b.today?.status] || a.name.localeCompare(b.name));

  return (
    <div className="space-y-3">
      {sorted.map((s) => {
        const st = STATUS_META[s.today?.status] || STATUS_META.absent;
        const sessions = s.today?.sessions || [];
        return (
          <div key={s.id} className="card p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <StaffAvatar s={s} cat={cat} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{s.name}</span>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <span className="badge bg-slate-100 text-slate-600">{cat(s.category).icon} {cat(s.category).label}</span>
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {sessions.length === 0
                      ? "No visit recorded today"
                      : sessions.map((a, i) => (
                          <span key={a.id}>
                            {i > 0 && " · "}
                            {fmtTime(a.in_at)}{a.in_method === "face" ? "🤖" : ""} – {a.out_at ? `${fmtTime(a.out_at)}${a.out_method === "face" ? "🤖" : ""}` : "…"}
                          </span>
                        ))}
                  </div>
                </div>
              </div>
              {canManage && (
                s.today?.status === "inside" ? (
                  <button onClick={() => onPunch(s, "out")} className="btn-secondary text-xs shrink-0">Mark OUT</button>
                ) : (
                  <button onClick={() => onPunch(s, "in")} className="btn-secondary text-xs shrink-0">Mark IN</button>
                )
              )}
            </div>
          </div>
        );
      })}
      <div className="text-[11px] text-muted">🤖 = automatically recorded by face recognition</div>
    </div>
  );
}

// ─── Directory ──────────────────────────────────────────────────────────────
function DirectoryTab({ staff, cat, canManage, canDelete, onEdit, onDelete }) {
  if (staff.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">No staff registered yet.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {staff.map((s) => (
        <div key={s.id} className={`card p-4 ${s.active ? "" : "opacity-60"}`}>
          <div className="flex items-start gap-3">
            <StaffAvatar s={s} size="w-14 h-14" cat={cat} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{s.name}</span>
                {!s.active && <span className="badge bg-slate-100 text-slate-500">Inactive</span>}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {cat(s.category).icon} {cat(s.category).label}
                {s.phone ? ` · 📞 ${s.phone}` : ""}
              </div>
              <div className="text-xs mt-1">
                {s.face_enrolled
                  ? <span className="text-emerald-600">🤖 Face enrolled — auto attendance on</span>
                  : <span className="text-amber-600">⚠ No face enrolled — manual attendance only</span>}
              </div>
              {s.flats?.length > 0 && (
                <div className="text-[11px] text-muted mt-1 truncate">
                  🏢 Works in: {s.flats.map((f) => f.label).join(", ")}
                </div>
              )}
            </div>
            {(canManage || canDelete) && (
              <div className="flex flex-col gap-1 shrink-0">
                {canManage && <button className="btn-secondary text-xs" onClick={() => onEdit(s)}>Edit</button>}
                {canDelete && <button className="btn-secondary text-xs text-red-600" onClick={() => onDelete(s)}>Delete</button>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly report ─────────────────────────────────────────────────────────
function ReportTab({ cat }) {
  const [month, setMonth] = useState(() => localISODate().slice(0, 7));
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/staff/attendance/report", { params: { month } })
      .then((r) => setReport(r.data.report || []))
      .catch(() => setReport([]))
      .finally(() => setLoading(false));
  }, [month]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="font-semibold">Attendance summary</h2>
        <input type="month" className="input !w-auto" value={month} max={localISODate().slice(0, 7)}
          onChange={(e) => setMonth(e.target.value)} />
      </div>
      {loading ? (
        <div className="text-sm text-muted text-center py-8">Loading report…</div>
      ) : report.length === 0 ? (
        <div className="text-sm text-muted text-center py-8">No staff to report on.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-line">
                <th className="py-2 pr-3">Staff</th>
                <th className="py-2 pr-3">Days present</th>
                <th className="py-2 pr-3">Visits</th>
                <th className="py-2 pr-3">Hours inside</th>
                <th className="py-2">Face punches</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted ml-2">{cat(r.category).icon} {cat(r.category).label}</span>
                  </td>
                  <td className="py-2 pr-3">{r.days_present}</td>
                  <td className="py-2 pr-3">{r.visits}</td>
                  <td className="py-2 pr-3">{r.hours}</td>
                  <td className="py-2">{r.face_punches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Register / edit form with face enrollment ─────────────────────────────
const ENROLL_SAMPLES = 3;

function StaffForm({ initial, categories, cat, canCreateType, onCategoriesChanged, onClose, onSaved }) {
  const isNew = !initial;
  const [flats, setFlats] = useState([]);
  // Inline "create service type" mini-form
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState({ label: "", icon: "" });
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeErr, setTypeErr] = useState("");
  const [form, setForm] = useState({
    name: initial?.name || "",
    category: initial?.category || "maid",
    phone: initial?.phone || "",
    address: initial?.address || "",
    id_proof: initial?.id_proof || "",
    notes: initial?.notes || "",
    active: initial ? !!initial.active : true,
    flat_ids: initial?.flats?.map((f) => f.id) || [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Face enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [samples, setSamples] = useState([]);
  const [descriptor, setDescriptor] = useState(null); // newly captured this session
  const [snapshotBlob, setSnapshotBlob] = useState(null);
  const [clearFace, setClearFace] = useState(false);
  const lastSampleAt = useRef(0);
  const hasFace = descriptor ? true : clearFace ? false : !!initial?.face_enrolled;

  useEffect(() => {
    api.get("/staff/flat-options").then((r) => setFlats(r.data.flats || [])).catch(() => {});
  }, []);

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  async function addServiceType() {
    setTypeErr("");
    if (!newType.label.trim()) { setTypeErr("Type name is required."); return; }
    setTypeBusy(true);
    try {
      const r = await api.post("/staff/categories", {
        label: newType.label.trim(),
        icon: newType.icon.trim() || undefined,
      });
      onCategoriesChanged?.(r.data.categories || []);
      update({ category: r.data.key }); // select the freshly created type
      setNewType({ label: "", icon: "" });
      setAddingType(false);
    } catch (e) {
      setTypeErr(e.response?.data?.error || "Could not create service type");
    } finally {
      setTypeBusy(false);
    }
  }

  function toggleFlat(id) {
    update({
      flat_ids: form.flat_ids.includes(id)
        ? form.flat_ids.filter((x) => x !== id)
        : [...form.flat_ids, id],
    });
  }

  async function onFace({ descriptor: d, score, snapshot }) {
    // Space samples out so we get genuinely different frames (pose/expression).
    const now = Date.now();
    if (score < 0.6 || now - lastSampleAt.current < 900) return;
    lastSampleAt.current = now;

    const next = [...samples, d];
    setSamples(next);
    if (next.length === 1) snapshot().then(setSnapshotBlob).catch(() => {});
    if (next.length >= ENROLL_SAMPLES) {
      setDescriptor(averageDescriptors(next));
      setClearFace(false);
      setEnrolling(false);
      setSamples([]);
    }
  }

  async function submit(e) {
    e?.preventDefault();
    setErr("");
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setBusy(true);
    try {
      // Upload the enrollment snapshot as the profile photo, if we captured one.
      let photo_url;
      if (descriptor && snapshotBlob) {
        const fd = new FormData();
        fd.append("file", snapshotBlob, "face.jpg");
        try {
          const up = await api.post("/uploads/staff", fd);
          photo_url = up.data.url;
        } catch { /* photo is optional — enrollment still proceeds */ }
      }

      const payload = {
        ...form,
        ...(photo_url ? { photo_url } : {}),
        ...(descriptor ? { face_descriptor: descriptor } : clearFace ? { face_descriptor: null } : {}),
      };
      if (isNew) await api.post("/staff", payload);
      else await api.patch(`/staff/${initial.id}`, payload);
      onSaved(isNew);
    } catch (e2) {
      setErr(e2.response?.data?.error || "Could not save staff member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? "Register a service provider" : `Edit ${initial.name}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || enrolling} onClick={submit}>
          {busy ? "Saving…" : isNew ? "Register" : "Save changes"}
        </button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Full name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} maxLength={120} required
              onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Service type</label>
              {canCreateType && !addingType && (
                <button type="button" className="text-xs text-brand-700 hover:underline"
                  onClick={() => { setTypeErr(""); setAddingType(true); }}>
                  + New type
                </button>
              )}
            </div>
            <select className="input" value={form.category} onChange={(e) => update({ category: e.target.value })}>
              {(categories?.length ? categories : Object.keys(CATEGORY_META).map((key) => ({ key }))).map((c) => (
                <option key={c.key} value={c.key}>{cat(c.key).icon} {cat(c.key).label}</option>
              ))}
            </select>
          </div>
        </div>

        {addingType && (
          <div className="border border-line rounded-lg p-3 bg-surface-2/50">
            <div className="text-xs font-medium mb-2">Create a new service type</div>
            <div className="flex gap-2 items-start flex-wrap">
              <input className="input !w-16 text-center" placeholder="🔖" maxLength={4} title="Emoji (optional)"
                value={newType.icon} onChange={(e) => setNewType((t) => ({ ...t, icon: e.target.value }))} />
              <input className="input flex-1 min-w-[140px]" placeholder="e.g. Yoga Trainer" maxLength={40}
                value={newType.label} onChange={(e) => setNewType((t) => ({ ...t, label: e.target.value }))} />
              <button type="button" className="btn-primary text-xs" disabled={typeBusy} onClick={addServiceType}>
                {typeBusy ? "Adding…" : "Add"}
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => setAddingType(false)}>Cancel</button>
            </div>
            {typeErr && <div className="text-xs text-red-600 mt-2">{typeErr}</div>}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} maxLength={20}
              onChange={(e) => update({ phone: e.target.value })} />
          </div>
          <div>
            <label className="label">ID proof <span className="text-slate-400">(e.g. Aadhaar last 4)</span></label>
            <input className="input" value={form.id_proof} maxLength={60}
              onChange={(e) => update({ id_proof: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} maxLength={200}
            onChange={(e) => update({ address: e.target.value })} />
        </div>

        {/* Face enrollment — the AI part */}
        <div className="border border-line rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-medium">🤖 Face ID enrollment</div>
              <div className="text-xs text-muted">
                {hasFace
                  ? "Face enrolled — attendance is marked automatically at the kiosk."
                  : "Scan the face once; the gate kiosk will then mark IN/OUT automatically."}
              </div>
            </div>
            <div className="flex gap-1.5">
              {!enrolling && (
                <button type="button" className="btn-secondary text-xs"
                  onClick={() => { setSamples([]); setEnrolling(true); }}>
                  {hasFace ? "Re-scan face" : "Scan face"}
                </button>
              )}
              {hasFace && !enrolling && (
                <button type="button" className="btn-secondary text-xs text-red-600"
                  onClick={() => { setDescriptor(null); setSnapshotBlob(null); setClearFace(true); }}>
                  Remove
                </button>
              )}
            </div>
          </div>

          {enrolling && (
            <div className="mt-3">
              <FaceScanner onFace={onFace} className="max-w-sm mx-auto" />
              <div className="flex items-center justify-center gap-2 mt-2">
                {Array.from({ length: ENROLL_SAMPLES }).map((_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < samples.length ? "bg-emerald-500" : "bg-slate-300"}`} />
                ))}
                <span className="text-xs text-muted ml-1">
                  capturing {samples.length}/{ENROLL_SAMPLES} — look at the camera, vary the angle slightly
                </span>
                <button type="button" className="btn-secondary text-xs ml-2" onClick={() => setEnrolling(false)}>Cancel</button>
              </div>
            </div>
          )}
          {descriptor && !enrolling && (
            <div className="text-xs text-emerald-600 mt-2">✓ New face captured — will be saved with this form.</div>
          )}
        </div>

        <div>
          <label className="label">Works in flats <span className="text-slate-400">(residents get arrival alerts)</span></label>
          <div className="max-h-36 overflow-y-auto border border-line rounded-lg p-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
            {flats.length === 0 && <div className="text-xs text-muted col-span-full p-1">No flats found.</div>}
            {flats.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 text-xs p-1 rounded hover:bg-surface-2 cursor-pointer">
                <input type="checkbox" checked={form.flat_ids.includes(f.id)} onChange={() => toggleFlat(f.id)} />
                <span className="truncate">{f.label}{f.owner_name ? ` — ${f.owner_name}` : ""}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[50px]" value={form.notes} maxLength={500}
            onChange={(e) => update({ notes: e.target.value })} />
        </div>

        {!isNew && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => update({ active: e.target.checked })} />
            Active (inactive staff can't punch attendance)
          </label>
        )}

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      </form>
    </Modal>
  );
}

// ─── Gate kiosk: pick IN or OUT mode, then continuous face recognition ──────
function FaceKiosk({ cat, onClose }) {
  // No mode is preselected — recognition stays idle until the operator
  // explicitly chooses Check IN or Check OUT.
  const [mode, setMode] = useState(null); // null | 'in' | 'out'
  const [result, setResult] = useState(null); // {staff,direction,...} | {noMatch} | {error} | null
  const [paused, setPaused] = useState(false);
  const busyRef = useRef(false);
  // The detection loop captures `mode` via ref so a mid-scan switch applies immediately.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  async function onFace({ descriptor, score }) {
    if (!modeRef.current || busyRef.current || score < 0.6) return;
    busyRef.current = true;
    setPaused(true);
    try {
      const r = await api.post("/staff/recognize", { descriptor, direction: modeRef.current });
      setResult(r.data);
    } catch (e) {
      if (e.response?.status === 404) setResult({ noMatch: true });
      else setResult({ error: e.response?.data?.error || "Recognition failed — try again." });
    }
    // Show the outcome, then resume scanning after a short cooldown.
    setTimeout(() => {
      setResult(null);
      setPaused(false);
      busyRef.current = false;
    }, 3500);
  }

  function switchMode(m) {
    setMode(m);
    setResult(null); // stale banner from the other mode would mislead
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white">
            <div className="font-display text-lg font-semibold">📷 Attendance Kiosk</div>
            <div className="text-xs text-white/60">
              {mode ? "Staff look at the camera — attendance records automatically" : "Select Check IN or Check OUT to begin"}
            </div>
          </div>
          <button className="btn-secondary text-sm" onClick={onClose}>✕ Close</button>
        </div>

        {/* Mode selector: the two kiosk options. Until one is picked the
            camera shows a preview but recognition stays paused. */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button onClick={() => switchMode("in")}
            className={`rounded-xl py-3 font-semibold text-lg border-2 transition-colors ${
              mode === "in"
                ? "bg-emerald-500 border-emerald-400 text-white"
                : `bg-white/5 text-white/60 hover:bg-white/10 ${mode === null ? "border-white/40 animate-pulse" : "border-white/15"}`
            }`}>
            ✅ Check IN
          </button>
          <button onClick={() => switchMode("out")}
            className={`rounded-xl py-3 font-semibold text-lg border-2 transition-colors ${
              mode === "out"
                ? "bg-orange-500 border-orange-400 text-white"
                : `bg-white/5 text-white/60 hover:bg-white/10 ${mode === null ? "border-white/40 animate-pulse" : "border-white/15"}`
            }`}>
            👋 Check OUT
          </button>
        </div>

        <FaceScanner onFace={onFace} paused={paused || !mode} />

        <div className="mt-3 min-h-[92px]">
          {!mode ? (
            <div className="rounded-xl p-4 bg-white/10 text-white/90 text-center text-sm">
              👆 Choose <span className="font-semibold text-emerald-300">Check IN</span> or{" "}
              <span className="font-semibold text-orange-300">Check OUT</span> above to start scanning.
            </div>
          ) : result?.staff ? (
            result.reason === "already_in" ? (
              <KioskBanner tone="amber" s={result.staff} cat={cat}
                title={`${result.staff.name} is already checked IN`}
                sub={`Inside since ${fmtTime(result.session?.in_at)} — switch to Check OUT to mark their exit.`} />
            ) : result.reason === "not_in" ? (
              <KioskBanner tone="amber" s={result.staff} cat={cat}
                title={`${result.staff.name} has no IN record today`}
                sub="Switch to Check IN first to open today's attendance." />
            ) : result.duplicate ? (
              <KioskBanner tone="amber" s={result.staff} cat={cat}
                title={`${result.staff.name} — already recorded`}
                sub="This punch was registered a moment ago." />
            ) : (
              <KioskBanner tone={result.direction === "in" ? "green" : "orange"} s={result.staff} cat={cat}
                title={`${result.direction === "in" ? "✅ Welcome" : "👋 Goodbye"}, ${result.staff.name}!`}
                sub={`Marked ${result.direction.toUpperCase()} at ${fmtTime(
                  result.direction === "in" ? result.session.in_at : result.session.out_at
                )} · match ${Math.round(result.confidence * 100)}%`} />
            )
          ) : result?.noMatch ? (
            <div className="rounded-xl p-4 bg-amber-500 text-white text-center">
              <div className="font-semibold">🤔 Face not recognized</div>
              <div className="text-sm text-white/90">Register this person from “+ Register staff”, or mark attendance manually.</div>
            </div>
          ) : result?.error ? (
            <div className="rounded-xl p-4 bg-red-500 text-white text-center text-sm">{result.error}</div>
          ) : (
            <div className="text-center text-white/50 text-sm py-4">
              Scanning for {mode === "in" ? "check-IN" : "check-OUT"}…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KIOSK_TONES = {
  green: "bg-emerald-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
};

function KioskBanner({ tone, s, cat, title, sub }) {
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 text-white ${KIOSK_TONES[tone]}`}>
      <StaffAvatar s={s} size="w-12 h-12" cat={cat} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-lg truncate">{title}</div>
        <div className="text-sm text-white/90">{sub}</div>
      </div>
    </div>
  );
}
