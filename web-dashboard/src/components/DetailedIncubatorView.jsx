import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import VitalCard from "./VitalCard";
import LiveChart from "./LiveChart";
import AlertPanel from "./AlertPanel";
import DigitalTwin from "./DigitalTwin";
import ErrorBoundary from "./ErrorBoundary";
import axiosClient from "../api/axiosClient";
import { playEmergencyAlarm, stopEmergencyAlarm, setAlarmMuted } from "../utils/audioAlarm";
import { useDataSync } from "../hooks/useDataSync";
import { classifyVitals } from "../utils/vitalsStatus";
import { useAuth } from "../context/AuthContext";
import { formatDoctorName } from "../utils/clinicalCommunication";

export default function DetailedIncubatorView({
  selectedDevice,
  activeVital,
  activeHistory,
  alerts = [],
  onAcknowledgeAlert,
}) {
  const { user } = useAuth();
  const canControl = ["doctor", "nurse", "hospital_admin", "system_admin"].includes(user?.role);

  const [patient, setPatient] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [notes, setNotes] = useState([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Fetch active patient assigned to this incubator
  const loadPatient = useCallback(() => {
    axiosClient.get("/patients?activeOnly=true")
      .then((res) => {
        const found = res.data.find((p) => {
          const incId = p.incubatorId?._id || p.incubatorId;
          const topicId = p.incubatorId?.deviceTopicId;
          return topicId === selectedDevice || incId === selectedDevice;
        });
        setPatient(found || null);

        if (found) {
          axiosClient.get(`/patients/${found._id}/notes`)
            .then((nRes) => setNotes(nRes.data))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [selectedDevice]);

  useEffect(() => {
    setPatient(null);
    setNotes([]);
    loadPatient();
  }, [selectedDevice, loadPatient]);

  // Keep this view in sync when an admin renames the incubator, edits the
  // patient, adds a note, or changes ward/hospital info elsewhere - without
  // this, a nurse could be looking at a stale incubator label or patient
  // profile until they happen to navigate away and back.
  useDataSync(loadPatient);

  // Determine if vitals are in critical state
  const isCritical = classifyVitals(activeVital) === "critical";

  // Trigger Audio Alarm on critical status
  useEffect(() => {
    if (isCritical) {
      playEmergencyAlarm();
    } else {
      stopEmergencyAlarm();
    }
    return () => stopEmergencyAlarm();
  }, [isCritical]);

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    setAlarmMuted(nextMute);
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!patient || !newNoteText.trim()) return;
    try {
      const { data } = await axiosClient.post(`/patients/${patient._id}/notes`, {
        text: newNoteText.trim(),
      });
      setNotes((prev) => [...prev, data]);
      setNewNoteText("");
      setShowNoteInput(false);
    } catch {}
  };

  const handleDeleteNote = async (noteId) => {
    if (!patient) return;
    if (!window.confirm("Are you sure you want to delete this clinical note? This action cannot be undone.")) return;
    try {
      await axiosClient.delete(`/patients/${patient._id}/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch (err) {
      console.error("Failed to delete clinical note:", err);
    }
  };

  return (
    <div className={`detailed-dashboard-wrapper ${isCritical ? "emergency-active" : ""}`}>
      {/* Emergency Alert Banner */}
      {isCritical && (
        <div className="emergency-alert-banner">
          <div className="emergency-banner-left">
            <span className="emergency-icon-pulse" style={{ display: "flex", alignItems: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div>
              <div className="emergency-banner-title">Clinical Priority Notice — Bedside Assessment Recommended</div>
              <div className="emergency-banner-sub">
                Physiological parameters for {patient?.incubatorId?.label || `Bed ${selectedDevice}`} require clinical review. Please verify infant comfort, sensor placement, and airway.
              </div>
            </div>
          </div>
          <button className="mute-alarm-btn" onClick={toggleMute} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isMuted ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Sound Muted
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                Mute Audio Alarm
              </>
            )}
          </button>
        </div>
      )}

      {/* Patient Profile Header Card */}
      <div className="patient-profile-card">
        <div className="patient-profile-main">
          <div className="patient-avatar-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="patient-profile-details">
            <div className="patient-header-row">
              <h2 className="patient-title-name">
                {patient ? patient.name : "Standby Incubator (No Active Patient)"}
              </h2>
              {patient && (
                <span className="badge badge-ok">1 Bed = 1 Patient Assigned</span>
              )}
            </div>
            {patient ? (
              <div className="patient-meta-grid">
                <div className="patient-meta-item">
                  <span className="patient-meta-k">Gestational Age</span>
                  <strong className="patient-meta-v">{patient.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks} Weeks` : "N/A"}</strong>
                </div>
                <div className="patient-meta-item">
                  <span className="patient-meta-k">Birth Weight</span>
                  <strong className="patient-meta-v">{patient.birthWeightGrams ? `${patient.birthWeightGrams} g` : "N/A"}</strong>
                </div>
                <div className="patient-meta-item">
                  <span className="patient-meta-k">Blood Type</span>
                  <strong className="patient-meta-v">{patient.bloodType || "N/A"}</strong>
                </div>
                <div className="patient-meta-item">
                  <span className="patient-meta-k">Admitted</span>
                  <strong className="patient-meta-v">{patient.admittedAt && !isNaN(new Date(patient.admittedAt).getTime()) ? new Date(patient.admittedAt).toLocaleDateString() : "N/A"}</strong>
                </div>
                <div className="patient-meta-item">
                  <span className="patient-meta-k">Attending Doctor</span>
                  <strong className="patient-meta-v">{patient.assignedDoctor?.name ? formatDoctorName(patient.assignedDoctor.name) : "NICU Team"}</strong>
                </div>
                {patient.assignedNurse?.name && (
                  <div className="patient-meta-item">
                    <span className="patient-meta-k">Duty Nurse</span>
                    <strong className="patient-meta-v">Nurse {patient.assignedNurse.name.replace(/^nurse\s+/i, "")}</strong>
                  </div>
                )}
              </div>
            ) : (
              <p className="patient-empty-notice">
                This incubator is currently in standby mode. Register a patient from the Patients menu to attach continuous monitoring logs.
              </p>
            )}
          </div>
        </div>

        {patient && (
          <div className="patient-actions-bar" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link
              to={`/patients/${patient._id}`}
              className="btn-small-outline"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              title="Open complete clinical profile and medical history for this infant"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              View Patient Chart →
            </Link>
            <button className="btn-small-outline" onClick={() => setShowNoteInput((s) => !s)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Add Clinical Note
            </button>
          </div>
        )}
      </div>

      {/* Add Clinical Note Form */}
      {showNoteInput && patient && (
        <form className="clinical-note-form" onSubmit={handleAddNote}>
          <div className="clinical-note-form-header">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Add Bedside Clinical Note</span>
            </span>
            <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
              Caregiver: {user?.name || "Caregiver"} ({user?.role === "doctor" ? "Attending Physician" : user?.role === "nurse" ? "Duty Nurse" : user?.role === "hospital_admin" ? "Hospital In-Charge" : "Staff"})
            </span>
          </div>

          <textarea
            className="clinical-note-textarea"
            rows={3}
            placeholder="Document bedside clinical observations, medication administered, feeding notes, or physician directives..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            required
            autoFocus
          />

          <div className="clinical-note-form-actions">
            <button
              type="button"
              className="btn-small-outline"
              onClick={() => {
                setShowNoteInput(false);
                setNewNoteText("");
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn-save-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>Save Clinical Note</span>
            </button>
          </div>
        </form>
      )}

      {/* Recent Notes Display */}
      {notes.length > 0 && (
        <div className="panel clinical-notes-panel">
          <div className="section-title">Recent Clinical Notes</div>
          <div className="notes-list">
            {notes.map((n) => {
              const noteAuthorId = n.authorId?._id ? String(n.authorId._id) : (typeof n.authorId === "string" ? n.authorId : "");
              const currentUserId = user?.id ? String(user.id) : (user?._id ? String(user._id) : "");
              const isAuthor = Boolean(currentUserId && noteAuthorId && currentUserId === noteAuthorId);

              return (
                <div key={n._id} className="note-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="note-author">{n.authorId?.name || "Caregiver"}:</span>
                    <span className="note-text" style={{ marginLeft: 6 }}>{n.text}</span>
                    <span className="note-time" style={{ marginLeft: 8 }}>{new Date(n.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {isAuthor && (
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(n._id)}
                      title="Delete your clinical note"
                      aria-label="Delete note"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-tertiary)",
                        padding: "2px 6px",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: "var(--radius-sm, 4px)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger, #ef4444)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Live Vital Metric Cards - only shown when a patient is admitted */}
      {patient ? (
        activeVital ? (
          <>
            <div className="tile-row">
              <VitalCard label="Heart Rate" value={activeVital.heart_rate} unit="bpm" type="heart_rate" />
              <VitalCard label="SpO2 Concentration" value={activeVital.spo2} unit="%" type="spo2" />
              <VitalCard label="Incubator Temperature" value={activeVital.temperature} unit="°C" type="temperature" />
            </div>
            <ErrorBoundary>
              <DigitalTwin
                vital={activeVital}
                incubator={patient?.incubatorId}
                canControl={canControl}
                onControlSuccess={(newSettings) => {
                  if (patient?.incubatorId && typeof patient.incubatorId === "object") {
                    setPatient((prev) => prev ? {
                      ...prev,
                      incubatorId: {
                        ...prev.incubatorId,
                        controlSettings: newSettings,
                      }
                    } : prev);
                  }
                }}
              />
            </ErrorBoundary>
          </>
        ) : (
          <div className="waiting-card">
            <div className="spinner"></div>
            <p className="waiting-msg">Patient admitted - connecting to IoT sensor stream for {selectedDevice}...</p>
          </div>
        )
      ) : (
        /* No patient admitted - show clean standby state, no phantom vitals */
        <div className="panel" style={{ textAlign: "center", padding: "40px 28px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 4v16" />
              <path d="M2 8h18a2 2 0 0 1 2 2v10" />
              <path d="M2 17h20" />
              <path d="M6 8v9" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", marginBottom: 8 }}>
            Standby Incubator - No Patient Admitted
          </div>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", maxWidth: 480, margin: "0 auto 20px" }}>
            This incubator is powered on and ready. Real-time telemetry monitoring, vital sign charts, and clinical
            alarms will activate automatically as soon as a patient is admitted to this bed.
          </p>
          <a
            href="/patients"
            className="btn-primary"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: "var(--radius)",
              background: "var(--ok)", color: "#fff", textDecoration: "none",
              fontWeight: 700, fontSize: 14,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Admit Patient to this Bed
          </a>
        </div>
      )}

      {/* Continuous Line Graph Parameter Stream */}
      <div className="panel">
        <div className="section-title">Continuous Telemetry Parameter Stream - {selectedDevice}</div>
        <ErrorBoundary>
          <LiveChart data={activeHistory} />
        </ErrorBoundary>
      </div>

      {/* Alert Panel */}
      <div className="panel">
        <ErrorBoundary>
          <AlertPanel alerts={alerts} onAcknowledge={onAcknowledgeAlert} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
