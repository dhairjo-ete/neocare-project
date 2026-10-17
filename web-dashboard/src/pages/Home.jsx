import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import axiosClient from "../api/axiosClient";

const TRACE_PATH =
  "M0,35 L40,35 L48,35 L54,12 L62,58 L70,35 L76,35 L84,22 L92,48 L100,35 L160,35 L168,35 L174,12 L182,58 L190,35 L196,35 L204,22 L212,48 L220,35 L280,35 L288,35 L294,12 L302,58 L310,35 L316,35 L324,22 L332,48 L340,35 L400,35";

export default function Home() {
  const [stats, setStats] = useState({ hospitals: 0, doctors: 0, nurses: 0 });

  useEffect(() => {
    axiosClient.get("/stats")
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <div className="home-page-container">
      {/* ---------- Public Navigation Header ---------- */}
      <PublicHeader />

      {/* ---------- Hero Section ---------- */}
      <div className="hero-wrapper">
        <section className="hero">
          <div className="hero-left">
            <div className="hero-badge">
              <span className="hero-badge-dot"></span>
              Clinical-Grade Neonatal Telemetry
            </div>

            <h1 className="hero-title">
              Every heartbeat, <br />
              <span className="text-gradient">watched in real time.</span>
            </h1>

            <p className="hero-body">
              NeoCare delivers sub-second biometric telemetry from incubator sensors
              directly to NICU caregivers. Continuous heart rate, blood oxygenation,
              and microclimate surveillance with automated emergency alarm thresholds.
            </p>

            <div className="hero-actions">
              <Link to="/login" className="btn-cta">
                <span>Access Live Monitor</span>
                <span>&#8594;</span>
              </Link>
              <Link to="/signup" className="btn-cta-outline">
                Register Hospital / Staff
              </Link>
            </div>

            <div className="hero-trust-bar">
              <span className="hero-trust-item">✓ Multi-Tenant Isolation</span>
              <span className="hero-trust-item">✓ Live System Database</span>
              <span className="hero-trust-item">✓ Sub-Second Alarm Engine</span>
            </div>
          </div>

          {/* Right Column: Clinical Telemetry Monitor Display */}
          <div className="hero-right">
            <div className="telemetry-card">
              <div className="telemetry-card-header">
                <div className="telemetry-header-title">
                  <span className="status-dot"></span>
                  <span className="telemetry-title-text" style={{ fontSize: 14, letterSpacing: "0.06em" }}>
                    NEOCARE NEONATAL INCUBATOR MONITOR
                  </span>
                </div>
              </div>

              {/* Threshold Values: HR (180 bpm max), SpO2 (94% min), Temp (37.8°C max) */}
              <div className="telemetry-vitals-grid">
                <div className="telemetry-tile hr">
                  <div className="telemetry-tile-label">
                    <span>HEART RATE (MAX)</span>
                    <span>♥</span>
                  </div>
                  <div className="telemetry-tile-val">
                    180
                    <span className="telemetry-tile-unit">bpm</span>
                  </div>
                </div>

                <div className="telemetry-tile spo2">
                  <div className="telemetry-tile-label">
                    <span>SpO2 CONC. (MIN)</span>
                    <span>O₂</span>
                  </div>
                  <div className="telemetry-tile-val">
                    94
                    <span className="telemetry-tile-unit">%</span>
                  </div>
                </div>

                <div className="telemetry-tile temp">
                  <div className="telemetry-tile-label">
                    <span>TEMP (MAX)</span>
                    <span>°C</span>
                  </div>
                  <div className="telemetry-tile-val">
                    37.8
                    <span className="telemetry-tile-unit">°C</span>
                  </div>
                </div>
              </div>

              {/* Real-time ECG Screen */}
              <div className="ecg-screen">
                <div className="ecg-screen-header">
                  <span>LEAD II · ECG 25mm/s</span>
                  <span style={{ color: "var(--hr)" }}>● NOMINAL WAVEFORM</span>
                </div>
                <svg className="trace-svg" viewBox="0 0 400 70" preserveAspectRatio="none">
                  <path className="trace-path-ghost" d={TRACE_PATH} />
                  <path className="trace-path" d={TRACE_PATH} />
                </svg>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Real-Time Live System Network Banner ---------- */}
      <div className="metrics-ribbon-wrapper">
        <div className="metrics-ribbon">
          <div className="metric-item">
            <span className="metric-value">{stats.hospitals}</span>
            <span className="metric-label">Hospitals Enrolled</span>
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
            <span className="metric-value">&lt; 200ms</span>
            <span className="metric-label">Telemetry Ingest Speed</span>
          </div>
        </div>
      </div>

      {/* ---------- Platform Navigation Highlights ---------- */}
      <section className="section">
        <div className="section-tag">Explore Platform</div>
        <h2 className="section-heading">Learn More About NeoCare</h2>
        <p className="section-lead">
          Discover how NeoCare is revolutionizing neonatal monitoring in low-resource and understaffed medical centers.
        </p>

        <div className="portals-grid">
          <div className="portal-card hospital">
            <div className="portal-card-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h3>About NeoCare</h3>
            <p>
              Understand the real-world healthcare gap-how rural and understaffed hospitals lack continuous neonatal surveillance-and our mission for low-cost IoT innovation.
            </p>
            <Link to="/about" className="portal-card-link">
              Read Our Mission &#8594;
            </Link>
          </div>

          <div className="portal-card staff">
            <div className="portal-card-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <h3>System Overview</h3>
            <p>
              Explore our role-based medical portals (Doctors, Nurses, Hospital Admins, System Admins) and critical care safety features engineered for emergency response.
            </p>
            <Link to="/system-overview" className="portal-card-link">
              View System Overview &#8594;
            </Link>
          </div>

          <div className="portal-card admin">
            <div className="portal-card-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3>Support & FAQs</h3>
            <p>
              Get detailed answers about vital threshold ranges, dual-stage account verification, Web Audio chimes, and institutional multi-tenant security.
            </p>
            <Link to="/support-faqs" className="portal-card-link">
              Browse FAQs & Help &#8594;
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
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
              <span className="status-dot"></span>
              Broker: HiveMQ Cloud · Online
            </span>
            <span className="footer-copy">
              © {new Date().getFullYear()} NeoCare. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
