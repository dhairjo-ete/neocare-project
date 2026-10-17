// Single source of truth for vital-sign status on the dashboard.
// These bands mirror backend/src/services/alertEngine.js so a bed never shows
// CRITICAL on screen without a matching alert (or the reverse).
//
//   heart_rate   warning: <100 or >180      critical: <80 or >200
//   spo2         warning: <94               critical: <90
//   temperature  warning: <36.0 or >37.8    critical: <35.5 or >38.5
//
// Missing values (undefined / null / NaN) are ignored: in JavaScript
// `null < 80` is true, which used to paint empty readings as CRITICAL.
// A real 0 (flatline) is a valid number and is classified normally.
export const THRESHOLDS = {
  heart_rate: { low: 100, high: 180, criticalLow: 80, criticalHigh: 200 },
  spo2: { low: 94, criticalLow: 90 },
  temperature: { low: 36.0, high: 37.8, criticalLow: 35.5, criticalHigh: 38.5 },
};

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Returns "unknown" | "normal" | "warning" | "critical"
export function classifyVitals(vital) {
  if (!vital) return "unknown";
  const { heart_rate: hr, spo2, temperature: t } = vital;
  const T = THRESHOLDS;

  const critical =
    (isNum(hr) && (hr < T.heart_rate.criticalLow || hr > T.heart_rate.criticalHigh)) ||
    (isNum(spo2) && spo2 < T.spo2.criticalLow) ||
    (isNum(t) && (t < T.temperature.criticalLow || t > T.temperature.criticalHigh));
  if (critical) return "critical";

  const warning =
    (isNum(hr) && (hr < T.heart_rate.low || hr > T.heart_rate.high)) ||
    (isNum(spo2) && spo2 < T.spo2.low) ||
    (isNum(t) && (t < T.temperature.low || t > T.temperature.high));
  return warning ? "warning" : "normal";
}
