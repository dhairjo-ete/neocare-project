import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import ProfilePill from "./ProfilePill";
import { isElectron } from "../utils/isElectron";

export default function PublicHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  function handleLogout() {
    logout();
    navigate(isElectron ? "/login" : "/");
  }

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMobileMenuOpen(false);
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  const isHome     = location.pathname === "/";
  const isAbout    = location.pathname === "/about";
  const isOverview = location.pathname === "/system-overview";
  const isFaqs     = location.pathname === "/support-faqs";
  const isLogin    = location.pathname === "/login";
  const isSignup   = location.pathname === "/signup";

  const navLinks = isElectron
    ? [
        { to: "/login", label: "Sign In", active: isLogin },
        { to: "/signup", label: "Register Hospital", active: isSignup },
        { to: "/about", label: "About NeoCare", active: isAbout },
        { to: "/support-faqs", label: "Support & FAQs", active: isFaqs },
      ]
    : [
        { to: "/", label: "Home", active: isHome },
        { to: "/about", label: "About", active: isAbout },
        { to: "/system-overview", label: "System Overview", active: isOverview },
        { to: "/support-faqs", label: "Support & FAQs", active: isFaqs },
      ];

  const brandTarget = isElectron ? "/login" : "/";

  return (
    <header className="public-header" ref={menuRef}>
      {/* Left: Brand */}
      <div className="header-left">
        <Link to={brandTarget} className="brand-logo-container" style={{ textDecoration: "none" }}>
          <div className="brand-emblem">
            <span className="pulse-dot"></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4.5l2.5-6 4.5 13 3.5-9H21"/>
            </svg>
          </div>
          <div className="brand-text-group">
            <span className="brand-mark">NeoCare</span>
            <span className="brand-sub">{isElectron ? "Clinical Workstation" : "Neonatal Telemetry"}</span>
          </div>
        </Link>
      </div>

      {/* Center: Navigation Links — hidden on mobile */}
      <nav className="header-center pub-nav-desktop">
        {navLinks.map(({ to, label, active }) => (
          <Link key={to} to={to} className={`btn-ghost ${active ? "active" : ""}`}>
            {label}
          </Link>
        ))}
      </nav>

      {/* Right: Theme + Auth + Hamburger */}
      <div className="header-right">
        {/* On public website, show quick Download Desktop App button */}
        {!isElectron && (
          <Link to="/#download-section" className="btn-header-download" title="Download NeoCare Desktop App (.exe for Windows)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.401H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/>
            </svg>
            <span>Get App</span>
          </Link>
        )}

        <ThemeToggle />

        {/* Auth — desktop */}
        <div className="pub-auth-desktop">
          {user ? (
            <div className="user-profile-header-group">
              <ProfilePill
                user={user}
                onClick={() => navigate("/dashboard")}
                title="Go to Live Clinical Portal"
              />
              <button type="button" className="btn-logout-icon" onClick={handleLogout} title="Log out">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </div>
          ) : (
            <div className="public-auth-buttons">
              <Link to="/login" className="btn-ghost">Log in</Link>
              <Link to="/signup" className="btn-outline">Register</Link>
            </div>
          )}
        </div>

        {/* Hamburger button — only on mobile */}
        <button
          type="button"
          className={`pub-hamburger-btn ${mobileMenuOpen ? "open" : ""}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className="pub-hamburger-line"></span>
          <span className="pub-hamburger-line"></span>
          <span className="pub-hamburger-line"></span>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="pub-mobile-menu">
          <nav className="pub-mobile-nav">
            {navLinks.map(({ to, label, active }) => (
              <Link
                key={to}
                to={to}
                className={`pub-mobile-nav-link ${active ? "active" : ""}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Auth section in mobile menu */}
          <div className="pub-mobile-auth">
            {user ? (
              <div className="pub-mobile-auth-group">
                <ProfilePill
                  user={user}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/dashboard");
                  }}
                  title="Go to Live Clinical Portal"
                />
                <button type="button" className="pub-mobile-logout-btn" onClick={handleLogout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Log out
                </button>
              </div>
            ) : (
              <div className="pub-mobile-auth-group">
                <Link to="/login" className="btn-ghost" onClick={() => setMobileMenuOpen(false)}>
                  Log in
                </Link>
                <Link to="/signup" className="btn-outline" onClick={() => setMobileMenuOpen(false)}>
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
