import { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import MarqueeBanner from "./MarqueeBanner";
import ProfilePill from "./ProfilePill";
import UserProfileModal from "./UserProfileModal";
import FirstTimePasswordModal from "./FirstTimePasswordModal";
import MobileBottomNav from "./MobileBottomNav";

const MOBILE_BP = 840;

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // On mobile: collapsed=true -> sidebar hidden. On desktop: collapsed=true &#8594; sidebar narrow (72px).
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= MOBILE_BP);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Auto-respond to window resize
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth <= MOBILE_BP) {
        setCollapsed(true);   // hide sidebar on mobile
      } else {
        setCollapsed(false);  // show full sidebar on desktop
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto-close sidebar when navigating (mobile only)
  useEffect(() => {
    if (window.innerWidth <= MOBILE_BP) {
      setCollapsed(true);
    }
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/");
  }

  const canManagePatients = user && ["hospital_admin", "doctor", "nurse"].includes(user.role);
  const isHospitalAdminOrAbove = user && ["system_admin", "hospital_admin"].includes(user.role);

  // On mobile the sidebar is always full-width, so always show labels regardless of collapsed state
  const isMobileView = window.innerWidth <= MOBILE_BP;
  const showLabel = !collapsed || isMobileView;

  // Get human-friendly page title for header
  const getPageTitle = (pathname) => {
    if (pathname.startsWith("/dashboard")) return "Live NICU Telemetry";
    if (pathname.startsWith("/patients")) return "Patient Registry";
    if (pathname.startsWith("/admin/overview")) return "Executive Overview";
    if (pathname.startsWith("/admin/hospitals")) return "Hospital Administration";
    if (pathname.startsWith("/admin/announcements")) return "Broadcasts & Alerts";
    if (pathname.startsWith("/admin/wards")) return "NICU Units";
    if (pathname.startsWith("/admin/incubators")) return "Incubator Fleet";
    if (pathname.startsWith("/admin/doctors")) return "Doctor Management";
    if (pathname.startsWith("/admin/nurses")) return "Nurse Management";
    if (pathname.startsWith("/admin/hospital-admins")) return "Hospital In-Charges";
    if (pathname.startsWith("/admin/users")) return "Staff Approvals";
    return "Clinical Portal";
  };

  return (
    <div className="portal-root-container">
      <MarqueeBanner />
      <FirstTimePasswordModal />
      <div className={`app-shell sidebar-layout ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile backdrop - closes sidebar when tapped */}
      <div
        className={`sidebar-mobile-backdrop ${!collapsed ? "active" : ""}`}
        onClick={() => setCollapsed(true)}
        aria-hidden="true"
      />
      {/* Left Sidebar View */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <Link to="/" className="sidebar-logo-container" style={{ textDecoration: "none", color: "inherit" }} title="Go to Main Homepage">
            <div className="sidebar-emblem">
              <span className="pulse-dot"></span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12h4l3-5.5 4 11 3-5.5h3"/>
              </svg>
            </div>
            {showLabel && (
              <div className="sidebar-brand-text">
                <span className="brand-mark">NeoCare</span>
                <span className="brand-sub">
                  {user?.role === "system_admin"
                    ? "NEONATAL TELEMETRY"
                    : (user?.hospitalName || "NICU TELEMETRY")}
                </span>
              </div>
            )}
          </Link>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
            title="Live Dashboard"
          >
            <span className="sidebar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </span>
            {showLabel && <span className="sidebar-label">Live Dashboard</span>}
          </NavLink>

          {canManagePatients && (
            <NavLink
              to="/patients"
              className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
              title="Patients"
            >
              <span className="sidebar-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </span>
              {showLabel && <span className="sidebar-label">Patients</span>}
            </NavLink>
          )}

          {isHospitalAdminOrAbove && (
            <>
              <div className="sidebar-divider" />
              {showLabel && <span className="sidebar-section-title">ADMINISTRATION</span>}
              
              <NavLink
                to="/admin/overview"
                className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                title="Executive Overview"
              >
                <span className="sidebar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                </span>
                {showLabel && <span className="sidebar-label">Executive Overview</span>}
              </NavLink>

              <NavLink
                to="/admin/announcements"
                className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                title="Announcements & Emergencies"
              >
                <span className="sidebar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </span>
                {showLabel && <span className="sidebar-label">Broadcasts &amp; Alerts</span>}
              </NavLink>

              <NavLink
                to="/admin/users"
                className={({ isActive }) => `sidebar-nav-link ${isActive ? "active" : ""}`}
                title="Staff Approvals"
              >
                <span className="sidebar-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </span>
                {showLabel && <span className="sidebar-label">Staff Approvals</span>}
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout} title="Log out">
            <span className="sidebar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
            {showLabel && <span className="sidebar-label">Log out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-wrapper">
        <header className="app-top-header">
          <div className="header-left">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={() => setCollapsed(!collapsed)}
              title="Toggle Sidebar"
              aria-label="Toggle Sidebar"
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>

            <span className="header-page-title">{getPageTitle(location.pathname)}</span>
          </div>

          <div className="header-right">
            <span className="status-pill">
              <span className="status-dot" />
              {user?.hospitalName || (user?.role === "system_admin" ? "All hospitals" : "System")} · Live
            </span>

            <NotificationBell />
            <ThemeToggle />

            {user && (
              <ProfilePill user={user} onClick={() => setShowProfileModal(true)} />
            )}
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>

      {/* Mobile App Bottom Navigation Bar */}
      <MobileBottomNav
        onOpenMenu={() => setCollapsed(false)}
        onOpenProfile={() => setShowProfileModal(true)}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </div>
  </div>
  );
}
