import { useEffect, useRef, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

// Always-available assistant for org admins. A lightweight rule-based bot that
// answers common questions from canned replies and can escalate to a real human
// by filing a contact message (source: "chatbot"). Greeting + contact details
// come from the platform settings the operator controls.
export default function ChatbotWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState("chat"); // "chat" | "form" | "sent"
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get("/platform/contact").then((r) => setContact(r.data.contact)).catch(() => {});
  }, []);

  // Prefill the escalation form from the session once known.
  useEffect(() => {
    setForm((f) => ({
      ...f,
      name: f.name || user?.name || "",
      email: f.email || user?.email || "",
    }));
  }, [user]);

  // Seed the greeting the first time the panel opens.
  useEffect(() => {
    if (open && messages.length === 0) {
      const greeting = contact?.chatbot_greeting ||
        "Hi! 👋 I'm your assistant. Ask me about billing, plans, or technical help — or I can connect you with our team.";
      setMessages([{ from: "bot", text: greeting }]);
    }
  }, [open, contact]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, mode]);

  const sales = contact?.sales_email;
  const support = contact?.support_email;
  const waUrl = whatsappLink(
    contact?.whatsapp_number,
    `Hi, I'm ${user?.name || "a customer"}${orgCode(user) ? ` (${orgCode(user)})` : ""}. I'd like some help with the apartment platform.`
  );

  function openWhatsApp() {
    if (!waUrl) return;
    pushUser("Chat on WhatsApp");
    pushBot("Opening WhatsApp so you can chat with our team directly… 💬");
    window.open(waUrl, "_blank", "noopener");
  }

  const REPLIES = {
    billing: `For billing and payment questions, our team can help directly${support ? ` at ${support}` : ""}. You can also raise it here and we'll get back to you.`,
    plans: `You're currently on the ${planLabel(user)} plan. To upgrade or change plans${sales ? `, reach our sales team at ${sales}` : ", contact our sales team"}. Want me to pass along an upgrade request?`,
    technical: `Sorry you're hitting a snag! Describe the issue and I'll forward it to our support team${support ? ` (${support})` : ""} so they can look into it.`,
  };

  function pushUser(text) { setMessages((m) => [...m, { from: "user", text }]); }
  function pushBot(text) { setMessages((m) => [...m, { from: "bot", text }]); }

  function quick(topic, label) {
    pushUser(label);
    setTimeout(() => pushBot(REPLIES[topic]), 150);
  }

  function startEscalation() {
    pushUser("Talk to our team");
    setMode("form");
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setErr("Please add your name, email, and a short message.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/platform/contact-message", {
        name: form.name,
        email: form.email,
        message: form.message,
        org_code: user?.apartment?.org_code || user?.org_code || undefined,
        source: "chatbot",
        subject: "Chatbot enquiry",
      });
      setMode("sent");
      pushBot("Thanks! I've passed this to our team — they'll reach out to you by email shortly. 🙌");
    } catch (e) {
      setErr(e.response?.data?.error || "Couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Need help? Chat with us"
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center text-2xl transition"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[22rem] max-w-[calc(100vw-2.5rem)] bg-surface border border-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-brand-600 text-white">
            <div className="font-semibold text-sm">{contact?.company_name || "Help & Support"}</div>
            <div className="text-[11px] text-white/80">We typically reply by email</div>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 max-h-80 overflow-y-auto px-3 py-3 space-y-2 bg-surface-2/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.from === "user"
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-surface border border-line rounded-bl-sm"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          {/* Composer / quick actions */}
          <div className="border-t border-line p-3 space-y-2">
            {mode === "form" ? (
              <form onSubmit={submit} className="space-y-2">
                <input className="input text-sm" placeholder="Your name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="input text-sm" type="email" placeholder="Your email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <textarea className="input text-sm min-h-[64px]" placeholder="How can we help?"
                  value={form.message} maxLength={2000}
                  onChange={(e) => setForm({ ...form, message: e.target.value })} />
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode("chat")} className="btn-secondary text-xs flex-1 justify-center">Back</button>
                  <button disabled={busy} className="btn-primary text-xs flex-1 justify-center">{busy ? "Sending…" : "Send"}</button>
                </div>
              </form>
            ) : mode === "sent" ? (
              <button onClick={() => { setMode("chat"); }} className="btn-secondary w-full justify-center text-xs">
                Ask something else
              </button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Chip onClick={() => quick("billing", "Billing & payments")}>💳 Billing</Chip>
                <Chip onClick={() => quick("plans", "Plans & upgrade")}>⭐ Plans</Chip>
                <Chip onClick={() => quick("technical", "Technical issue")}>🛠 Technical</Chip>
                {waUrl && <Chip onClick={openWhatsApp} whatsapp>💚 Chat on WhatsApp</Chip>}
                <Chip onClick={startEscalation} primary>👤 Talk to our team</Chip>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function planLabel(user) {
  const p = user?.apartment?.plan_name || user?.apartment?.plan;
  return p || "current";
}

function orgCode(user) {
  return user?.apartment?.org_code || user?.org_code || "";
}

// Build a wa.me deep link from a (possibly formatted) phone number. Returns null
// when there's nothing dialable so callers can hide the option.
export function whatsappLink(number, text) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function Chip({ children, onClick, primary, whatsapp }) {
  const tone = whatsapp
    ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
    : primary
      ? "bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100"
      : "border-line hover:bg-surface-2";
  return (
    <button onClick={onClick}
      className={`text-xs rounded-full px-3 py-1.5 border transition ${tone}`}>
      {children}
    </button>
  );
}
