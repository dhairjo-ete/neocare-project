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
        a: "NeoCare monitors three core vital parameters: Heart Rate (normal range: 100 - 180 bpm), SpO2 Oxygen Concentration (normal range: 94% - 100%), and Incubator Microclimate Temperature (normal range: 36.0°C - 37.8°C). Any sustained reading outside these bounds triggers an automated emergency alarm."
      },
      {
        q: "How does the dual-tone audio alarm work in the browser?",
        a: "NeoCare utilizes the browser's native Web Audio API to sound repeating dual-tone medical chimes during critical alarms. Due to modern browser autoplay policies, click anywhere on the page to unlock audio playback. Audio chimes repeat until manually acknowledged by an attending nurse or doctor."
      },
      {
        q: "How do attending caregivers silence or acknowledge alerts?",
        a: "Attending staff can click the 'Acknowledge' button next to any active alert in the Live Dashboard Alert Panel. Acknowledging an alert silences the repeating audio chime and updates the alert log with the caregiver's identity and timestamp."
      }
    ]
  },
  {
    category: "Account, Verification & Portal Access",
    questions: [
      {
        q: "Why does my account say 'Awaiting Approval' when I try to log in?",
        a: "NeoCare enforces a 2-stage verification workflow. After verifying your email address, your account must be approved by your hospital administrator (for doctors and nurses) or by a system administrator (for hospital accounts) before portal access is granted."
      },
      {
        q: "Can a doctor or nurse log in through the System Admin portal?",
        a: "No. NeoCare enforces strict portal scoping. System Administrators can only log in through the System Admin portal tab, Hospital Admins through the Hospital Admin portal, and Doctors/Nurses through the Staff portal. Cross-portal logins are blocked."
      },
      {
        q: "Does System Admin require email verification or admin approval?",
        a: "System Administrator accounts bypass email verification and admin approval requirements to ensure root platform accessibility is never locked out during emergency infrastructure maintenance."
      }
    ]
  },
  {
    category: "Multi-Tenant Security & Isolation",
    questions: [
      {
        q: "Can medical staff view patient vitals from another hospital?",
        a: "No. Every user account is cryptographically bound to their specific hospital tenant. Doctors and nurses only receive MQTT feeds and patient records associated with their assigned hospital and wards."
      },
      {
        q: "How are incubators and wards provisioned?",
        a: "Hospital Administrators create wards and provision incubators within their hospital console. Each incubator receives a unique device ID (e.g., incubator_01) which publishes vitals over secure MQTT topics."
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
      {/* Public Header */}
      <PublicHeader />

      {/* Hero Banner */}
      <div className="hero-wrapper" style={{ paddingBottom: 40 }}>
        <section className="section" style={{ paddingTop: 48, paddingBottom: 32 }}>
          <div className="section-tag">Help & Knowledge Base</div>
          <h1 className="hero-title" style={{ fontSize: 40, marginBottom: 16 }}>
            Support & Frequently <br />
            <span className="text-gradient">Asked Questions</span>
          </h1>
          <p className="hero-body" style={{ maxWidth: 680 }}>
            Find answers to common questions regarding clinical thresholds, alarm workflows, multi-tenant portal security, and system administration.
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
              <span className="metric-value">Sub-Second</span>
              <span className="metric-label">Alarm Dispatch Speed</span>
            </div>
          </div>
        </section>
      </div>

      {/* FAQ Sections */}
      <section className="section">
        {FAQS.map((cat, catIdx) => (
          <div key={catIdx} style={{ marginBottom: 48 }}>
            <div className="section-tag">{cat.category}</div>
            <h2 className="section-heading" style={{ fontSize: 24, marginBottom: 20 }}>{cat.category}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cat.questions.map((item) => {
                const currentIdx = globalCounter++;
                const isOpen = openIdx === currentIdx;

                return (
                  <div
                    key={currentIdx}
                    style={{
                      background: "var(--panel)",
                      border: `1px solid ${isOpen ? "var(--brand)" : "var(--border)"}`,
                      borderRadius: "var(--radius-lg)",
                      overflow: "hidden",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(currentIdx)}
                      style={{
                        width: "100%",
                        padding: "18px 22px",
                        background: "transparent",
                        border: "none",
                        color: "var(--text-primary)",
                        fontSize: 16,
                        fontWeight: 600,
                        textAlign: "left",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <span>{item.q}</span>
                      <span style={{ color: "var(--brand)", fontSize: 20, transition: "transform 0.2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                        ▼
                      </span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: "0 22px 20px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.65, borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
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

      {/* Contact Support Banner */}
      <section className="section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="feature-card" style={{ background: "var(--panel-raised)", border: "1px solid var(--brand)", padding: 32, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div>
            <h3 style={{ fontSize: 20, marginBottom: 6, color: "var(--text-primary)" }}>Still need clinical or technical assistance?</h3>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>Our technical support team is available for hospital onboarding and hardware integration.</p>
          </div>
          <a href="mailto:admin.neocare@gmail.com" className="btn-cta" style={{ textDecoration: "none" }}>
            Contact Support &#8594;
          </a>
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
              <span className="status-dot"></span> Support Online
            </span>
            <span className="footer-copy">© {new Date().getFullYear()} NeoCare. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
