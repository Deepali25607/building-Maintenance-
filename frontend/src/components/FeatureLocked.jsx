import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Friendly upsell panel shown when an organization's plan does not include a
// feature. Rendered in place of a gated page (see ProtectedRoute) so the route
// stays reachable and drives an upgrade rather than silently hiding.
const LABELS = {
  towers: "Towers / Blocks",
  visitors: "Visitor Management",
  staff: "Staff Attendance (Face ID)",
  vendors: "Vendor Management",
  expenses: "Expense Tracking",
  accounting: "Accounting & Finance",
  reports: "Reports & Analytics",
  sla: "SLA & Escalation",
  notifications: "Notification Engine",
  chatbot: "Support Chatbot",
  bulk_import: "Bulk Resident Import",
  white_label: "White-label Branding",
  custom_domain: "Custom Domain",
};

export default function FeatureLocked({ feature, label }) {
  const { user } = useAuth();
  const name = label || LABELS[feature] || "This feature";
  const planName = user?.apartment?.plan_name || "current";

  return (
    <div className="max-w-xl mx-auto mt-10 bg-surface border border-line rounded-xl p-8 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="font-display text-2xl font-semibold text-brand-700 mb-2">
        {name} isn’t included in your plan
      </h2>
      <p className="text-fg/70 mb-6">
        Your organization is on the <span className="font-medium">{planName}</span> plan,
        which doesn’t include {name}. Upgrade your plan to unlock it.
      </p>
      <Link to="/contact" className="btn-primary inline-flex">
        ✨ Contact us to upgrade
      </Link>
    </div>
  );
}
