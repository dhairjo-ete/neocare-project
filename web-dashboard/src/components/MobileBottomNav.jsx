import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function MobileBottomNav({ onOpenMenu, onOpenProfile }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const canManagePatients = ["hospital_admin", "doctor", "nurse"].includes(user.role);
  const isHospitalAdminOrAbove = ["system_admin", "hospital_admin"].includes(user.role);

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation Bar">
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
      >
        <span className="mobile-tab-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </span>
        <span className="mobile-tab-label">NICU Beds</span>
      </NavLink>

      {canManagePatients && (
        <NavLink
          to="/patients"
          className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
        >
          <span className="mobile-tab-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </span>
          <span className="mobile-tab-label">Patients</span>
        </NavLink>
      )}

      {isHospitalAdminOrAbove && (
        <NavLink
          to="/admin/overview"
          className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
        >
          <span className="mobile-tab-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </span>
          <span className="mobile-tab-label">Overview</span>
        </NavLink>
      )}

      {isHospitalAdminOrAbove && (
        <NavLink
          to="/admin/announcements"
          className={({ isActive }) => `mobile-tab-item ${isActive ? "active" : ""}`}
        >
          <span className="mobile-tab-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <span className="mobile-tab-label">Alerts</span>
        </NavLink>
      )}

      <button
        type="button"
        className="mobile-tab-item mobile-menu-btn"
        onClick={onOpenMenu}
        aria-label="Open clinical navigation menu"
      >
        <span className="mobile-tab-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </span>
        <span className="mobile-tab-label">Menu</span>
      </button>
    </nav>
  );
}
