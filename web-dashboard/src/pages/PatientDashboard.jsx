import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";
import LiveChart from "../components/LiveChart";
import ThemeToggle from "../components/ThemeToggle";
import { classifyVitals } from "../utils/vitalsStatus";
import { generateMedicalReportPdf } from "../utils/generateMedicalReportPdf";

function formatDate(d) {
  if (!d) return "N/A";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function formatDateShort(d) {
  if (!d) return "N/A";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [vitalsStats, setVitalsStats] = useState({});
  const [latestVital, setLatestVital] = useState(null);
  const [timeRange, setTimeRange] = useState("24h"); // "1h" | "6h" | "12h" | "24h" | "all"
  const [loading, setLoading] = useState(true);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [error, setError] = useState("");

  const patientId = user?.patientId || user?.id;

  // Load patient data, notes, and stats
  const loadPatientData = useCallback(async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      setError("");

      const [patRes, notesRes, statsRes] = await Promise.all([
        axiosClient.get(`/patients/${patientId}`),
        axiosClient.get(`/patients/${patientId}/notes`).catch(() => ({ data: [] })),
        axiosClient.get(`/vitals/patient/${patientId}/stats`).catch(() => ({ data: {} })),
      ]);

      setPatient(patRes.data);
      setNotes(notesRes.data || []);
      setVitalsStats(statsRes.data || {});
      if (statsRes.data?.latest) {
        setLatestVital(statsRes.data.latest);
      }
    } catch (err) {
      console.error("Failed to load patient records:", err);
      setError(err?.response?.data?.error || "Could not load patient record.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // Load telemetry waveform history based on hours filter
  const loadTelemetryHistory = useCallback(async () => {
    if (!patientId) return;
    try {
      let url = `/vitals/patient/${patientId}?limit=300`;
      const now = Date.now();
      if (timeRange === "1h") {
        url += `&from=${new Date(now - 3600 * 1000).toISOString()}`;
      } else if (timeRange === "6h") {
        url += `&from=${new Date(now - 6 * 3600 * 1000).toISOString()}`;
      } else if (timeRange === "12h") {
        url += `&from=${new Date(now - 12 * 3600 * 1000).toISOString()}`;
      } else if (timeRange === "24h") {
        url += `&from=${new Date(now - 24 * 3600 * 1000).toISOString()}`;
      }
      const res = await axiosClient.get(url);
      setVitalsHistory([...res.data].reverse());
    } catch (err) {
      console.warn("Failed to load telemetry history:", err);
    }
  }, [patientId, timeRange]);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  useEffect(() => {
    loadTelemetryHistory();
  }, [loadTelemetryHistory]);

  // Continuous real-time socket stream for vitals
  const onLiveVitals = useCallback((incomingVital) => {
    if (!incomingVital) return;
    const patBedTopic = patient?.incubatorId?.deviceTopicId;
    const currentPatId = patient?._id || patientId;

    const matchesPatient = incomingVital.patientId && String(incomingVital.patientId) === String(currentPatId);
    const matchesDevice = patBedTopic && incomingVital.device_id === patBedTopic;

    if (matchesPatient || matchesDevice) {
      setLatestVital(incomingVital);
      setVitalsHistory((prev) => {
        // Prevent duplicate logs with identical timestamp
        const exists = prev.some((v) => v._id && v._id === incomingVital._id);
        if (exists) return prev;
        return [...prev.slice(-250), incomingVital];
      });
    }
  }, [patient, patientId]);

  useSocket(onLiveVitals, null, null, null, null);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function handleDownloadPdf() {
    if (!patient) return;
    setPdfGenerating(true);
    try {
      generateMedicalReportPdf({
        patient,
        notes,
        vitalsStats,
        vitalsHistory,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF report. Please try again.");
    } finally {
      setPdfGenerating(false);
    }
  }

  if (loading && !patient) {
    return (
      <div className="login-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="panel" style={{ textAlign: "center", padding: 48, maxWidth: 440 }}>
          <div className="pulse-dot" style={{ margin: "0 auto 16px" }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Loading Baby's Clinical Records...</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>Connecting to NeoCare Live Telemetry Portal</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="login-shell" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="panel" style={{ maxWidth: 460, textAlign: "center", padding: 36 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Patient Record Not Accessible</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
            {error || "Unable to locate your registered patient file. Please verify your Magic Link or contact the NICU staff."}
          </p>
          <button type="button" className="btn-primary" onClick={handleLogout}>
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const isDischarged = Boolean(patient.dischargedAt);
  const incubatorName = patient.incubatorId?.label || patient.incubatorId?.deviceTopicId || "NICU Station";
  const doctor = patient.assignedDoctor;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)", color: "var(--text-primary)" }}>
      {/* ── Top Header (Unified with Other Dashboards, NO PDF button in header) ── */}
      <header className="app-top-header" style={{ position: "sticky", top: 0, zIndex: 40, borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="header-left" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            to="/"
            className="sidebar-logo-container"
            style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: 10 }}
            title="Go to NeoCare Home"
          >
            <div className="sidebar-emblem" style={{ width: 32, height: 32 }}>
              <span className="pulse-dot" />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12h4l3-5.5 4 11 3-5.5h3" />
              </svg>
            </div>
            <div className="sidebar-brand-text">
              <span className="brand-mark" style={{ fontSize: 15 }}>NeoCare</span>
              <span className="brand-sub" style={{ fontSize: 9 }}>PATIENT PORTAL</span>
            </div>
          </Link>

          <span style={{ color: "var(--border-subtle)", margin: "0 4px" }}>|</span>

          <span className="header-page-title" style={{ fontSize: 13.5, fontWeight: 600 }}>
            {patient.name} · Bed: {incubatorName}
          </span>
        </div>

        <div className="header-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="status-pill">
            <span className="status-dot" />
            {patient.hospitalId?.name || "Hospital NICU"} · Live Telemetry
          </span>

          <ThemeToggle />

          {/* Guardian Profile Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius)",
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "var(--brand, #e11d48)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {(patient.guardianName || "G").charAt(0).toUpperCase()}
            </div>
            <span style={{ fontWeight: 600 }}>{patient.guardianName || "Guardian"}</span>
          </div>

          <button
            type="button"
            className="btn-small-outline"
            onClick={handleLogout}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px" }}
            title="Log out from patient portal"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      </header>

      {/* ── Main Dashboard Body ── */}
      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 20px 48px" }}>
        {/* ── 1. Patient Demographics & Report Action Banner ── */}
        <div
          className="panel"
          style={{
            marginBottom: 20,
            background: "linear-gradient(135deg, rgba(15, 76, 129, 0.08) 0%, rgba(225, 29, 72, 0.04) 100%)",
            border: "1px solid rgba(15, 76, 129, 0.16)",
            padding: "18px 22px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>
                  {patient.name}
                </h1>
                <span className={`badge ${isDischarged ? "badge-unassigned" : "badge-ok"}`} style={{ fontSize: 11, padding: "3px 9px" }}>
                  {isDischarged ? "Discharged" : "Actively Monitored in NICU"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Incubator Station: <strong>{incubatorName}</strong> · Admitted on {formatDate(patient.admittedAt)}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", textTransform: "uppercase", fontWeight: 700 }}>
                  Access Code
                </div>
                <div style={{ fontFamily: "IBM Plex Mono", fontSize: 16, fontWeight: 800, color: "var(--brand, #e11d48)" }}>
                  {patient.accessCode || "-"}
                </div>
              </div>

              <button
                type="button"
                className="btn-small-outline"
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12.5,
                  padding: "7px 14px",
                }}
                title="Download certified clinical medical report as PDF"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                {pdfGenerating ? "Generating..." : "Clinical Report (PDF)"}
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. Live Vitals Metrics Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 20 }}>
          {/* Heart Rate */}
          <div className="panel" style={{ borderLeft: "4px solid var(--hr, #ef4444)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Heart Rate</span>
              <span style={{ fontSize: 11, color: "var(--hr, #ef4444)", fontWeight: 700 }}>BPM</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "var(--hr, #ef4444)" }}>
              {latestVital?.heart_rate != null ? latestVital.heart_rate : "--"}
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginLeft: 6 }}>BPM</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              Min: {vitalsStats.summary?.minHR ? Math.round(vitalsStats.summary.minHR) : "-"} | Avg: {vitalsStats.summary?.avgHR ? Math.round(vitalsStats.summary.avgHR) : "-"} | Max: {vitalsStats.summary?.maxHR ? Math.round(vitalsStats.summary.maxHR) : "-"}
            </div>
          </div>

          {/* SpO2 */}
          <div className="panel" style={{ borderLeft: "4px solid var(--spo2, #06b6d4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Oxygen Saturation</span>
              <span style={{ fontSize: 11, color: "var(--spo2, #06b6d4)", fontWeight: 700 }}>SpO2</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "var(--spo2, #06b6d4)" }}>
              {latestVital?.spo2 != null ? latestVital.spo2 : "--"}
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginLeft: 6 }}>%</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              Min: {vitalsStats.summary?.minSpO2 ? Math.round(vitalsStats.summary.minSpO2) : "-"} | Avg: {vitalsStats.summary?.avgSpO2 ? Math.round(vitalsStats.summary.avgSpO2) : "-"} | Max: {vitalsStats.summary?.maxSpO2 ? Math.round(vitalsStats.summary.maxSpO2) : "-"}
            </div>
          </div>

          {/* Temperature */}
          <div className="panel" style={{ borderLeft: "4px solid var(--temp, #f59e0b)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>Incubator Temperature</span>
              <span style={{ fontSize: 11, color: "var(--temp, #f59e0b)", fontWeight: 700 }}>°C</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "var(--temp, #f59e0b)" }}>
              {latestVital?.temperature != null ? Number(latestVital.temperature).toFixed(1) : "--"}
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)", marginLeft: 6 }}>°C</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}>
              Min: {vitalsStats.summary?.minTemp ? Number(vitalsStats.summary.minTemp).toFixed(1) : "-"} | Avg: {vitalsStats.summary?.avgTemp ? Number(vitalsStats.summary.avgTemp).toFixed(1) : "-"} | Max: {vitalsStats.summary?.maxTemp ? Number(vitalsStats.summary.maxTemp).toFixed(1) : "-"}
            </div>
          </div>
        </div>

        {/* ── 4. Continuous Telemetry Parameter Stream (Matching Live NICU UI) ── */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              Continuous Telemetry Parameter Stream - {incubatorName}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { key: "1h", label: "1h" },
                { key: "6h", label: "6h" },
                { key: "12h", label: "12h" },
                { key: "24h", label: "24h" },
                { key: "all", label: "All" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`btn-small-outline ${timeRange === tab.key ? "active" : ""}`}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    background: timeRange === tab.key ? "var(--brand)" : "transparent",
                    color: timeRange === tab.key ? "#fff" : "inherit",
                  }}
                  onClick={() => setTimeRange(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Continuous Line Graph Parameter Stream */}
          <LiveChart data={vitalsHistory} />
        </div>

        {/* ── 5. Registry Information & Attending Care Team ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 20 }}>
          {/* Baby Registry Information */}
          <div className="panel">
            <h3 className="panel-title" style={{ marginBottom: 16 }}>Baby Registry &amp; Health Profile</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px", fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Date of Birth</span>
                <strong>{formatDateShort(patient.dateOfBirth)}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Biological Sex</span>
                <strong style={{ textTransform: "capitalize" }}>{patient.biologicalSex || "Unknown"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Gestational Age</span>
                <strong>{patient.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks} Weeks` : "Not recorded"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Birth Weight</span>
                <strong>{patient.birthWeightGrams ? `${patient.birthWeightGrams} grams` : "Not recorded"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Blood Group</span>
                <strong>{patient.bloodType || "Unknown"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Primary Indication</span>
                <strong>{patient.primarySyndrome || "Observation & Supportive Care"}</strong>
              </div>
            </div>
          </div>

          {/* Assigned Doctor & Care Team */}
          <div className="panel">
            <h3 className="panel-title" style={{ marginBottom: 16 }}>Attending Physician &amp; NICU Team</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Attending Neonatologist</span>
                <strong style={{ fontSize: 14, color: "var(--brand, #e11d48)" }}>
                  {doctor?.name ? `Dr. ${doctor.name}` : "NICU Medical Officer on Duty"}
                </strong>
                {doctor?.licenseNumber && (
                  <div style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 1 }}>
                    Registration: {doctor.licenseNumber}
                  </div>
                )}
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Direct Contact</span>
                <strong>{doctor?.phone || doctor?.email || "Hospital NICU Duty Desk"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Hospital Facility</span>
                <strong>{patient.hospitalId?.name || "NeoCare Neonatal Medical Center"}</strong>
              </div>
              {isDischarged && (
                <div style={{ background: "rgba(34, 197, 94, 0.1)", padding: 10, borderRadius: 6, border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                  <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 11, display: "block" }}>
                    DISCHARGED ON {formatDate(patient.dischargedAt)}
                  </span>
                  <p style={{ margin: "4px 0 0", fontSize: 12 }}>
                    {patient.dischargeSummary || "Baby reached stable vitals and safely transitioned to general pediatric follow-up."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. Mother / Guardian Details ── */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <h3 className="panel-title" style={{ marginBottom: 14 }}>Mother / Legal Guardian Information</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, fontSize: 13 }}>
            <div>
              <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Guardian Full Name</span>
              <strong>{patient.guardianName || "Not Recorded"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Emergency Contact Phone</span>
              <strong>{patient.guardianPhone || "Not Recorded"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>National ID / Passport</span>
              <strong>{patient.guardianNationalId || "Not Recorded"}</strong>
            </div>
            <div>
              <span style={{ color: "var(--text-tertiary)", display: "block", fontSize: 11, fontWeight: 600 }}>Permanent Address</span>
              <strong>{patient.guardianAddress || "Not Recorded"}</strong>
            </div>
          </div>
        </div>

        {/* ── 7. Clinical Progress Notes ── */}
        <div className="panel">
          <h3 className="panel-title" style={{ marginBottom: 14 }}>Clinical Progress Notes &amp; Physician Updates</h3>
          {notes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notes.map((n) => (
                <div
                  key={n._id}
                  style={{
                    background: "var(--bg-main)",
                    padding: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                    <strong style={{ color: "var(--brand, #e11d48)" }}>
                      {n.authorId?.name ? `${n.authorId.name} (${n.authorId.role || "Doctor"})` : "Care Team"}
                    </strong>
                    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{formatDate(n.timestamp)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{n.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No clinical progress notes posted yet. The attending medical team will post updates as needed.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
