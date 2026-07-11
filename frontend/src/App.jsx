import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Platform from "./pages/Platform.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Bills from "./pages/Bills.jsx";
import Incidents from "./pages/Incidents.jsx";
import Expenses from "./pages/Expenses.jsx";
import Vendors from "./pages/Vendors.jsx";
import Visitors from "./pages/Visitors.jsx";
import Staff from "./pages/Staff.jsx";
import Flats from "./pages/Flats.jsx";
import Towers from "./pages/Towers.jsx";
import Users from "./pages/Users.jsx";
import Announcements from "./pages/Announcements.jsx";
import Reports from "./pages/Reports.jsx";
import Accounting from "./pages/Accounting.jsx";
import ThemePage from "./pages/Theme.jsx";
import Profile from "./pages/Profile.jsx";
import Contact from "./pages/Contact.jsx";
import AccountSuspended from "./pages/AccountSuspended.jsx";

function Shell() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

// The platform operator has no community dashboard — send them to Platform admin.
function Home() {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <Navigate to="/platform" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/account/suspended" element={<AccountSuspended />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/bills"        element={<ProtectedRoute need={["bills","view"]}><Bills /></ProtectedRoute>} />
          <Route path="/incidents"    element={<ProtectedRoute need={["incidents","view"]}><Incidents /></ProtectedRoute>} />
          <Route path="/expenses"     element={<ProtectedRoute feature="expenses" need={["expenses","view"]}><Expenses /></ProtectedRoute>} />
          <Route path="/vendors"      element={<ProtectedRoute feature="vendors" need={["vendors","view"]}><Vendors /></ProtectedRoute>} />
          <Route path="/visitors"     element={<ProtectedRoute feature="visitors" need={["visitors","view"]}><Visitors /></ProtectedRoute>} />
          <Route path="/staff"        element={<ProtectedRoute feature="staff" need={["staff","view"]}><Staff /></ProtectedRoute>} />
          <Route path="/flats"        element={<ProtectedRoute need={["flats","view"]}><Flats /></ProtectedRoute>} />
          <Route path="/towers"       element={<ProtectedRoute feature="towers" need={["towers","view"]}><Towers /></ProtectedRoute>} />
          <Route path="/users"        element={<ProtectedRoute need={["users","view"]}><Users /></ProtectedRoute>} />
          <Route path="/announcements" element={<ProtectedRoute need={["announcements","view"]}><Announcements /></ProtectedRoute>} />
          <Route path="/reports"      element={<ProtectedRoute feature="reports" need={["reports","view"]}><Reports /></ProtectedRoute>} />
          <Route path="/accounting"   element={<ProtectedRoute feature="accounting" need={["reports","view"]}><Accounting /></ProtectedRoute>} />
          <Route path="/theme"        element={<ProtectedRoute need={["theme","view"]}><ThemePage /></ProtectedRoute>} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/contact"      element={<ProtectedRoute need={["contact","view"]}><Contact /></ProtectedRoute>} />
          <Route path="/platform"     element={<ProtectedRoute roles={["super_admin"]}><Platform /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </ThemeProvider>
    </AuthProvider>
  );
}
