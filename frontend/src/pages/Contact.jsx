import ContactPanel from "../components/ContactPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";

// In-app help/contact page for tenants. Lets any signed-in member reach the
// platform's sales/support team. Prefills name/email/org from the session.
export default function Contact() {
  const { user } = useAuth();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Help &amp; Contact</h1>
        <p className="text-muted text-sm">
          Questions about your subscription, billing, or need a hand? Reach our team here.
        </p>
      </div>
      <ContactPanel
        source="contact"
        defaultOrg={user?.apartment?.org_code || user?.org_code || ""}
        defaultName={user?.name || ""}
        defaultEmail={user?.email || ""}
      />
    </div>
  );
}
