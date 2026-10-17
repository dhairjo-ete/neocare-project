import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import axiosClient from "../api/axiosClient";

export default function SystemOverview() {
  const [stats, setStats] = useState({ hospitals: 0, doctors: 0, nurses: 0 });

  useEffect(() => {
    axiosClient.get("/stats")
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="home-page-container">
      <PublicHeader />

      {/* Hero Banner */}
      <div className="hero-wrapper" style={{ paddingBottom: 40 }}>
        <section className="section" style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div className="section-tag">System Overview</div>
          <h1 className="hero-title" style={{ fontSize: 40, marginBottom: 16 }}>
            Platform Architecture &amp; <br />
            <span className="text-gradient">Role-Based Medical Control</span>
          </h1>
          <p className="hero-body" style={{ maxWidth: 680 }}>
            Comprehensive overview of NeoCare's multi-tenant clinical portals, vital telemetry thresholds, and emergency alarm subsystem.
          </p>

          {/* Real-time System Statistics */}
          <div className="metrics-ribbon" style={{ background: "var(--panel)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px 24px", marginTop: 28 }}>
            <div className="metric-item">
              <span className="metric-value">{stats.hospitals}</span>
              <span className="metric-label">Hospitals Scoped</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">{stats.doctors}</span>
              <span className="metric-label">Verified Doctors</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">{stats.nurses}</span>
              <span className="metric-label">Verified Nurses</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">Active</span>
              <span className="metric-label">MQTT Telemetry Network</span>
            </div>
          </div>
        </section>
      </div>

      {/* Role-Based Medical Portals */}
      <section className="section">
        <div className="section-tag">Dedicated Workspaces</div>
        <h2 className="section-heading">Role-Based Medical Portals</h2>
        <p className="section-lead">
          Designed for strict institutional security. Each role enters through their
          dedicated portal with granular clinical access control.
        </p>

        <div className="portals-grid">
          <div className="portal-card staff">
            <div className="portal-card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h3>Doctors &amp; Nurses Portal</h3>
            <p>
              Direct bedside telemetry access. Monitor real-time ECG and vitals,
              acknowledge auditory and visual alarms, and record clinical shift notes.
            </p>
            <Link to="/login" className="portal-card-link">
              Sign In as Clinical Staff &#8594;
            </Link>
          </div>

          <div className="portal-card hospital">
            <div className="portal-card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <h3>Hospital Admin Console</h3>
            <p>
              Hospital resource command. Provision neonatal wards, register and configure
              incubators, verify staff credentials, and manage bed assignments.
            </p>
            <Link to="/login" className="portal-card-link">
              Hospital Admin Console &#8594;
            </Link>
          </div>

          <div className="portal-card admin">
            <div className="portal-card-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/>
              </svg>
            </div>
            <h3>System Admin Platform</h3>
            <p>
              Main platform governance. Review and approve incoming hospital tenant
              registrations, audit system health, and oversee telemetry network infrastructure.
            </p>
            <Link to="/login" className="portal-card-link">
              Platform Administration &#8594;
            </Link>
          </div>
        </div>
      </section>

      {/* Built for Critical Care */}
      <section className="section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-tag">Clinical Safety</div>
        <h2 className="section-heading">Built for Critical Care</h2>
        <p className="section-lead">
          Comprehensive features engineered to eliminate monitoring blind spots in neonatal ICUs.
        </p>

        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3>Live Telemetry Stream</h3>
            <p>
              High-frequency vitals update without page refreshes. Interactive SVG trend charts
              reflect instant biological changes.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <h3>Audible Emergency Chimes</h3>
            <p>
              Browser-unlocked Web Audio API dual-tone alerts sound during Bradycardia,
              Tachycardia, or Hypoxia emergencies until manually silenced.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3>Digital Twin Incubator</h3>
            <p>
              Real-time schematic representation of the neonatal patient within the incubator,
              mapping sensory inputs to visual status indicators.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <h3>Historical Analytics</h3>
            <p>
              Every sensory packet is securely stored in time-series database records for
              clinical retrospective review and trend diagnosis.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3>Multi-Tenant Verification</h3>
            <p>
              Institutional hospital boundaries ensure staff only view patients inside their
              assigned hospital and designated neonatal ward.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <line x1="12" y1="18" x2="12.01" y2="18"/>
              </svg>
            </div>
            <h3>Cross-Device Support</h3>
            <p>
              Fully responsive web workstation interface paired with a mobile caregiver app
              for nurses on duty rounds.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="brand" style={{ marginBottom: 8 }}>
              <span className="brand-mark">NeoCare</span>
              <span className="brand-sub"> IoT Enabled Neonatal Incubator Monitoring System</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              <Link
                to="/admin/login"
                style={{
                  color: "var(--text-tertiary)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Platform Administration
              </Link>
            </div>
          </div>

          <div className="footer-meta">
            <span className="footer-badge">
              <span className="status-dot"></span> System Operational
            </span>
            <span className="footer-copy">© {new Date().getFullYear()} NeoCare. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
