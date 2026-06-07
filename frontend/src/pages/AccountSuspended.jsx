import { Link } from "react-router-dom";
import ContactPanel from "../components/ContactPanel.jsx";

// Shown when an organization's free trial has ended and the backend has blocked
// access. Public route — the user is already logged out at this point.
export default function AccountSuspended() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-page to-brand-100 p-4 flex items-center justify-center">
      <div className="card w-full max-w-3xl p-6 sm:p-8 my-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔒</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent">Free trial ended</div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-brand-700 leading-tight">
            Your account is paused
          </h1>
          <p className="text-muted text-sm mt-2 max-w-xl mx-auto">
            Your organization's free trial has ended, so access is paused for now.
            To reactivate and pick a subscription plan, get in touch with our sales
            team — we'll have you back up and running quickly.
          </p>
        </div>

        <ContactPanel source="trial_block" />

        <div className="text-center mt-6 pt-5 border-t border-line">
          <Link to="/login" className="text-sm text-brand-700 font-medium hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
