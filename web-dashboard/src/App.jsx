import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Home from "./pages/Home";
import About from "./pages/About";
import SystemOverview from "./pages/SystemOverview";
import SupportFaqs from "./pages/SupportFaqs";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyEmail from "./pages/VerifyEmail";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Hospitals from "./pages/admin/Hospitals";
import Wards from "./pages/admin/Wards";
import Incubators from "./pages/admin/Incubators";
import Users from "./pages/admin/Users";
import Doctors from "./pages/admin/Doctors";
import Nurses from "./pages/admin/Nurses";
import HospitalAdmins from "./pages/admin/HospitalAdmins";
import ExecutiveOverviewPage from "./pages/admin/ExecutiveOverviewPage";
import Announcements from "./pages/admin/Announcements";
import AdminLogin from "./pages/admin/AdminLogin";
import PatientDashboard from "./pages/PatientDashboard";
import MagicAccess from "./pages/MagicAccess";

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

function StaffRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === "patient") return <Navigate to="/patient/dashboard" replace />;
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === "patient") return <Navigate to="/patient/dashboard" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/system-overview" element={<SystemOverview />} />
      <Route path="/support-faqs" element={<SupportFaqs />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/patient/access" element={<MagicAccess />} />
      <Route path="/patient/dashboard" element={<PrivateRoute><PatientDashboard /></PrivateRoute>} />

      <Route path="/dashboard" element={<StaffRoute><Dashboard /></StaffRoute>} />
      <Route path="/history" element={<Navigate to="/patients" replace />} />

      <Route path="/patients" element={<StaffRoute><Patients /></StaffRoute>} />
      <Route path="/patients/:id" element={<StaffRoute><PatientDetail /></StaffRoute>} />

      <Route path="/admin/overview" element={
        <RequireRole roles={["system_admin", "hospital_admin"]}><ExecutiveOverviewPage /></RequireRole>
      } />
      <Route path="/admin/announcements" element={
        <RequireRole roles={["system_admin", "hospital_admin"]}><Announcements /></RequireRole>
      } />

      <Route path="/admin/hospitals" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/wards" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/incubators" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/doctors" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/nurses" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/hospital-admins" element={<Navigate to="/admin/overview" replace />} />
      <Route path="/admin/users" element={
        <RequireRole roles={["system_admin", "hospital_admin"]}><Users /></RequireRole>
      } />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

