import { useState, useEffect } from "react";
import axiosClient from "../api/axiosClient";

const SCENARIOS = [
  { id: "normal", label: "🟢 Normal Physiology (Sleep-Wake Rhythm)" },
  { id: "bradycardia", label: "🔴 Bradycardia Cascade (Apnea & Desat)" },
  { id: "hypoxia", label: "🔵 Hypoxic Desaturation (SpO₂ < 85%)" },
  { id: "tachycardia", label: "🟣 Tachycardia Trajectory (HR > 185 bpm)" },
  { id: "hyperthermia", label: "🟠 Hyperthermia Fever (Temp > 38.5°C)" },
  { id: "hypothermia", label: "❄️ Hypothermia Drift (Temp < 35.5°C)" },
];

export default function SimulationControls({ selectedDevice = null }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ running: true, forcedScenario: null });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    axiosClient.get("/simulator/status")
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, []);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await axiosClient.post("/simulator/toggle");
      setStatus(res.data);
      setMsg(res.data.running ? "Simulator active" : "Simulator paused");
      setTimeout(() => setMsg(""), 2500);
    } catch {
      setMsg("Failed to toggle");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setLoading(false);
    }
  }

  async function handleApplyScenario(scenarioId) {
    setLoading(true);
    try {
      const res = await axiosClient.post("/simulator/scenario", {
        scenario: scenarioId,
        deviceId: selectedDevice || "__all__",
      });
      setStatus((prev) => ({ ...prev, forcedScenario: scenarioId === "normal" ? null : scenarioId }));
      setMsg(`Applied ${scenarioId.toUpperCase()}`);
      setTimeout(() => setMsg(""), 3000);
      setOpen(false);
    } catch {
      setMsg("Failed to apply scenario");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="btn-small-outline"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderColor: status.running ? "var(--ok, #22c55e)" : "var(--text-tertiary)",
            background: status.running ? "rgba(34, 197, 94, 0.08)" : "transparent",
            color: status.running ? "var(--ok, #22c55e)" : "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
          }}
          title="Autonomous Telemetry Engine Status & Clinical Scenarios"
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: status.running ? "var(--ok, #22c55e)" : "var(--text-tertiary)",
              boxShadow: status.running ? "0 0 8px var(--ok, #22c55e)" : "none",
            }}
          />
          <span>{status.running ? "Telemetry: Live Stream" : "Telemetry: Paused"}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {msg && (
          <span style={{ fontSize: 11, color: "var(--brand-light)", fontWeight: 600 }}>
            {msg}
          </span>
        )}
      </div>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="panel"
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              marginTop: 6,
              zIndex: 101,
              width: 290,
              maxWidth: "calc(100vw - 24px)",
              padding: 12,
              borderRadius: "var(--radius, 8px)",
              boxShadow: "var(--shadow-lg, 0 12px 36px rgba(0,0,0,0.4))",
              border: "1px solid var(--border)",
              background: "var(--panel)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                Telemetry Simulation Engine
              </span>
              <button
                type="button"
                onClick={handleToggle}
                disabled={loading}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: status.running ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                  color: status.running ? "var(--critical, #ef4444)" : "var(--ok, #22c55e)",
                  border: "none",
                  fontWeight: 600,
                }}
              >
                {status.running ? "Pause" : "Resume"}
              </button>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 10px", lineHeight: 1.35 }}>
              Streams realistic AR-1 neonatal vitals automatically for occupied beds. Select a clinical scenario to test alerts:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {SCENARIOS.map((sc) => {
                const isActive = (status.forcedScenario || "normal") === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    disabled={loading}
                    onClick={() => handleApplyScenario(sc.id)}
                    style={{
                      textAlign: "left",
                      fontSize: 11.5,
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid",
                      borderColor: isActive ? "var(--brand)" : "transparent",
                      background: isActive ? "var(--brand-bg, rgba(225, 29, 72, 0.12))" : "var(--panel-raised)",
                      color: isActive ? "var(--brand-light)" : "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>{sc.label}</span>
                    {isActive && <span style={{ fontSize: 10, fontWeight: 700 }}>ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
