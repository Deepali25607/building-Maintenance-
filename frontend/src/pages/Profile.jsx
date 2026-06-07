import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

function parseFamily(str) {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  try {
    const v = JSON.parse(str);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const EMPTY_RELATIVE = { name: "", relation: "", age: "" };

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");

  useEffect(() => {
    if (!user) return;
    api.get(`/users/${user.id}`).then((r) => {
      const u = r.data.user;
      setForm({
        name: u.name || "",
        phone: u.phone || "",
        occupation: u.occupation || "",
        emergency_contact: u.emergency_contact || "",
        vehicle_info: u.vehicle_info || "",
        move_in_date: u.move_in_date || "",
        bio: u.bio || "",
        avatar_url: u.avatar_url || "",
        family: parseFamily(u.family_members),
      });
    });
  }, [user?.id]);

  if (!form || !user) {
    return <div className="text-sm text-muted py-12 text-center">Loading…</div>;
  }

  function update(patch) { setForm({ ...form, ...patch }); }

  function setRelative(i, patch) {
    const next = form.family.slice();
    next[i] = { ...next[i], ...patch };
    update({ family: next });
  }
  function addRelative() { update({ family: [...form.family, { ...EMPTY_RELATIVE }] }); }
  function removeRelative(i) {
    update({ family: form.family.filter((_, idx) => idx !== i) });
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/uploads/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      update({ avatar_url: r.data.url });
    } catch (e2) {
      setErr(e2.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function save() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.patch(`/users/${user.id}`, {
        name: form.name.trim(),
        phone: form.phone || null,
        occupation: form.occupation || null,
        emergency_contact: form.emergency_contact || null,
        vehicle_info: form.vehicle_info || null,
        move_in_date: form.move_in_date || null,
        bio: form.bio || null,
        avatar_url: form.avatar_url || null,
        family_members: JSON.stringify(form.family.filter((m) => (m.name || "").trim())),
      });
      await refreshUser?.();
      setMsg("Profile updated.");
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPwdBusy(true);
    setPwdMsg("");
    setPwdErr("");
    if (pwd.next.length < 8) {
      setPwdErr("New password must be at least 8 characters.");
      setPwdBusy(false);
      return;
    }
    if (pwd.next !== pwd.confirm) {
      setPwdErr("New password and confirmation do not match.");
      setPwdBusy(false);
      return;
    }
    try {
      await api.post("/auth/change-password", {
        current_password: pwd.current,
        new_password: pwd.next,
      });
      setPwd({ current: "", next: "", confirm: "" });
      setPwdMsg("Password updated.");
    } catch (e) {
      setPwdErr(e.response?.data?.error || "Failed to change password");
    } finally {
      setPwdBusy(false);
    }
  }

  const fallback = form.name
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(form.name)}&background=3b6cf6&color=fff&size=256&bold=true`
    : null;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">My profile</h1>
        <p className="text-muted text-sm">
          Update your personal details. Email, role, and financial information (dues, opening balance) are managed by the committee.
        </p>
      </div>

      <div className="card p-5 mb-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-sm bg-slate-100 flex items-center justify-center text-3xl shrink-0">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : fallback ? (
              <img src={fallback} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>👤</span>
            )}
          </div>
          <div>
            <label className="btn-secondary text-xs cursor-pointer">
              {uploading ? "Uploading…" : (form.avatar_url ? "Change photo" : "Upload photo")}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden" onChange={pickAvatar} disabled={uploading} />
            </label>
            {form.avatar_url && (
              <button type="button" onClick={() => update({ avatar_url: "" })}
                className="ml-2 text-xs text-muted hover:text-red-600 hover:underline">
                Remove
              </button>
            )}
            <div className="text-[11px] text-muted mt-1">
              PNG/JPG/GIF/WEBP, up to 5MB. Defaults to generated initials.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" value={form.name}
              onChange={(e) => update({ name: e.target.value })} maxLength={120} />
          </div>
          <div>
            <label className="label">Email <span className="text-muted">(login — cannot be changed)</span></label>
            <input className="input" value={user.email} disabled />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone}
              onChange={(e) => update({ phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Emergency contact</label>
            <input className="input" value={form.emergency_contact}
              placeholder="Name & phone of next of kin"
              onChange={(e) => update({ emergency_contact: e.target.value })} />
          </div>
          <div>
            <label className="label">Occupation</label>
            <input className="input" value={form.occupation}
              onChange={(e) => update({ occupation: e.target.value })} />
          </div>
          <div>
            <label className="label">Move-in date</label>
            <input type="date" className="input" value={form.move_in_date || ""}
              onChange={(e) => update({ move_in_date: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Vehicle info</label>
            <input className="input" value={form.vehicle_info}
              placeholder="e.g. Honda City — MH12 AB 1234"
              onChange={(e) => update({ vehicle_info: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">About you</label>
            <textarea className="input min-h-[80px]" value={form.bio}
              onChange={(e) => update({ bio: e.target.value })}
              placeholder="A short note about yourself, hobbies, etc." />
          </div>
        </div>
      </div>

      <div className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Family</div>
            <h2 className="font-display text-lg font-semibold">Family members</h2>
          </div>
          <button className="btn-secondary text-xs" onClick={addRelative} type="button">
            + Add member
          </button>
        </div>
        {form.family.length === 0 ? (
          <div className="text-sm text-muted py-6 text-center">No family members added yet.</div>
        ) : (
          <div className="space-y-2">
            {form.family.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className="input col-span-5" placeholder="Name" value={m.name || ""}
                  onChange={(e) => setRelative(i, { name: e.target.value })} />
                <input className="input col-span-4" placeholder="Relation (spouse, child, parent…)"
                  value={m.relation || ""}
                  onChange={(e) => setRelative(i, { relation: e.target.value })} />
                <input className="input col-span-2" placeholder="Age" value={m.age || ""}
                  onChange={(e) => setRelative(i, { age: e.target.value })} />
                <button type="button"
                  className="col-span-1 text-red-600 hover:text-red-800 text-lg"
                  title="Remove" onClick={() => removeRelative(i)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 mb-5 bg-surface-2/40">
        <div className="text-xs uppercase tracking-wide text-muted mb-1">Account information</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted text-xs">Role</div>
            <div className="font-medium capitalize">{user.role.replace("_", " ")}</div>
          </div>
          <div>
            <div className="text-muted text-xs">Community</div>
            <div className="font-medium">{user.apartment?.name || "—"}</div>
          </div>
          <div>
            <div className="text-muted text-xs">Organization ID</div>
            <div className="font-medium font-mono">{user.apartment?.org_code || "—"}</div>
          </div>
          <div>
            <div className="text-muted text-xs">User ID</div>
            <div className="font-medium">#{user.id}</div>
          </div>
        </div>
        <p className="text-[11px] text-muted mt-3">
          Role, community assignment, dues, opening balance, and other financial records can only be changed by the committee or super admin.
        </p>
      </div>

      <div className="card p-5 mb-5">
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wide text-muted">Security</div>
          <h2 className="font-display text-lg font-semibold">Change password</h2>
          <p className="text-muted text-sm">
            Enter your current password to set a new one. Must be at least 8 characters.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Current password</label>
            <input type="password" className="input" autoComplete="current-password"
              value={pwd.current}
              onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" autoComplete="new-password"
              value={pwd.next}
              onChange={(e) => setPwd({ ...pwd, next: e.target.value })} />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" className="input" autoComplete="new-password"
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button className="btn-secondary" onClick={changePassword}
            disabled={pwdBusy || !pwd.current || !pwd.next || !pwd.confirm}>
            {pwdBusy ? "Updating…" : "Update password"}
          </button>
          {pwdMsg && <span className="text-xs text-emerald-700">{pwdMsg}</span>}
          {pwdErr && <span className="text-xs text-red-600">{pwdErr}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy || !form.name.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
