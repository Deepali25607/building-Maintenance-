import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { defaulterLevel, TILE_STYLES, BADGE_STYLES, LEVEL_LABEL } from "../utils/defaulter.js";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function parseFamily(str) {
  if (!str) return [];
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export default function Flats() {
  const { can } = useAuth();
  const canCreate = can("flats", "create");
  const canEdit = can("flats", "edit");
  const canDelete = can("flats", "delete");
  const [flats, setFlats] = useState([]);
  const [owners, setOwners] = useState([]);
  const [flatForm, setFlatForm] = useState(null);
  const [detailId, setDetailId] = useState(null);

  function load() {
    api.get("/flats").then((r) => setFlats(r.data.flats));
  }
  function loadOwners() {
    return api.get("/users").then((r) => setOwners(r.data.users.filter((u) => u.role === "resident")));
  }
  useEffect(() => { load(); loadOwners(); }, []);

  function reloadAll() { load(); loadOwners(); }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Flats</h1>
          <p className="text-slate-500 text-sm">Click any flat to view owner profile and payment history. Use ✏️ to edit.</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setFlatForm({ mode: "create" })}>+ Add flat</button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {flats.length === 0 && (
          <div className="col-span-full text-center text-slate-400 py-12 card">No flats yet.</div>
        )}
        {flats.map((f) => (
          <FlatTile
            key={f.id}
            flat={f}
            onOpen={() => setDetailId(f.id)}
            onEdit={canEdit ? () => setFlatForm({ mode: "edit", flat: f }) : null}
          />
        ))}
      </div>

      <FlatFormModal
        state={flatForm}
        onClose={() => setFlatForm(null)}
        owners={owners}
        onSaved={reloadAll}
        canDelete={canDelete}
      />
      <FlatDetail
        flatId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => { load(); loadOwners(); }}
      />
    </div>
  );
}

function FlatTile({ flat, onOpen, onEdit }) {
  const hasFinancials = !!flat.summary;
  const due = flat.summary?.due || 0;
  const pending = flat.summary?.pending_months || 0;
  const ob = flat.summary?.opening_balance || 0;
  const level = hasFinancials ? defaulterLevel(pending) : "none";
  const dueTone = due > 0 ? "text-red-600" : due < 0 ? "text-emerald-600" : "text-slate-700";

  return (
    <div className={`relative bg-white rounded-lg border shadow-sm transition group ${TILE_STYLES[level]}`}>
      {level !== "none" && (
        <div className={`absolute top-2 right-12 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE_STYLES[level]}`}>
          {LEVEL_LABEL[level]} · {pending}mo
        </div>
      )}
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          title="Edit flat"
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/80 border border-slate-200 hover:bg-white hover:border-brand-300 text-sm flex items-center justify-center z-10"
        >✏️</button>
      )}

      <button onClick={onOpen} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          {flat.owner_avatar ? (
            <img src={flat.owner_avatar} alt={flat.owner_name} className="w-12 h-12 rounded-full border border-slate-200" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xl">🏠</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg group-hover:text-brand-700">
              {flat.block ? `${flat.block}-` : ""}{flat.flat_number}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {flat.owner_name || <span className="italic text-slate-400">vacant</span>}
            </div>
          </div>
        </div>
        {hasFinancials ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-400">Monthly</div>
              <div className="font-semibold">{fmt(flat.monthly_rate)}</div>
            </div>
            <div>
              <div className="text-slate-400">Outstanding</div>
              <div className={`font-semibold ${dueTone}`}>{fmt(due)}</div>
            </div>
            <div>
              <div className="text-slate-400">Pending</div>
              <div className="font-semibold">{pending} {pending === 1 ? "month" : "months"}</div>
            </div>
            <div>
              <div className="text-slate-400">{ob !== 0 ? "Opening bal." : "Area"}</div>
              {ob !== 0 ? (
                <div className={`font-semibold ${ob > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                  {ob > 0 ? "+" : ""}{fmt(ob)}{ob < 0 && " adv."}
                </div>
              ) : (
                <div>{flat.area_sqft ? `${flat.area_sqft} sqft` : "—"}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-400">Floor</div>
              <div className="font-semibold">{flat.floor || "—"}</div>
            </div>
            <div>
              <div className="text-slate-400">Area</div>
              <div className="font-semibold">{flat.area_sqft ? `${flat.area_sqft} sqft` : "—"}</div>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

const EMPTY_PROFILE = {
  name: "", email: "", phone: "", password: "",
  occupation: "", emergency_contact: "", vehicle_info: "",
  move_in_date: "", bio: "",
  family: [],
  avatar_url: "",
};

function AvatarUploader({ value, name, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/uploads/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(r.data.url);
    } catch (e2) {
      setErr(e2.response?.data?.error || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const fallback = name
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b6cf6&color=fff&size=256&bold=true`
    : null;

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm bg-slate-100 flex items-center justify-center text-2xl shrink-0">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-cover" />
        ) : fallback ? (
          <img src={fallback} alt="" className="w-full h-full object-cover" />
        ) : (
          <span>👤</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-2">
          <label className="btn-secondary text-xs cursor-pointer">
            {busy ? "Uploading…" : (value ? "Change photo" : "Upload photo")}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden" onChange={pick} disabled={busy} />
          </label>
          {value && (
            <button type="button" onClick={() => onChange("")}
              className="text-xs text-slate-500 hover:text-red-600 hover:underline">
              Remove
            </button>
          )}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          PNG/JPG/GIF/WEBP, up to 5MB. Defaults to generated initials.
        </div>
        {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
      </div>
    </div>
  );
}

function FlatFormModal({ state, onClose, owners, onSaved, canDelete }) {
  const mode = state?.mode;
  const existing = state?.flat;
  const [flatForm, setFlatForm] = useState({});
  const [ownerMode, setOwnerMode] = useState("vacant"); // vacant | existing | new
  const [ownerId, setOwnerId] = useState("");
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Initialize form when state changes
  useEffect(() => {
    if (!state) return;
    setErr("");
    if (mode === "edit" && existing) {
      setFlatForm({
        block: existing.block || "",
        flat_number: existing.flat_number || "",
        floor: existing.floor ?? "",
        area_sqft: existing.area_sqft ?? "",
        monthly_rate: existing.monthly_rate ?? 0,
        opening_balance: existing.opening_balance ?? 0,
      });
      if (existing.owner_id) {
        setOwnerMode("existing");
        setOwnerId(String(existing.owner_id));
      } else {
        setOwnerMode("vacant");
        setOwnerId("");
        setProfile(EMPTY_PROFILE);
      }
    } else {
      setFlatForm({ block: "A", flat_number: "", floor: "", area_sqft: "", monthly_rate: 3500, opening_balance: 0 });
      setOwnerMode("vacant");
      setOwnerId("");
      setProfile(EMPTY_PROFILE);
    }
  }, [state]);

  // Load full owner profile when an existing resident is selected
  useEffect(() => {
    if (ownerMode !== "existing" || !ownerId) return;
    api.get(`/users/${ownerId}`).then((r) => {
      const u = r.data.user;
      setProfile({
        name: u.name || "",
        email: u.email || "",
        phone: u.phone || "",
        password: "",
        occupation: u.occupation || "",
        emergency_contact: u.emergency_contact || "",
        vehicle_info: u.vehicle_info || "",
        move_in_date: u.move_in_date || "",
        bio: u.bio || "",
        family: parseFamily(u.family_members),
        avatar_url: u.avatar_url || "",
      });
    });
  }, [ownerId, ownerMode]);

  // When switching to "new", clear out the form
  function handleOwnerModeChange(next) {
    setOwnerMode(next);
    if (next === "vacant") { setOwnerId(""); setProfile(EMPTY_PROFILE); }
    if (next === "new") { setOwnerId(""); setProfile(EMPTY_PROFILE); }
  }

  function setFam(i, field, value) {
    const next = [...profile.family];
    next[i] = { ...next[i], [field]: value };
    setProfile({ ...profile, family: next });
  }
  function addFam() {
    setProfile({ ...profile, family: [...profile.family, { name: "", relation: "", age: "" }] });
  }
  function removeFam(i) {
    setProfile({ ...profile, family: profile.family.filter((_, idx) => idx !== i) });
  }

  function profilePayload() {
    const family = profile.family
      .filter((m) => m.name?.trim())
      .map((m) => ({ ...m, age: m.age === "" ? undefined : Number(m.age) }));
    return {
      name: profile.name,
      phone: profile.phone || null,
      occupation: profile.occupation || null,
      emergency_contact: profile.emergency_contact || null,
      vehicle_info: profile.vehicle_info || null,
      move_in_date: profile.move_in_date || null,
      bio: profile.bio || null,
      avatar_url: profile.avatar_url || null,
      family_members: family,
    };
  }

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      // Validate owner inputs
      if (ownerMode === "new") {
        if (!profile.name.trim() || !profile.email.trim() || !profile.password.trim()) {
          throw new Error("New resident requires name, email, and a password");
        }
      }

      // 1. Resolve owner_id (create new resident if needed)
      let resolvedOwnerId = null;
      if (ownerMode === "existing") {
        resolvedOwnerId = Number(ownerId) || null;
      } else if (ownerMode === "new") {
        const r = await api.post("/users", {
          name: profile.name,
          email: profile.email,
          phone: profile.phone || null,
          password: profile.password,
          role: "resident",
        });
        resolvedOwnerId = r.data.user.id;
      }

      // 2. Update owner profile (existing or just-created)
      if (resolvedOwnerId) {
        await api.patch(`/users/${resolvedOwnerId}`, profilePayload());
      }

      // 3. Save flat
      const flatPayload = {
        ...flatForm,
        floor: flatForm.floor === "" ? null : Number(flatForm.floor),
        area_sqft: flatForm.area_sqft === "" ? null : Number(flatForm.area_sqft),
        monthly_rate: Number(flatForm.monthly_rate),
        opening_balance: flatForm.opening_balance === "" ? 0 : Number(flatForm.opening_balance) || 0,
        owner_id: resolvedOwnerId,
      };
      if (mode === "edit") {
        await api.patch(`/flats/${existing.id}`, flatPayload);
      } else {
        await api.post("/flats", flatPayload);
      }

      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setErr("");
    setBusy(true);
    try {
      const r = await api.delete(`/flats/${existing.id}`);
      onSaved();
      onClose();
      setConfirmingDelete(false);
      if (r.data?.cascaded_bills > 0) {
        // Surface a brief side note via console — the parent reload will refresh tiles
        console.info(`Flat deleted. Cascaded ${r.data.cascaded_bills} bills.`);
      }
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const title = mode === "edit"
    ? `Edit flat ${existing.block ? existing.block + "-" : ""}${existing.flat_number}`
    : "Add flat";
  const showProfile = ownerMode === "existing" || ownerMode === "new";
  const showDelete = mode === "edit" && canDelete;

  return (
    <Modal open={!!state} onClose={onClose} title={title}
      footer={<>
        {showDelete && (
          <button className="btn-danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
            🗑 Delete flat
          </button>
        )}
        <div className="flex-1" />
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create flat"}
        </button>
      </>}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto px-1 -mx-1">
        {/* FLAT DETAILS */}
        <section>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Flat details</div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Block</label>
                <input className="input" value={flatForm.block || ""} onChange={(e) => setFlatForm({ ...flatForm, block: e.target.value })} />
              </div>
              <div>
                <label className="label">Flat number</label>
                <input className="input" value={flatForm.flat_number || ""} onChange={(e) => setFlatForm({ ...flatForm, flat_number: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Floor</label>
                <input className="input" type="number" value={flatForm.floor ?? ""} onChange={(e) => setFlatForm({ ...flatForm, floor: e.target.value })} />
              </div>
              <div>
                <label className="label">Area (sqft)</label>
                <input className="input" type="number" value={flatForm.area_sqft ?? ""} onChange={(e) => setFlatForm({ ...flatForm, area_sqft: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Monthly rate</label>
              <input className="input" type="number" value={flatForm.monthly_rate ?? 0} onChange={(e) => setFlatForm({ ...flatForm, monthly_rate: e.target.value })} />
            </div>
            <div>
              <label className="label">Opening balance</label>
              <input className="input" type="number" step="0.01"
                value={flatForm.opening_balance ?? 0}
                onChange={(e) => setFlatForm({ ...flatForm, opening_balance: e.target.value })} />
              <p className="text-[11px] text-muted mt-1">
                <span className="font-medium">Positive</span> = carried-forward dues owed by the flat ·{" "}
                <span className="font-medium">Negative</span> = advance paid by the flat (credit). Use this when migrating from a previous system or when a new owner inherits a balance.
              </p>
            </div>
          </div>
        </section>

        {/* OWNER SECTION */}
        <section className="border-t border-slate-100 pt-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Owner</div>

          <div className="flex gap-2 mb-3">
            {[
              { v: "vacant", label: "Vacant" },
              { v: "existing", label: "Existing resident" },
              { v: "new", label: "+ New resident" },
            ].map((opt) => (
              <button key={opt.v} type="button"
                onClick={() => handleOwnerModeChange(opt.v)}
                className={`text-xs px-3 py-1.5 rounded-md border ${
                  ownerMode === opt.v
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {ownerMode === "existing" && (
            <div className="mb-3">
              <label className="label">Select resident</label>
              <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">— choose —</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name} — {o.email}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Selecting a resident loads their profile below for editing.</p>
            </div>
          )}

          {showProfile && (ownerMode === "new" || (ownerMode === "existing" && ownerId)) && (
            <div className="space-y-3 bg-slate-50 rounded-md p-3 border border-slate-200">
              <div>
                <label className="label">Profile picture</label>
                <AvatarUploader
                  value={profile.avatar_url}
                  name={profile.name}
                  onChange={(url) => setProfile({ ...profile, avatar_url: url })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Full name *</label>
                  <input className="input" value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Email ID *</label>
                  <input className="input" type="email" value={profile.email}
                    disabled={ownerMode === "existing"}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                </div>
              </div>

              {ownerMode === "new" && (
                <div>
                  <label className="label">Initial password *</label>
                  <input className="input" type="text" value={profile.password}
                    placeholder="Resident will use this to sign in"
                    onChange={(e) => setProfile({ ...profile, password: e.target.value })} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Contact number</label>
                  <input className="input" value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div>
                  <label className="label">Move-in date</label>
                  <input className="input" type="date" value={profile.move_in_date}
                    onChange={(e) => setProfile({ ...profile, move_in_date: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="label">Occupation</label>
                <input className="input" value={profile.occupation}
                  placeholder="e.g. Software Engineer at TechCorp"
                  onChange={(e) => setProfile({ ...profile, occupation: e.target.value })} />
              </div>

              <div>
                <label className="label">Emergency contact</label>
                <input className="input" value={profile.emergency_contact}
                  placeholder="Name — Relation — Phone"
                  onChange={(e) => setProfile({ ...profile, emergency_contact: e.target.value })} />
              </div>

              <div>
                <label className="label">Vehicle info</label>
                <input className="input" value={profile.vehicle_info}
                  placeholder="Reg no, model, colour"
                  onChange={(e) => setProfile({ ...profile, vehicle_info: e.target.value })} />
              </div>

              <div>
                <label className="label">Bio / about</label>
                <textarea className="input min-h-[60px]" value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label !mb-0">Family members</label>
                  <button type="button" onClick={addFam}
                    className="text-xs font-medium text-brand-700 hover:underline">+ Add member</button>
                </div>
                {profile.family.length === 0 && (
                  <div className="text-xs text-slate-400 italic">No family members added.</div>
                )}
                <div className="space-y-2">
                  {profile.family.map((m, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start">
                      <input className="input col-span-5" placeholder="Name" value={m.name || ""}
                        onChange={(e) => setFam(i, "name", e.target.value)} />
                      <input className="input col-span-4" placeholder="Relation" value={m.relation || ""}
                        onChange={(e) => setFam(i, "relation", e.target.value)} />
                      <input className="input col-span-2" type="number" placeholder="Age" value={m.age ?? ""}
                        onChange={(e) => setFam(i, "age", e.target.value)} />
                      <button type="button" onClick={() => removeFam(i)}
                        className="col-span-1 text-red-500 hover:bg-red-50 rounded h-9 flex items-center justify-center"
                        title="Remove">×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>

      <Modal open={confirmingDelete} onClose={() => setConfirmingDelete(false)}
        title="Delete this flat?"
        footer={<>
          <button className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
          <button className="btn-danger" onClick={handleDelete} disabled={busy}>
            {busy ? "Deleting…" : "Yes, delete permanently"}
          </button>
        </>}>
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800">
            <div className="font-semibold mb-1">⚠ This action cannot be undone</div>
            You're about to delete{" "}
            <span className="font-bold">
              flat {existing?.block ? `${existing.block}-` : ""}{existing?.flat_number}
            </span>
            {existing?.owner_name ? <> (currently assigned to <span className="font-semibold">{existing.owner_name}</span>)</> : ""}.
          </div>
          <div className="text-slate-600">
            All bills and payment history for this flat will be deleted as well. The owner's user account is <span className="font-medium">not</span> removed.
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

function FlatDetail({ flatId, onClose, onChanged }) {
  const { can, user } = useAuth();
  const [data, setData] = useState(null);
  const [editOwnerOpen, setEditOwnerOpen] = useState(false);

  function reload() {
    if (!flatId) return;
    api.get(`/flats/${flatId}`).then((r) => setData(r.data));
  }

  useEffect(() => {
    if (!flatId) { setData(null); return; }
    reload();
  }, [flatId]);

  if (!flatId) return null;

  const flat = data?.flat;
  const showFinancials = !!data?.totals;
  const canEditOwner = can("users", "edit") || flat?.owner_id === user?.id;

  return (
    <Modal open={!!flatId} onClose={onClose} title="Flat details"
      footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      {!data ? (
        <div className="text-slate-400 text-sm py-8 text-center">Loading…</div>
      ) : (
        <div className="space-y-5 max-h-[75vh] overflow-y-auto -mx-1 px-1">
          <OwnerProfile
            flat={flat}
            onEdit={canEditOwner ? () => setEditOwnerOpen(true) : null}
          />
          {showFinancials ? (
            <>
              <FlatInfo flat={flat} totals={data.totals} />
              <PaymentHistory bills={data.bills} />
            </>
          ) : (
            <FlatInfoPublic flat={flat} />
          )}
        </div>
      )}

      <OwnerEditModal
        open={editOwnerOpen}
        onClose={() => setEditOwnerOpen(false)}
        ownerId={flat?.owner_id}
        onSaved={() => { reload(); onChanged?.(); }}
      />
    </Modal>
  );
}

function FlatInfoPublic({ flat }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Flat details</div>
      <div className="grid grid-cols-3 gap-3">
        <Cell label="Block" value={flat.block || "—"} />
        <Cell label="Flat no." value={flat.flat_number} />
        <Cell label="Floor" value={flat.floor || "—"} />
        <Cell label="Area" value={flat.area_sqft ? `${flat.area_sqft} sqft` : "—"} />
      </div>
      <p className="text-[11px] text-muted mt-2">
        Financial details (rate, dues, payment history) are visible only to the resident of this flat and the committee.
      </p>
    </div>
  );
}

function OwnerProfile({ flat, onEdit }) {
  if (!flat.owner_id) {
    return (
      <div className="card p-4 bg-slate-50">
        <div className="text-sm text-slate-500 italic">No owner assigned — this flat is vacant.</div>
      </div>
    );
  }
  const family = parseFamily(flat.owner_family_members);

  return (
    <div className="card p-4">
      <div className="flex items-start gap-4">
        <img src={flat.owner_avatar} alt={flat.owner_name}
          className="w-20 h-20 rounded-full border-2 border-brand-100 shadow-sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-lg font-bold">{flat.owner_name}</div>
              {flat.owner_occupation && (
                <div className="text-sm text-slate-600">{flat.owner_occupation}</div>
              )}
            </div>
            {onEdit && (
              <button onClick={onEdit} className="btn-secondary text-xs whitespace-nowrap">✏️ Edit profile</button>
            )}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            <span className="inline-flex items-center gap-1">✉ {flat.owner_email}</span>
            {flat.owner_phone && <span className="inline-flex items-center gap-1 ml-3">📞 {flat.owner_phone}</span>}
          </div>
          {flat.owner_move_in_date && (
            <div className="text-xs text-slate-400 mt-1">Resident since {flat.owner_move_in_date}</div>
          )}
        </div>
      </div>

      {flat.owner_bio && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">{flat.owner_bio}</div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {flat.owner_emergency_contact && (
          <ProfileField icon="🚨" label="Emergency contact" value={flat.owner_emergency_contact} />
        )}
        {flat.owner_vehicle_info && (
          <ProfileField icon="🚗" label="Vehicle" value={flat.owner_vehicle_info} />
        )}
      </div>

      {family.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Family members · {family.length}
          </div>
          <div className="space-y-1">
            {family.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5">
                <span>
                  <span className="font-medium">{m.name}</span>
                  {m.relation && <span className="text-slate-500 ml-2">· {m.relation}</span>}
                </span>
                {m.age && <span className="text-xs text-slate-500">age {m.age}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileField({ icon, label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{icon} {value}</div>
    </div>
  );
}

function FlatInfo({ flat, totals }) {
  const ob = totals.opening_balance || 0;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Flat details</div>
      <div className="grid grid-cols-3 gap-3">
        <Cell label="Block" value={flat.block || "—"} />
        <Cell label="Flat no." value={flat.flat_number} />
        <Cell label="Floor" value={flat.floor || "—"} />
        <Cell label="Area" value={flat.area_sqft ? `${flat.area_sqft} sqft` : "—"} />
        <Cell label="Monthly rate" value={fmt(flat.monthly_rate)} />
        <Cell label="Outstanding" value={fmt(totals.due)} tone={totals.due > 0 ? "red" : "green"} />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <Cell label="Total billed" value={fmt(totals.billed)} />
        <Cell label="Total paid" value={fmt(totals.paid)} tone="green" />
        <Cell
          label={ob >= 0 ? "Opening balance" : "Advance paid"}
          value={ob === 0 ? fmt(0) : `${ob > 0 ? "+" : ""}${fmt(ob)}`}
          tone={ob > 0 ? "red" : ob < 0 ? "green" : undefined}
        />
      </div>
      {ob !== 0 && (
        <p className="text-[11px] text-muted mt-2">
          {ob > 0
            ? `Carried-forward dues of ${fmt(ob)} from before the system started. Included in the total outstanding above.`
            : `Resident has a credit of ${fmt(Math.abs(ob))} (advance maintenance). Offsets future bills.`}
        </p>
      )}
    </div>
  );
}

function Cell({ label, value, tone }) {
  const tones = { red: "text-red-600", green: "text-emerald-600" };
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase text-slate-400 tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${tones[tone] || "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function PaymentHistory({ bills }) {
  if (!bills?.length) {
    return (
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment history</div>
        <div className="text-sm text-slate-400 italic">No bills generated for this flat yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Monthly maintenance history</div>
      <div className="space-y-2">
        {bills.map((b) => {
          const due = Math.max(0, b.amount + b.penalty - b.paid_amount);
          return (
            <div key={b.id} className="border border-slate-200 rounded-md">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                <div>
                  <div className="font-semibold text-sm">{b.period}</div>
                  <div className="text-xs text-slate-500">Due {b.due_date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm">
                    <span className="text-slate-500">Billed </span>{fmt(b.amount + b.penalty)}
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-slate-500">Paid </span>{fmt(b.paid_amount)}
                  </div>
                  <div className="flex items-center gap-2 justify-end mt-0.5">
                    {due > 0 && <span className="text-xs text-red-600">{fmt(due)} due</span>}
                    <StatusBadge value={b.status} />
                  </div>
                </div>
              </div>
              {b.payments?.length > 0 && (
                <div className="px-3 py-2 text-xs space-y-1">
                  {b.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-slate-600">
                      <span>
                        <span className="text-emerald-600">✓</span>{" "}
                        {p.paid_at?.slice(0, 10)} · {p.method}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="font-medium">{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OwnerEditModal({ open, onClose, ownerId, onSaved }) {
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !ownerId) return;
    api.get(`/users/${ownerId}`).then((r) => {
      const u = r.data.user;
      setForm({
        name: u.name || "",
        phone: u.phone || "",
        bio: u.bio || "",
        move_in_date: u.move_in_date || "",
        occupation: u.occupation || "",
        emergency_contact: u.emergency_contact || "",
        vehicle_info: u.vehicle_info || "",
        family: parseFamily(u.family_members),
        avatar_url: u.avatar_url || "",
      });
      setErr("");
    });
  }, [open, ownerId]);

  if (!open) return null;
  if (!form) {
    return (
      <Modal open onClose={onClose} title="Edit owner profile"
        footer={<button className="btn-secondary" onClick={onClose}>Cancel</button>}>
        <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
      </Modal>
    );
  }

  function setFamilyAt(i, field, value) {
    const next = [...form.family];
    next[i] = { ...next[i], [field]: value };
    setForm({ ...form, family: next });
  }
  function addFamily() {
    setForm({ ...form, family: [...form.family, { name: "", relation: "", age: "" }] });
  }
  function removeFamily(i) {
    setForm({ ...form, family: form.family.filter((_, idx) => idx !== i) });
  }

  async function submit() {
    setErr("");
    setBusy(true);
    const family = form.family
      .filter((m) => m.name?.trim())
      .map((m) => ({ ...m, age: m.age === "" ? undefined : Number(m.age) }));
    try {
      await api.patch(`/users/${ownerId}`, {
        name: form.name,
        phone: form.phone,
        bio: form.bio,
        move_in_date: form.move_in_date || null,
        occupation: form.occupation,
        emergency_contact: form.emergency_contact,
        vehicle_info: form.vehicle_info,
        avatar_url: form.avatar_url || null,
        family_members: family,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit owner profile"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </>}>
      <div className="space-y-3 max-h-[65vh] overflow-y-auto px-1 -mx-1">
        <div>
          <label className="label">Profile picture</label>
          <AvatarUploader
            value={form.avatar_url}
            name={form.name}
            onChange={(url) => setForm({ ...form, avatar_url: url })}
          />
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Occupation</label>
          <input className="input" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })}
            placeholder="e.g. Software Engineer at TechCorp" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Contact number</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Move-in date</label>
            <input className="input" type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Emergency contact</label>
          <input className="input" value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
            placeholder="Name — Relation — Phone" />
        </div>
        <div>
          <label className="label">Vehicle info</label>
          <input className="input" value={form.vehicle_info} onChange={(e) => setForm({ ...form, vehicle_info: e.target.value })}
            placeholder="Reg no, model, colour" />
        </div>
        <div>
          <label className="label">Bio / About</label>
          <textarea className="input min-h-[70px]" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label !mb-0">Family members</label>
            <button type="button" onClick={addFamily}
              className="text-xs font-medium text-brand-700 hover:underline">+ Add member</button>
          </div>
          {form.family.length === 0 && (
            <div className="text-xs text-slate-400 italic">No family members added.</div>
          )}
          <div className="space-y-2">
            {form.family.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <input className="input col-span-5" placeholder="Name" value={m.name || ""}
                  onChange={(e) => setFamilyAt(i, "name", e.target.value)} />
                <input className="input col-span-4" placeholder="Relation" value={m.relation || ""}
                  onChange={(e) => setFamilyAt(i, "relation", e.target.value)} />
                <input className="input col-span-2" type="number" placeholder="Age" value={m.age ?? ""}
                  onChange={(e) => setFamilyAt(i, "age", e.target.value)} />
                <button type="button" onClick={() => removeFamily(i)}
                  className="col-span-1 text-red-500 hover:bg-red-50 rounded h-9 flex items-center justify-center"
                  title="Remove">×</button>
              </div>
            ))}
          </div>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
