import React from "react";

const RANGES = {
  heart_rate: { low: 100, high: 180, accent: "var(--hr)", unit: "bpm", rangeLabel: "100 – 180 bpm", icon: "BPM" },
  spo2: { low: 94, high: 100, accent: "var(--spo2)", unit: "%", rangeLabel: "94 – 100 %", icon: "O₂" },
  temperature: { low: 36.0, high: 37.8, accent: "var(--temp)", unit: "°C", rangeLabel: "36.0 – 37.8 °C", icon: "°C" },
};

function severity(type, value) {
  const r = RANGES[type];
  if (!r) return "normal";
  if (value < r.low || value > r.high) return "critical";
  return "normal";
}

export default function VitalCard({ label, value, unit, type }) {
  const config = RANGES[type] || { accent: "var(--hr)", rangeLabel: "", icon: "●" };
  const status = severity(type, value);
  const isCritical = status === "critical";
  const accent = isCritical ? "var(--critical)" : config.accent;

  return (
    <div
      className={`tile ${isCritical ? "tile-critical" : ""}`}
      style={{
        "--tile-accent": accent,
        borderLeftColor: accent,
      }}
    >
      <div className="tile-label">
        <span>{label}</span>
        <span className="tile-icon" style={{ color: accent }}>
          {config.icon}
        </span>
      </div>

      <div className="tile-main-reading">
        <span className="tile-value" style={{ color: isCritical ? "var(--critical)" : "var(--text-primary)" }}>
          {value !== undefined && value !== null ? value : "—"}
        </span>
        <span className="tile-unit">{unit}</span>
      </div>

      <div className="tile-footer">
        <span className={`tile-status ${isCritical ? "critical" : "normal"}`}>
          {isCritical ? "Outside clinical range" : "● Normal range"}
        </span>
        <span className="tile-range-hint">Ref: {config.rangeLabel}</span>
      </div>
    </div>
  );
}
