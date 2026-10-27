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
          <h1 className="hero-title" style={{ fontSize: 38, marginBottom: 16 }}>
            Platform Architecture &amp; <br />
            <span className="text-gradient">Role-Based Medical Control</span>
          </h1>
          <p className="hero-body" style={{ maxWidth: 640 }}>
            Role-based clinical workflows, real-time vitals monitoring, and emergency alarm architecture engineered for critical neonatal care.
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
        <div className="section-tag">Workspaces</div>
        <h2 className="section-heading">Role-Based Clinical Portals</h2>
        <p className="section-lead">
          Granular access control ensuring each hospital role enters their dedicated environment.
        </p>

        <div className="portals-grid">
          <div className="portal-card staff">
            <div className="portal-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h3>Doctors &amp; Nurses Portal</h3>
            <p>
              Bedside telemetry monitor, real-time vital trends, audible alarm acknowledgement, and clinical shift note recording.
            </p>
            <Link to="/login" className="portal-card-link">
              Clinical Sign In &#8594;
            </Link>
          </div>

          <div className="portal-card hospital">
            <div className="portal-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <h3>Hospital Admin Console</h3>
            <p>
              Hospital resource command: provision neonatal wards, register incubators, verify staff licenses, and manage bed allocations.
            </p>
            <Link to="/login" className="portal-card-link">
              Hospital Console &#8594;
            </Link>
          </div>

          <div className="portal-card admin">
            <div className="portal-card-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              </svg>
            </div>
            <h3>System Admin Platform</h3>
            <p>
              Platform governance: review incoming hospital tenant registrations, audit system health, and oversee telemetry infrastructure.
            </p>
            <Link to="/admin/login" className="portal-card-link">
              Platform Admin &#8594;
            </Link>
          </div>
        </div>
      </section>

      {/* Built for Critical Care */}
      <section className="section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-tag">Clinical Reliability</div>
        <h2 className="section-heading">Built for Critical Care</h2>
        <p className="section-lead">
          Core capabilities engineered to eliminate monitoring blind spots in neonatal ICUs.
        </p>

        <div className="feature-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <h3>Real-Time Telemetry Stream</h3>
            <p>
              Sub-second vital streaming over WebSockets and MQTT with instant biological waveform rendering.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <h3>Audible Emergency Chimes</h3>
            <p>
              Hardware-accelerated and browser-unlocked dual-tone alarms for Bradycardia, Tachycardia, and Hypoxia events.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </div>
            <h3>Digital Twin Incubator</h3>
            <p>
              Interactive spatial representation of the neonatal incubator mapping sensory inputs directly to visual bedside indicators.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3>Multi-Tenant Institutional Security</h3>
            <p>
              Strict hospital and ward boundaries guarantee patient telemetry is isolated and viewable only by authorized medical teams.
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
