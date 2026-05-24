import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

const DEMO = [
  { role: "Super Admin", email: "admin@demo.com", pw: "admin123" },
  { role: "Committee", email: "priya@demo.com", pw: "priya123" },
  { role: "Treasurer", email: "rahul@demo.com", pw: "rahul123" },
  { role: "Resident", email: "amit@demo.com", pw: "amit123" },
  { role: "Maintenance", email: "ravi@demo.com", pw: "ravi123" },
];

export default function Login() {
  const { login, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState("");
  const [branding, setBranding] = useState({ name: "Apartment Community", tagline: "Resident Portal" });

  useEffect(() => {
    api.get("/apartments/branding")
      .then((r) => setBranding({ name: r.data.name, tagline: r.data.tagline }))
      .catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      setErr(e.response?.data?.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-page to-brand-100 p-4">
      <div className="card w-full max-w-md p-8">
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent">{branding.tagline}</div>
        <h1 className="font-display text-3xl font-semibold text-brand-700 leading-tight">{branding.name}</h1>
        <p className="text-muted mb-6 text-sm">Apartment Community Portal</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Demo accounts</div>
          <div className="space-y-1">
            {DEMO.map((d) => (
              <button
                key={d.email}
                onClick={() => { setEmail(d.email); setPassword(d.pw); }}
                className="text-left w-full text-xs hover:bg-slate-50 rounded px-2 py-1"
              >
                <span className="font-medium">{d.role}</span>
                <span className="text-slate-500"> — {d.email} / {d.pw}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
