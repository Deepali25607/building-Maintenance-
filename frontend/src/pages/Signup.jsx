import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Signup() {
  const nav = useNavigate();
  const { setAfterSignup } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    orgName: "",
    orgTagline: "",
    orgAddress: "",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
    confirmPassword: "",
  });

  function update(patch) { setForm({ ...form, ...patch }); }

  async function submit(e) {
    e.preventDefault();
    setErr("");

    if (form.adminPassword !== form.confirmPassword) {
      setErr("Passwords do not match");
      return;
    }
    if (form.adminPassword.length < 8) {
      setErr("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const r = await api.post("/apartments/signup", {
        org: {
          name: form.orgName,
          tagline: form.orgTagline || undefined,
          address: form.orgAddress || undefined,
        },
        admin: {
          name: form.adminName,
          email: form.adminEmail,
          phone: form.adminPhone || undefined,
          password: form.adminPassword,
        },
      });
      // Drop the returned token + user straight into auth state.
      setAfterSignup(r.data.token, r.data.user);
      nav("/");
    } catch (e) {
      setErr(e.response?.data?.error || "Signup failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-page to-brand-100 p-4">
      <div className="card w-full max-w-xl p-6 sm:p-8 my-8">
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent">Start your community</div>
        <h1 className="font-display text-3xl font-semibold text-brand-700 leading-tight">Create your organization</h1>
        <p className="text-muted text-sm mb-6">
          Spin up a private workspace for your apartment community. You'll be the first admin.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Organization</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Community / apartment name <span className="text-red-500">*</span></label>
                <input className="input" required maxLength={120}
                  placeholder="e.g. Greenwood Heights"
                  value={form.orgName}
                  onChange={(e) => update({ orgName: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Tagline <span className="text-slate-400">(optional)</span></label>
                  <input className="input" maxLength={120}
                    placeholder="e.g. Premium Residences"
                    value={form.orgTagline}
                    onChange={(e) => update({ orgTagline: e.target.value })} />
                </div>
                <div>
                  <label className="label">Address <span className="text-slate-400">(optional)</span></label>
                  <input className="input" maxLength={200}
                    placeholder="e.g. 12 Park Lane, Pune"
                    value={form.orgAddress}
                    onChange={(e) => update({ orgAddress: e.target.value })} />
                </div>
              </div>
            </div>
          </section>

          <section className="pt-3 border-t border-slate-100">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Your admin account</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Full name <span className="text-red-500">*</span></label>
                  <input className="input" required maxLength={120}
                    value={form.adminName}
                    onChange={(e) => update({ adminName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Phone <span className="text-slate-400">(optional)</span></label>
                  <input className="input" maxLength={20}
                    value={form.adminPhone}
                    onChange={(e) => update({ adminPhone: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Email <span className="text-red-500">*</span></label>
                <input className="input" type="email" required maxLength={120}
                  value={form.adminEmail}
                  onChange={(e) => update({ adminEmail: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Password <span className="text-red-500">*</span></label>
                  <input className="input" type="password" required minLength={8}
                    value={form.adminPassword}
                    onChange={(e) => update({ adminPassword: e.target.value })} />
                  <div className="text-[11px] text-muted mt-1">At least 8 characters.</div>
                </div>
                <div>
                  <label className="label">Confirm password <span className="text-red-500">*</span></label>
                  <input className="input" type="password" required minLength={8}
                    value={form.confirmPassword}
                    onChange={(e) => update({ confirmPassword: e.target.value })} />
                </div>
              </div>
            </div>
          </section>

          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{err}</div>}

          <button disabled={busy} className="btn-primary w-full justify-center">
            {busy ? "Creating organization…" : "Create organization & sign me in"}
          </button>

          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-700 font-medium hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
