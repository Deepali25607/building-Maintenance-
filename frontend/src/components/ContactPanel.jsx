import { useEffect, useState } from "react";
import api from "../api/client.js";
import { whatsappLink } from "./ChatbotWidget.jsx";

// Self-contained contact block: shows the platform team's sales/support details
// (fetched from the public endpoint) plus an enquiry form. Reused by the in-app
// Contact page and the trial-suspended screen, so it must work pre-auth too.
export default function ContactPanel({
  source = "contact",
  defaultOrg = "",
  defaultName = "",
  defaultEmail = "",
}) {
  const [contact, setContact] = useState(null);
  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    phone: "",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/platform/contact").then((r) => setContact(r.data.contact)).catch(() => {});
  }, []);

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setErr("Please fill in your name, email, and a message.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/platform/contact-message", {
        ...form,
        org_code: defaultOrg || undefined,
        source,
      });
      setSent(true);
    } catch (e) {
      setErr(e.response?.data?.error || "Could not send your message. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Reach-us details */}
      <div className="space-y-3">
        {contact?.contact_message && (
          <p className="text-sm text-fg/80">{contact.contact_message}</p>
        )}
        <div className="card p-4 space-y-3">
          {contact?.company_name && (
            <div className="font-display text-lg font-semibold text-brand-700">{contact.company_name}</div>
          )}
          <ContactRow icon="💼" label="Sales" email={contact?.sales_email} phone={contact?.sales_phone} />
          <ContactRow icon="🛟" label="Support" email={contact?.support_email} phone={contact?.support_phone} />
          {(() => {
            const wa = whatsappLink(
              contact?.whatsapp_number,
              `Hi${defaultName ? `, I'm ${defaultName}` : ""}${defaultOrg ? ` (${defaultOrg})` : ""}. I'd like some help with the apartment platform.`
            );
            return wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2 transition">
                💚 Chat on WhatsApp
              </a>
            ) : null;
          })()}
        </div>
      </div>

      {/* Enquiry form */}
      <div className="card p-4">
        {sent ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">✅</div>
            <div className="font-semibold">Message sent</div>
            <p className="text-sm text-muted mt-1">
              Thanks for reaching out — our team will get back to you shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="text-sm font-semibold">Send us a message</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Name <span className="text-red-500">*</span></label>
                <input className="input" value={form.name} maxLength={120}
                  onChange={(e) => update({ name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} maxLength={20}
                  onChange={(e) => update({ phone: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Email <span className="text-red-500">*</span></label>
              <input className="input" type="email" value={form.email} maxLength={120}
                onChange={(e) => update({ email: e.target.value })} required />
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input" value={form.subject} maxLength={150}
                placeholder="e.g. Upgrade my plan"
                onChange={(e) => update({ subject: e.target.value })} />
            </div>
            <div>
              <label className="label">Message <span className="text-red-500">*</span></label>
              <textarea className="input min-h-[96px]" value={form.message} maxLength={2000}
                onChange={(e) => update({ message: e.target.value })} required />
            </div>
            {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
            <button disabled={busy} className="btn-primary w-full justify-center">
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ContactRow({ icon, label, email, phone }) {
  if (!email && !phone) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-lg leading-none">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
        {email && <a href={`mailto:${email}`} className="text-brand-700 hover:underline block">{email}</a>}
        {phone && <a href={`tel:${phone}`} className="text-fg/80 hover:underline block">{phone}</a>}
      </div>
    </div>
  );
}
