import React, { useState, useEffect } from "react";
import axiosClient from "../api/axiosClient";

export default function DigitalTwin({
  vital,
  incubator,
  canControl = false,
  onControlSuccess,
}) {
  // Destructure with safe defaults — works even when vital is null/undefined
  const {
    device_id = "incubator_01",
    heart_rate = 140,
    spo2 = 97.0,
    temperature = 37.0,
    heater_power = 50,
    oxygen_flow = 2.0,
    fan_speed = 1200,
    phototherapy = false,
    condition = "Normal",
    anomaly_injected = false,
  } = vital || {};

  // ALL hooks must run unconditionally — never place hooks after an early return
  const [targetTemp, setTargetTemp] = useState(
    incubator?.controlSettings?.targetTemperature ?? 37.0
  );
  const [targetO2, setTargetO2] = useState(
    incubator?.controlSettings?.oxygenFlow ?? (oxygen_flow || 2.0)
  );
  const [photoLight, setPhotoLight] = useState(
    incubator?.controlSettings?.phototherapy ?? phototherapy
  );
  const [submitting, setSubmitting] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Sync if incubator document updates from server
  useEffect(() => {
    if (incubator?.controlSettings) {
      if (incubator.controlSettings.targetTemperature != null) {
        setTargetTemp(incubator.controlSettings.targetTemperature);
      }
      if (incubator.controlSettings.oxygenFlow != null) {
        setTargetO2(incubator.controlSettings.oxygenFlow);
      }
      if (incubator.controlSettings.phototherapy != null) {
        setPhotoLight(incubator.controlSettings.phototherapy);
      }
    }
  }, [incubator?.controlSettings]);

  // Guard AFTER all hooks — safe early-return once hooks have run
  if (!vital) return null;

  const safeCondition = String(condition || "Normal");
  const isCritical =
    safeCondition.includes("Severe") ||
    spo2 < 90 ||
    heart_rate < 80 ||
    heart_rate > 200 ||
    temperature < 35.5 ||
    temperature > 38.5;
  const isWarning =
    !isCritical &&
    (anomaly_injected ||
      safeCondition !== "Normal" ||
      spo2 < 94 ||
      heart_rate < 100 ||
      heart_rate > 180);

  const statusColor = isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "#10b981";
  const isPhototherapyActive = Boolean(phototherapy || photoLight);

  const handleDispatchControls = async (e) => {
    if (e) e.preventDefault();
    if (!incubator?._id && !device_id) return;

    setSubmitting(true);
    setDispatchMsg("");
    setErrorMsg("");

    const targetId = incubator?._id || device_id;
    try {
      const res = await axiosClient.post(`/incubators/${targetId}/control`, {
        targetTemperature: Number(targetTemp),
        oxygenFlow: Number(targetO2),
        phototherapy: Boolean(photoLight),
      });

      setDispatchMsg("Dispatched to station via MQTT!");
      setTimeout(() => setDispatchMsg(""), 3500);

      if (onControlSuccess) {
        onControlSuccess(res.data?.controlSettings);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || "Failed to dispatch actuator settings.");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="digital-twin-card">
      <div className="digital-twin-header">
        <div className="twin-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Digital Twin Hardware Telemetry — {device_id}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isPhototherapyActive && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 9999,
                background: "rgba(56, 189, 248, 0.15)",
                color: "#0284c7",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0284c7" }} />
              Phototherapy 450nm
            </span>
          )}
          <div className="twin-badge" style={{ backgroundColor: `${statusColor}20`, color: statusColor, borderColor: statusColor }}>
            <span className="twin-status-dot" style={{ backgroundColor: statusColor }}></span>
            {condition}
          </div>
        </div>
      </div>

      <div className="digital-twin-body">
        {/* SVG Graphic of Incubator Chamber */}
        <div className="incubator-graphic">
          <svg viewBox="0 0 400 220" className="incubator-svg">
            {/* Outer Chamber Frame */}
            <rect x="20" y="20" width="360" height="150" rx="16" fill="rgba(30, 41, 59, 0.6)" stroke={statusColor} strokeWidth="3" />

            {/* Transparent Acrylic Hood */}
            <path d="M 40 130 L 40 60 Q 40 35 70 35 L 330 35 Q 360 35 360 60 L 360 130 Z" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="2" />

            {/* Overhead Phototherapy Active Emission (Blue 450nm Beam) */}
            {isPhototherapyActive && (
              <g>
                <polygon points="120,35 65,115 335,115 280,35" fill="rgba(56, 189, 248, 0.16)" />
                <rect x="130" y="27" width="140" height="7" rx="3" fill="#38bdf8" opacity="0.9" filter="drop-shadow(0 0 6px #38bdf8)" />
              </g>
            )}

            {/* Porthole Access Doors */}
            <circle cx="110" cy="85" r="22" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
            <circle cx="290" cy="85" r="22" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />

            {/* Neonatal Mattress Bed */}
            <rect x="70" y="110" width="260" height="18" rx="6" fill="#3b82f6" opacity="0.8" />

            {/* Patient Pulse Indicator Light */}
            <circle cx="200" cy="95" r="8" fill={statusColor} className="pulse-glow">
              <animate attributeName="opacity" values="0.4;1;0.4" dur={`${60 / Math.max(heart_rate, 40)}s`} repeatCount="indefinite" />
            </circle>

            {/* Internal Air Circulation Arrows */}
            <path d="M 80 50 Q 200 40 320 50" fill="none" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="2" strokeDasharray="6 4">
              <animate attributeName="stroke-dashoffset" values="20;0" dur="2s" repeatCount="indefinite" />
            </path>

            {/* Radiant Heater Element Line */}
            <line x1="100" y1="30" x2="300" y2="30" stroke={heater_power > 60 ? "#f97316" : "#64748b"} strokeWidth="4" strokeLinecap="round" />

            {/* Base Stand & Control Module */}
            <rect x="50" y="170" width="300" height="30" rx="4" fill="#1e293b" stroke="#334155" strokeWidth="2" />
            <circle cx="80" cy="185" r="5" fill="#10b981" />
            <circle cx="100" cy="185" r="5" fill={heater_power > 0 ? "#f59e0b" : "#475569"} />
            <text x="120" y="189" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">NEOCARE CONTROL UNIT · HIL ONLINE</text>
          </svg>
        </div>

        {/* Telemetry Control Indicators */}
        <div className="twin-controls-grid">
          <div className="twin-metric-box">
            <div className="metric-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                </svg>
                Radiant Heater
              </span>
              <strong>{heater_power}%</strong>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${heater_power}%`, backgroundColor: heater_power > 70 ? "#ef4444" : "#f59e0b" }}></div>
            </div>
          </div>

          <div className="twin-metric-box">
            <div className="metric-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
                </svg>
                O₂ Flow Rate
              </span>
              <strong>{oxygen_flow} L/min</strong>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, (oxygen_flow / 8) * 100)}%`, backgroundColor: "#3b82f6" }}></div>
            </div>
          </div>

          <div className="twin-metric-box">
            <div className="metric-header">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Fan Circulation
              </span>
              <strong>{fan_speed} RPM</strong>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, (fan_speed / 2000) * 100)}%`, backgroundColor: "#06b6d4" }}></div>
            </div>
          </div>
        </div>

        {/* ── Hardware-in-the-Loop (HIL) Clinician Actuator Panel ── */}
        {canControl && (
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok, #22c55e)", display: "inline-block" }} />
                Bidirectional Clinical Actuation (HIL Control)
              </div>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Direct MQTT link to Station #{device_id}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
              {/* Target Temperature Control */}
              <div style={{ background: "var(--bg-main)", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Target Skin Temp (°C)
                  </label>
                  <strong style={{ fontSize: 14, fontFamily: "IBM Plex Mono", color: "var(--temp, #f59e0b)" }}>
                    {Number(targetTemp).toFixed(1)}°C
                  </strong>
                </div>
                <input
                  type="range"
                  min="34.0"
                  max="38.5"
                  step="0.1"
                  value={targetTemp}
                  onChange={(e) => setTargetTemp(parseFloat(e.target.value))}
                  style={{ width: "100%", cursor: "pointer" }}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {[36.5, 37.0, 37.5].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn-small-outline"
                      onClick={() => setTargetTemp(preset)}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        flex: 1,
                        background: targetTemp === preset ? "var(--brand)" : "transparent",
                        color: targetTemp === preset ? "#fff" : "inherit",
                      }}
                    >
                      {preset.toFixed(1)}°C
                    </button>
                  ))}
                </div>
              </div>

              {/* Oxygen Flow Rate Control */}
              <div style={{ background: "var(--bg-main)", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                    Supplemental O₂ Flow
                  </label>
                  <strong style={{ fontSize: 14, fontFamily: "IBM Plex Mono", color: "var(--spo2, #06b6d4)" }}>
                    {Number(targetO2).toFixed(1)} L/min
                  </strong>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="8.0"
                  step="0.5"
                  value={targetO2}
                  onChange={(e) => setTargetO2(parseFloat(e.target.value))}
                  style={{ width: "100%", cursor: "pointer" }}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {[
                    { val: 2.0, lbl: "2.0 (Low)" },
                    { val: 4.0, lbl: "4.0 (Med)" },
                    { val: 6.0, lbl: "6.0 (High)" },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      className="btn-small-outline"
                      onClick={() => setTargetO2(preset.val)}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        flex: 1,
                        background: targetO2 === preset.val ? "var(--spo2, #06b6d4)" : "transparent",
                        color: targetO2 === preset.val ? "#fff" : "inherit",
                      }}
                    >
                      {preset.lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phototherapy Control */}
              <div style={{ background: "var(--bg-main)", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Phototherapy Blue LED
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    450nm wavelength for hyperbilirubinemia / jaundice therapy.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-small-outline"
                  onClick={() => setPhotoLight(!photoLight)}
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 12px",
                    background: photoLight ? "rgba(56, 189, 248, 0.2)" : "transparent",
                    color: photoLight ? "#0284c7" : "inherit",
                    borderColor: photoLight ? "#0284c7" : "var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: photoLight ? "#0284c7" : "#64748b",
                    }}
                  />
                  {photoLight ? "Phototherapy Active (ON)" : "Phototherapy Standby (OFF)"}
                </button>
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                {dispatchMsg && (
                  <span style={{ fontSize: 12, color: "var(--ok, #22c55e)", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {dispatchMsg}
                  </span>
                )}
                {errorMsg && (
                  <span style={{ fontSize: 12, color: "var(--red, #ef4444)", fontWeight: 600 }}>
                    {errorMsg}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={handleDispatchControls}
                disabled={submitting}
                style={{ fontSize: 12.5, padding: "7px 18px", display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                {submitting ? "Transmitting..." : "Apply to Incubator"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
