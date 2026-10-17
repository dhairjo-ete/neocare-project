import { useState, useEffect, useCallback, useMemo } from "react";
import axiosClient from "../api/axiosClient";
import { extractClinicalTeamContacts, formatDoctorName } from "../utils/clinicalCommunication";

function formatDateShort(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimeOnly(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function toIsoDateString(d) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

/**
 * PatientAdvisoriesTimeline
 *
 * Clean, simple, medical-grade patient problem & advisory history.
 * Displays only the chronological problems/advisories recorded after admission date.
 * No action clutter.
 */
export default function PatientAdvisoriesTimeline({ patient }) {
  const admissionDateStr = useMemo(() => {
    return toIsoDateString(patient?.admittedAt || patient?.createdAt);
  }, [patient]);

  const dischargeDateStr = useMemo(() => {
    return patient?.dischargedAt ? toIsoDateString(patient.dischargedAt) : "";
  }, [patient]);

  const todayStr = useMemo(() => {
    return toIsoDateString(new Date());
  }, []);

  // Filter state
  const [filterMode, setFilterMode] = useState("all"); // "all" | "today" | "yesterday" | "custom"
  const [customDate, setCustomDate] = useState(() => admissionDateStr || todayStr);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Compute 'from' and 'to' date boundaries based on filterMode
  const { fromDate, toDate } = useMemo(() => {
    const admissionIso = patient?.admittedAt || patient?.createdAt || new Date(Date.now() - 30 * 86400000).toISOString();
    const dischargeIso = patient?.dischargedAt || null;

    if (filterMode === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      // Ensure we don't start before admission
      const effectiveStart = new Date(admissionIso) > start ? new Date(admissionIso) : start;
      return { fromDate: effectiveStart.toISOString(), toDate: end.toISOString() };
    }

    if (filterMode === "yesterday") {
      const start = new Date(Date.now() - 86400000);
      start.setHours(0, 0, 0, 0);
      const end = new Date(Date.now() - 86400000);
      end.setHours(23, 59, 59, 999);
      const effectiveStart = new Date(admissionIso) > start ? new Date(admissionIso) : start;
      return { fromDate: effectiveStart.toISOString(), toDate: end.toISOString() };
    }

    if (filterMode === "custom" && customDate) {
      const [year, month, day] = customDate.split("-").map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const effectiveStart = new Date(admissionIso) > start ? new Date(admissionIso) : start;
      return { fromDate: effectiveStart.toISOString(), toDate: end.toISOString() };
    }

    // Default "all": entire stay from admission date
    return {
      fromDate: new Date(admissionIso).toISOString(),
      toDate: dischargeIso ? new Date(dischargeIso).toISOString() : new Date().toISOString(),
    };
  }, [filterMode, customDate, patient]);

  // Fetch alerts for this patient in the selected date range
  const fetchAdvisories = useCallback(async () => {
    if (!patient?._id) return;
    setLoading(true);
    try {
      let url = `/alerts?patientId=${patient._id}&limit=300`;
      if (fromDate) url += `&from=${encodeURIComponent(fromDate)}`;
      if (toDate) url += `&to=${encodeURIComponent(toDate)}`;

      const { data } = await axiosClient.get(url);
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[PatientAdvisoriesTimeline] Failed to load advisories:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [patient?._id, fromDate, toDate]);

  useEffect(() => {
    fetchAdvisories();
  }, [fetchAdvisories]);

  // Calculate summary metrics
  const totalCount = alerts.length;
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  if (!patient) return null;

  return (
    <div className="clinical-history-container">
      {/* ── Toolbar: Title, Stay Context & Filter Controls ── */}
      <div className="clinical-history-toolbar">
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            Clinical History &amp; Problems
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            Admission Stay: <strong>{formatDateShort(patient.admittedAt || patient.createdAt)}</strong>
            {patient.dischargedAt && ` to ${formatDateShort(patient.dischargedAt)} (Discharged)`}
          </div>
        </div>

        {/* ── Date Filter Controls ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div className="filter-pill-group">
            <button
              type="button"
              className={`filter-pill-btn ${filterMode === "all" ? "active" : ""}`}
              onClick={() => setFilterMode("all")}
            >
              All Stay
            </button>
            <button
              type="button"
              className={`filter-pill-btn ${filterMode === "today" ? "active" : ""}`}
              onClick={() => setFilterMode("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={`filter-pill-btn ${filterMode === "yesterday" ? "active" : ""}`}
              onClick={() => setFilterMode("yesterday")}
            >
              Yesterday
            </button>
          </div>

          {/* Date Picker (Restricted strictly after admission date) */}
          <input
            type="date"
            className="filter-date-input"
            min={admissionDateStr}
            max={dischargeDateStr || todayStr}
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              setFilterMode("custom");
            }}
            title="Filter by specific date (after admission)"
          />
        </div>
      </div>

      {/* ── Gentle Summary Status Ribbon ── */}
      <div className="clinical-summary-ribbon">
        <div className="ribbon-item">
          <span>Total Problems:</span>
          <strong style={{ color: "var(--text-primary)" }}>{totalCount}</strong>
        </div>
        <span className="ribbon-divider">•</span>
        <div className="ribbon-item">
          <span>Clinical Priorities:</span>
          <strong style={{ color: criticalCount > 0 ? "var(--critical)" : "var(--text-secondary)" }}>{criticalCount}</strong>
        </div>
        <span className="ribbon-divider">•</span>
        <div className="ribbon-item">
          <span>Advisory Notices:</span>
          <strong style={{ color: warningCount > 0 ? "var(--warning)" : "var(--text-secondary)" }}>{warningCount}</strong>
        </div>
      </div>

      {/* ── Timeline Problems Feed / Clinical Ledger ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
          <div className="spinner" style={{ margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13, fontWeight: 500 }}>Loading patient clinical records...</div>
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--input-bg)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: "50%", background: "var(--ok-bg)", color: "var(--ok)", marginBottom: 10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>
            Parameters Baseline &amp; Stable
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto" }}>
            No clinical problems or parameter threshold variances recorded for <strong>{patient.name}</strong> during the selected period.
          </div>
        </div>
      ) : (
        <div className="clinical-ledger-wrapper">
          <table className="clinical-ledger-table">
            <thead>
              <tr className="clinical-ledger-header">
                <th style={{ width: 140 }}>Time</th>
                <th style={{ width: 110 }}>Severity</th>
                <th>Clinical Problem &amp; Variance</th>
                <th style={{ width: 200 }}>Location &amp; Doctor</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const isCritical = a.severity === "critical";
                const contacts = extractClinicalTeamContacts(a);

                return (
                  <tr key={a._id} className="clinical-ledger-row">
                    {/* Time */}
                    <td>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {formatTimeOnly(a.timestamp)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                        {formatDateShort(a.timestamp)}
                      </div>
                    </td>

                    {/* Severity */}
                    <td>
                      <span className={`ledger-pill ${isCritical ? "ledger-pill-critical" : "ledger-pill-warning"}`}>
                        {isCritical ? "Priority" : "Notice"}
                      </span>
                    </td>

                    {/* Clinical Problem & Variance Value */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                          {a.condition || (a.type ? a.type.replace(/_/g, " ").toUpperCase() : "Parameter Variance")}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: isCritical ? "var(--hr)" : "var(--text-secondary)" }}>
                          ({a.value} {a.type === "heart_rate" ? "BPM" : a.type === "spo2" ? "%" : a.type === "temperature" ? "°C" : ""})
                        </span>
                      </div>
                    </td>

                    {/* Location & Doctor */}
                    <td>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        Bed: <strong>{a.incubatorLabel || a.device_id || "Unassigned"}</strong>
                        {contacts.doctorName && (
                          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
                            {formatDoctorName(contacts.doctorName)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
