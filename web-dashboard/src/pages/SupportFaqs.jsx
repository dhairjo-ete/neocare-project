import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import axiosClient from "../api/axiosClient";

const FAQS = [
  {
    category: "Clinical & Alarm Thresholds",
    questions: [
      {
        q: "What are the clinical threshold ranges for neonatal vitals?",
        a: "NeoCare monitors three critical parameters: Heart Rate (nominal: 100–180 bpm), SpO2 Oxygen Concentration (nominal: 94%–100%), and Incubator Microclimate Temperature (nominal: 36.0°C–37.8°C). Any sustained reading outside these bounds triggers immediate emergency alerts."
      },
      {
        q: "How does the emergency audio alarm work?",
        a: "NeoCare generates repeating dual-tone audio alarms during Bradycardia, Tachycardia, and Hypoxia events. The alarm repeats continuously until an attending nurse or doctor acknowledges the alert."
      },
      {
        q: "How do attending caregivers silence or acknowledge alerts?",
        a: "Attending staff click 'Acknowledge' on the active alert in the Live Dashboard. Acknowledging an alert silences the chime and logs the caregiver's name and timestamp."
      }
    ]
  },
  {
    category: "Account & Portal Access",
    questions: [
      {
        q: "Why does my account say 'Awaiting Approval'?",
        a: "NeoCare uses dual-stage verification for clinical safety. After verifying your email, your account must be approved by your Hospital Administrator (for doctors and nurses) or by a System Administrator before access is enabled."
      },
      {
        q: "Are the different hospital roles isolated?",
        a: "Yes. System Administrators access platform governance, Hospital Admins manage hospital wards and incubators, Doctors and Nurses access bedside telemetry, and Guardians use their SMS magic access code."
      }
    ]
  },
  {
    category: "Hospital Data Security",
    questions: [
      {
        q: "Can clinical staff view patients from another hospital?",
        a: "No. All accounts and feeds are cryptographically bound to their registered hospital tenant. Staff can only access incubators and patients assigned to their hospital and ward."
      },
      {
        q: "How do incubators connect to NeoCare?",
        a: "Incubators connect securely via unique device IDs over encrypted MQTT topics, streaming vitals directly to the hospital's cloud dashboard with sub-second latency."
      }
    ]
  }
];

export default function SupportFaqs() {
  const [stats, setStats] = useState({ hospitals: 0, doctors: 0, nurses: 0 });
  const [openIdx, setOpenIdx] = useState(null);

  useEffect(() => {
    axiosClient.get("/stats")
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, []);

  function toggleFaq(idx) {
    setOpenIdx(openIdx === idx ? null : idx);
  }

  let globalCounter = 0;

  return (
    <div className="home-page-container">
      <PublicHeader />

      {/* Hero Banner */}
      <div className="hero-wrapper" style={{ paddingBottom: 40 }}>
        <section className="section" style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div className="section-tag">Help &amp; Knowledge Base</div>
          <h1 className="hero-title" style={{ fontSize: 38, marginBottom: 16 }}>
            Support &amp; Frequently <br />
            <span className="text-gradient">Asked Questions</span>
          </h1>
          <p className="hero-body" style={{ maxWidth: 640 }}>
            Quick answers regarding clinical thresholds, alarm workflows, portal access, and institutional security.
          </p>

          {/* Live System Stats */}
          <div className="metrics-ribbon" style={{ background: "var(--panel)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px 24px", marginTop: 28 }}>
            <div className="metric-item">
              <span className="metric-value">{stats.hospitals}</span>
              <span className="metric-label">Hospitals Connected</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">{stats.doctors + stats.nurses}</span>
              <span className="metric-label">Active Caregivers</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">24 / 7</span>
              <span className="metric-label">System Availability</span>
            </div>
            <div className="metric-item">
              <span className="metric-value">&lt; 200ms</span>
              <span className="metric-label">Alarm Dispatch Speed</span>
            </div>
          </div>
        </section>
      </div>

      {/* FAQ Sections */}
      <section className="section">
        {FAQS.map((cat, catIdx) => (
          <div key={catIdx} style={{ marginBottom: 40 }}>
            <div className="section-tag">{cat.category}</div>
            <h2 className="section-heading" style={{ fontSize: 22, marginBottom: 18 }}>{cat.category}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cat.questions.map((item) => {
                const currentIdx = globalCounter++;
                const isOpen = openIdx === currentIdx;

                return (
                  <div
                    key={currentIdx}
                    style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      overflow: "hidden",
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(currentIdx)}
                      style={{
                        width: "100%",
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                        fontSize: 15,
                        gap: 12,
                      }}
                    >
                      <span>{item.q}</span>
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s ease",
                          flexShrink: 0,
                          color: "var(--brand)",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          padding: "0 20px 18px",
                          color: "var(--text-secondary)",
                          fontSize: 14,
                          lineHeight: 1.6,
                          borderTop: "1px solid var(--border-subtle)",
                          paddingTop: 14,
                        }}
                      >
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
