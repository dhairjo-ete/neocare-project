import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import axiosClient from "../api/axiosClient";

const TRACE_PATH =
  "M0,35 L40,35 L48,35 L54,12 L62,58 L70,35 L76,35 L84,22 L92,48 L100,35 L160,35 L168,35 L174,12 L182,58 L190,35 L196,35 L204,22 L212,48 L220,35 L280,35 L288,35 L294,12 L302,58 L310,35 L316,35 L324,22 L332,48 L340,35 L400,35";

export const DIRECT_DOWNLOAD_URL =
  import.meta.env.VITE_DESKTOP_DOWNLOAD_URL ||
  "https://github.com/dhairjo-ete/neocare-project/releases/latest/download/NeoCare.Setup.1.0.0.exe";

export default function Home() {
  const [stats, setStats] = useState({ hospitals: 0, doctors: 0, nurses: 0 });
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  useEffect(() => {
    axiosClient.get("/stats")
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  function handleDownloadClick() {
    setDownloadStarted(true);
    setShowDownloadModal(true);
    // Directly trigger browser download without navigating away
    const link = document.createElement("a");
    link.href = DIRECT_DOWNLOAD_URL;
    link.download = "NeoCare.Setup.1.0.0.exe";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

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
              Continuous biometric telemetry from incubator sensors directly to NICU caregivers. Real-time heart rate, blood oxygenation, and microclimate surveillance with automated emergency alarms.
            </p>

            <div className="hero-actions">
              <Link to="/login" className="btn-cta">
                <span>Access Live Monitor</span>
                <span>&#8594;</span>
              </Link>
              <button
                type="button"
                className="btn-cta-download"
                onClick={handleDownloadClick}
                title="Download NeoCare Desktop Installer for Windows (.exe)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.401H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/>
                </svg>
                <span>Download Desktop App</span>
              </button>
              <Link to="/signup" className="btn-cta-outline">
                Register Hospital
              </Link>
            </div>

            <div className="hero-trust-bar">
              <span className="hero-trust-item">✓ Multi-Tenant Security</span>
              <span className="hero-trust-item">✓ Sub-Second Alarm Engine</span>
              <span className="hero-trust-item">✓ Live Cloud Telemetry</span>
            </div>
          </div>

          {/* Right Column: Clinical Telemetry Monitor Display */}
          <div className="hero-right">
            <div className="telemetry-card">
              <div className="telemetry-card-header">
                <div className="telemetry-header-title">
                  <span className="status-dot"></span>
                  <span className="telemetry-title-text" style={{ fontSize: 13, letterSpacing: "0.06em" }}>
                    NEOCARE INCUBATOR MONITOR
                  </span>
                </div>
              </div>

              {/* Threshold Values: HR (180 bpm max), SpO2 (94% min), Temp (37.8°C max) */}
              <div className="telemetry-vitals-grid">
                <div className="telemetry-tile hr">
                  <div className="telemetry-tile-label">
                    <span>HEART RATE</span>
                    <span>♥</span>
                  </div>
                  <div className="telemetry-tile-val">
                    180
                    <span className="telemetry-tile-unit">bpm</span>
                  </div>
                </div>

                <div className="telemetry-tile spo2">
                  <div className="telemetry-tile-label">
                    <span>SpO2 CONC.</span>
                    <span>O₂</span>
                  </div>
                  <div className="telemetry-tile-val">
                    94
                    <span className="telemetry-tile-unit">%</span>
                  </div>
                </div>

                <div className="telemetry-tile temp">
                  <div className="telemetry-tile-label">
                    <span>TEMP</span>
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

      {/* ---------- Desktop Software Download Showcase Section ---------- */}
      <section className="section" id="download-section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="desktop-showcase-card">
          <div style={{ maxWidth: 640 }}>
            <div className="section-tag" style={{ background: "rgba(34, 197, 94, 0.12)", color: "var(--ok, #22c55e)" }}>
              Dedicated Desktop Workstation
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, margin: "10px 0 12px", color: "var(--text-primary)" }}>
              NeoCare Software for Windows
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
              Tailored for dedicated NICU bedside monitors and nursing desks. Operates natively with louder hardware audio chimes, single-instance kiosk full-screen mode, and zero browser tab dropouts.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
              <button
                type="button"
                className="btn-cta-download"
                onClick={handleDownloadClick}
                style={{ fontSize: 14, padding: "12px 24px" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.401H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/>
                </svg>
                <span>Download for Windows (.exe)</span>
              </button>
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>
                v1.0.0 · Windows 10 &amp; 11 (64-bit) · Standalone Installer
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Platform Navigation Highlights ---------- */}
      <section className="section">
        <div className="section-tag">Explore Platform</div>
        <h2 className="section-heading">Learn More About NeoCare</h2>
        <p className="section-lead">
          Continuous neonatal surveillance engineered for critical clinical reliability.
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
              Our mission to eliminate monitoring blind spots in understaffed neonatal units through low-cost IoT innovation.
            </p>
            <Link to="/about" className="portal-card-link">
              Read Mission &#8594;
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
              Explore role-based portals for Caregivers, Hospital In-Charges, and System Administrators with sub-second alert response.
            </p>
            <Link to="/system-overview" className="portal-card-link">
              View Portals &#8594;
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
            <h3>Support &amp; FAQs</h3>
            <p>
              Direct guidance on vital thresholds, alarm workflows, and account verification protocols.
            </p>
            <Link to="/support-faqs" className="portal-card-link">
              Browse Help &#8594;
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

      {/* ---------- Download Modal ---------- */}
      {showDownloadModal && (
        <div className="modal-overlay" onClick={() => setShowDownloadModal(false)}>
          <div className="admission-success-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="admission-modal-header">
              <div className="admission-modal-header-main">
                <div className="admission-modal-icon-badge" style={{ background: "rgba(34, 197, 94, 0.12)", color: "var(--ok, #22c55e)", border: "1.5px solid rgba(34, 197, 94, 0.35)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.401H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.901-1.799"/>
                  </svg>
                </div>
                <div>
                  <h3 className="admission-modal-title">NeoCare Desktop Workstation</h3>
                  <span className="admission-modal-subtitle">Windows 10 / 11 (64-bit) Official Installer</span>
                </div>
              </div>
              <button
                type="button"
                className="admission-modal-close-btn"
                onClick={() => setShowDownloadModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="admission-modal-body">
              <div className="admission-detail-card">
                <div className="admission-detail-row">
                  <span className="admission-detail-label">Application</span>
                  <span className="admission-detail-value">NeoCare NICU Workstation</span>
                </div>
                <div className="admission-detail-row">
                  <span className="admission-detail-label">File Name</span>
                  <span className="admission-detail-value">NeoCare Setup 1.0.0.exe</span>
                </div>
                <div className="admission-detail-row">
                  <span className="admission-detail-label">Compatibility</span>
                  <span className="admission-detail-value">Windows 10 / Windows 11</span>
                </div>
                <div className="admission-detail-row">
                  <span className="admission-detail-label">Version &amp; Channel</span>
                  <span className="admission-detail-value">v1.0.0 · Production</span>
                </div>
              </div>

              <div style={{ background: "var(--panel-raised)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  Quick Installation Guide:
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  <li>Open the downloaded <strong>NeoCare.Setup.1.0.0.exe</strong> file.</li>
                  <li>Follow the on-screen setup prompts (takes ~10 seconds).</li>
                  <li>Launch from your Desktop shortcut and sign in.</li>
                </ol>
              </div>

              {downloadStarted && (
                <div className="admission-sms-status-pill" style={{ width: "100%", justifyContent: "center", boxSizing: "border-box", padding: "8px 12px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Download started! Check your browser's download manager.</span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", fontSize: 14, cursor: "pointer" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{downloadStarted ? "Download Again (.exe)" : "Download Installer (.exe)"}</span>
                </button>
              </div>
            </div>

            <div className="admission-modal-footer" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-small-outline"
                onClick={() => setShowDownloadModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
