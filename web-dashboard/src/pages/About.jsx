import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import axiosClient from "../api/axiosClient";

export default function About() {
  const [stats, setStats] = useState({ hospitals: 0, doctors: 0, nurses: 0 });

  useEffect(() => {
    axiosClient.get("/stats")
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="home-page-container">
      <PublicHeader />

      {/* Hero Section */}
      <div className="hero-wrapper" style={{ paddingBottom: 40 }}>
        <section className="section" style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div className="section-tag">About NeoCare</div>
          <h1 className="hero-title" style={{ fontSize: 38, marginBottom: 16 }}>
            Bridging the Critical Care Gap in <br />
            <span className="text-gradient">Neonatal Surveillance</span>
          </h1>
          <p className="hero-body" style={{ maxWidth: 640 }}>
            NeoCare is an accessible biomedical IoT platform engineered to bring continuous, sub-second vital monitoring to neonatal intensive care units across all healthcare tiers.
          </p>

          {/* Live System Stats */}
          <div className="metrics-ribbon" style={{ background: "var(--panel)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px 24px", marginTop: 28 }}>
            <div className="metric-item">
              <span className="metric-value">{stats.hospitals}</span>
              <span className="metric-label">Registered Hospitals</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">{stats.doctors}</span>
              <span className="metric-label">Active Doctors</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">{stats.nurses}</span>
              <span className="metric-label">On-Duty Nurses</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">Active</span>
              <span className="metric-label">Live Telemetry Feeds</span>
            </div>
          </div>
        </section>
      </div>

      {/* The Healthcare Challenge */}
      <section className="section">
        <div className="section-tag">The Healthcare Gap</div>
        <h2 className="section-heading">The Clinical Challenge</h2>
        <p className="section-lead">
          Continuous physiological monitoring during an infant's first days is essential for early intervention.
        </p>

        <div className="feature-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="feature-card" style={{ borderLeft: "4px solid var(--brand)" }}>
            <div className="feature-card-icon" style={{ color: "var(--brand)", display: "flex", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3>Understaffed &amp; Rural NICUs</h3>
            <p>
              In many community and rural hospitals, a single nurse oversees multiple incubators. Without automated telemetry, subtle onset of hypoxia or bradycardia can go unnoticed between manual clinical rounds.
            </p>
          </div>

          <div className="feature-card" style={{ borderLeft: "4px solid var(--brand)" }}>
            <div className="feature-card-icon" style={{ color: "var(--brand)", display: "flex", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h3>Equipment Cost Barriers</h3>
            <p>
              Traditional commercial bedside monitors cost thousands of dollars per unit, placing comprehensive incubator telemetry out of reach for resource-constrained centers.
            </p>
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section className="section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section-tag">Our Approach</div>
        <h2 className="section-heading">Our Core Innovations</h2>
        <p className="section-lead">
          Democratizing biomedical IoT innovation so no infant is left unmonitored.
        </p>

        <div className="feature-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div className="feature-card">
            <div className="feature-card-icon" style={{ display: "flex", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
              </svg>
            </div>
            <h3>Accessible Hardware</h3>
            <p>
              Medical-grade optical sensors and microcontrollers transmitting telemetry over secure, lightweight MQTT brokers.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon" style={{ display: "flex", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h3>Sub-Second Alerting</h3>
            <p>
              Instant evaluation against vital thresholds (HR 100–180 bpm, SpO2 &gt;94%, Temp 36.0–37.8°C) with persistent audible chimes.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card-icon" style={{ display: "flex", alignItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3>Multi-Tenant Isolation</h3>
            <p>
              Role-scoped database boundaries ensuring patient telemetry remains strictly private to authorized hospital teams.
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
