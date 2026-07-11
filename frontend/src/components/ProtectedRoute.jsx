import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import FeatureLocked from "./FeatureLocked.jsx";

/**
 * Three ways to gate a route:
 *   <ProtectedRoute need={["expenses","view"]}> ...  — permission-based (preferred)
 *   <ProtectedRoute roles={["super_admin"]}>    ...  — strict role-based (use sparingly)
 *   <ProtectedRoute feature="accounting">       ...  — subscription feature gate
 *
 * If multiple are provided, the user must satisfy all. A missing feature renders
 * an upgrade prompt in place (the route stays reachable to drive upsell); failing
 * permission/role redirects home.
 */
export default function ProtectedRoute({ children, roles, need, feature }) {
  const { user, can, hasFeature } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (need && !can(need[0], need[1])) return <Navigate to="/" replace />;
  if (feature && !hasFeature(feature)) return <FeatureLocked feature={feature} />;
  return children;
}
