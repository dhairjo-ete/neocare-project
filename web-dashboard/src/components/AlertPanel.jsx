import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  extractClinicalTeamContacts,
  directNotifyDoctor,
  directNotifyNurse,
  directNotifyBoth,
  getClinicalSeverityMeta,
} from "../utils/clinicalCommunication";
import { useAuth } from "../context/AuthContext";
import ErrorBoundary from "./ErrorBoundary";

export default function AlertPanel({ alerts = [], onAcknowledge }) {
  const { user } = useAuth();
  const isSupervisor = user?.role === "hospital_admin" || user?.role === "system_admin";
  const navigate = useNavigate();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [notifiedMap, setNotifiedMap] = useState({});
  const [openNotifyMenuId, setOpenNotifyMenuId] = useState(null);
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);

  // Close notify dropdown on click outside
  useEffect(() => {
    function handleOutsideClick(e) {
      if (!e.target.closest(".clinical-notify-dropdown-wrapper")) {
        setOpenNotifyMenuId(null);
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleOpenBed = (deviceId, e) => {
    if (e) e.stopPropagation();
    if (deviceId) {
      navigate(`/dashboard?device=${deviceId}`);
    }
  };

  // Initialize or retrieve Web Audio Context
  function getAudioContext() {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().then(() => setAudioUnlocked(true)).catch(() => {});
    } else if (audioCtxRef.current && audioCtxRef.current.state === "running") {
      setAudioUnlocked(true);
    }
    return audioCtxRef.current;
  }

  // Auto-unlock AudioContext on first user interaction anywhere on the document
  useEffect(() => {
    function unlockAudio() {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "running") {
        setAudioUnlocked(true);
        window.removeEventListener("click", unlockAudio);
        window.removeEventListener("keydown", unlockAudio);
        window.removeEventListener("touchstart", unlockAudio);
      }
    }

    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Gentle acoustic clinical chime (smooth pure sines, soft attack, natural harmonic interval)
  const playAlarmChime = (isCritical = true) => {
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== "running") return;

      const now = ctx.currentTime;
      const freq1 = isCritical ? 698.46 : 523.25; // F5 (priority) vs C5 (notice)
      const freq2 = isCritical ? 880.00 : 659.25; // A5 (priority) vs E5 (notice)
      const peakGain = isCritical ? 0.08 : 0.05;

      // Bell 1 (soft linear attack, natural exponential decay)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq1, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(peakGain, now + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.0008, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.36);

      // Bell 2 (harmonic chime)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq2, now + 0.16);
      gain2.gain.setValueAtTime(0.001, now + 0.16);
      gain2.gain.linearRampToValueAtTime(peakGain * 0.95, now + 0.20);
      gain2.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.56);
    } catch (err) {
      console.warn("[Alarm Audio Error]", err);
    }
  };

  // Continuous gentle chime loop for unacknowledged clinical alerts
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!audioEnabled || !alerts.length) return;

    const unacknowledgedCritical = alerts.find((a) => a.severity === "critical" && !a.acknowledged);
    const unacknowledgedWarning = alerts.find((a) => a.severity === "warning" && !a.acknowledged);

    if (unacknowledgedCritical || unacknowledgedWarning) {
      const isCritical = !!unacknowledgedCritical;
      // Play once on initial alert
      playAlarmChime(isCritical);

      // Respectful repeat timing: 3.5s for priority, 5.0s for advisory notice
      intervalRef.current = setInterval(() => {
        playAlarmChime(isCritical);
      }, isCritical ? 3500 : 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [alerts, audioEnabled, audioUnlocked]);

  const handleToggleAudio = () => {
    getAudioContext();
    setAudioEnabled((prev) => !prev);
  };

  const handleTestSound = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => {
        setAudioUnlocked(true);
        playAlarmChime(true);
      });
    } else {
      playAlarmChime(true);
    }
  };

  const handleNotifyDoctor = async (alertObj, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyDoctor(alertObj);
      setNotifiedMap((prev) => ({ ...prev, [alertObj._id]: "doctor" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for attending doctor.");
    }
  };

  const handleNotifyNurse = async (alertObj, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyNurse(alertObj);
      setNotifiedMap((prev) => ({ ...prev, [alertObj._id]: "nurse" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for bedside duty nurse.");
    }
  };

  const handleNotifyBoth = async (alertObj, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyBoth(alertObj);
      setNotifiedMap((prev) => ({ ...prev, [alertObj._id]: "both" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for clinical team.");
    }
  };

  const hasUnacknowledged = alerts.some((a) => !a.acknowledged);

  return (
    <div className="alert-panel-wrapper">
      <div className="alert-panel-header">
        <span className="panel-title">
          Clinical Advisories &amp; Active Notices
          {hasUnacknowledged && (
            <span
              className="unack-badge"
              style={{
                background: "rgba(194, 65, 12, 0.12)",
                color: "#c2410c",
                border: "1px solid rgba(194, 65, 12, 0.3)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.03em",
              }}
            >
              ATTENTION RECOMMENDED
            </span>
          )}
        </span>

        <div className="alert-header-actions">
          <button
            type="button"
            className="btn-small-outline"
            onClick={handleTestSound}
            title="Test gentle clinical acoustic chime"
            style={{ marginRight: 8, padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            Chime Test
          </button>

          <button
            type="button"
            className={`audio-toggle-btn ${audioEnabled ? "enabled" : "disabled"}`}
            onClick={handleToggleAudio}
            title="Toggle audio clinical chime"
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {audioEnabled ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                Chime Sound ON
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                  <path d="M18 8a6 6 0 0 0-9.33-5" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Chime Sound OFF
              </>
            )}
          </button>
        </div>
      </div>

      {!audioUnlocked && audioEnabled && (
        <div
          className="audio-unlock-notice"
          onClick={handleTestSound}
          style={{
            padding: "8px 12px",
            background: "rgba(2, 132, 199, 0.15)",
            border: "1px solid #0284c7",
            borderRadius: 6,
            marginBottom: 12,
            fontSize: 13,
            color: "#38bdf8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <strong>Tap here or click anywhere to activate gentle medical audio chimes.</strong>
        </div>
      )}

      {!alerts.length ? (
        <p className="empty-state">All patient physiological parameters are within expected clinical thresholds.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => {
            const meta = getClinicalSeverityMeta(a.severity, a.escalated);
            const isPriority = a.severity === "critical" || a.escalated;
            const contacts = extractClinicalTeamContacts(a);
            const wasNotified = a.teamNotifiedAt || notifiedMap[a._id];
            return (
              <li
                key={a._id || `${a.device_id}-${a.timestamp}`}
                className={`alert-row ${a.acknowledged ? "acknowledged" : ""} ${isPriority && !a.acknowledged ? "pulse-critical" : ""}`}
                style={{
                  borderLeftColor: meta.color,
                  cursor: a.device_id ? "pointer" : "default",
                  transition: "background 0.15s ease-in-out",
                }}
                onClick={() => handleOpenBed(a.device_id)}
                title={a.device_id ? `Click to open live bed telemetry for ${a.incubatorLabel || a.device_id}` : ""}
              >
                <div className="alert-left">
                  <span
                    className="alert-severity-badge"
                    style={{
                      backgroundColor: meta.bg,
                      color: meta.color,
                      border: `1px solid ${meta.border}`,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {meta.label}
                  </span>
                  <div className="alert-detail">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                      <strong>{a.patientName ? `${a.patientName} (${a.incubatorLabel || a.device_id})` : (a.incubatorLabel || a.device_id)}</strong>
                      {a.escalated && (
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: 4,
                            background: "rgba(185, 28, 28, 0.12)",
                            color: "#b91c1c",
                            border: "1px solid rgba(185, 28, 28, 0.3)",
                            letterSpacing: "0.02em",
                          }}
                        >
                          SUPERVISOR NOTIFIED
                        </span>
                      )}
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                      {a.condition || (a.type ? a.type.replace(/_/g, " ") : "Telemetry Observation")} ({a.value})
                    </div>
                    <span className="alert-time">
                      {a.timestamp && !isNaN(new Date(a.timestamp).getTime()) ? new Date(a.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now"}
                      {contacts.doctorName && ` • Attending: ${contacts.doctorName}`}
                    </span>
                  </div>
                </div>

                <div className="alert-actions-group" onClick={(e) => e.stopPropagation()}>
                  {/* Option 1: Clinical Team Direct Notify Dropdown */}
                  {isSupervisor && (contacts.hasDoctor || contacts.hasNurse) && (
                    <div className="clinical-notify-dropdown-wrapper">
                      <button
                        type="button"
                        className={`btn-clinical-notify ${openNotifyMenuId === a._id ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenNotifyMenuId(openNotifyMenuId === a._id ? null : a._id);
                        }}
                        aria-expanded={openNotifyMenuId === a._id}
                        title="Dispatch instant clinical advisory via WhatsApp"
                      >
                        <span>Notify</span>
                        {wasNotified && (
                          <span
                            className="notify-status-dot"
                            title={a.teamNotifiedAt && !isNaN(new Date(a.teamNotifiedAt).getTime()) ? `Dispatched at ${new Date(a.teamNotifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Notified via WhatsApp"}
                          />
                        )}
                        <svg className={`chevron-icon ${openNotifyMenuId === a._id ? "open" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {openNotifyMenuId === a._id && (
                        <div className="custom-select-menu clinical-notify-menu" onClick={(e) => e.stopPropagation()}>
                          {contacts.hasDoctor && (
                            <div
                              className="custom-select-option"
                              onClick={(e) => {
                                setOpenNotifyMenuId(null);
                                handleNotifyDoctor(a, e);
                              }}
                              title={`WhatsApp ${contacts.doctorName}`}
                            >
                              <span className="custom-select-option-text">
                                Doctor: {contacts.doctorName} ({contacts.doctorPhone})
                              </span>
                            </div>
                          )}

                          {contacts.hasNurse && (
                            <div
                              className="custom-select-option"
                              onClick={(e) => {
                                setOpenNotifyMenuId(null);
                                handleNotifyNurse(a, e);
                              }}
                              title={`WhatsApp ${contacts.nurseName}`}
                            >
                              <span className="custom-select-option-text">
                                Nurse: {contacts.nurseName} ({contacts.nursePhone})
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Option 2: Acknowledge Button */}
                  {onAcknowledge && !a.acknowledged && (() => {
                    const isWardClinician = user?.wardId && a?.wardId && String(user.wardId) === String(a.wardId);
                    const isAssignedDoctor = (a.patientId?.assignedDoctor && String(a.patientId.assignedDoctor) === String(user?._id)) ||
                      (a.assignedDoctorName && user?.name && a.assignedDoctorName.toLowerCase().includes(user.name.toLowerCase()));
                    const isAssignedNurse = (a.dutyNurseName && user?.name && a.dutyNurseName.toLowerCase().includes(user.name.toLowerCase()));
                    const isSupervisor = user?.role === "hospital_admin" || user?.role === "system_admin";
                    const isAllowedToAck = isSupervisor || isWardClinician || isAssignedDoctor || isAssignedNurse;

                    return (
                      <button
                        type="button"
                        className={`btn-clinical-ack ${!isAllowedToAck ? "disabled-ack" : ""}`}
                        disabled={!isAllowedToAck}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAcknowledge(a._id);
                        }}
                        title={
                          isAllowedToAck
                            ? "Acknowledge alert and log bedside clinical review"
                            : !user?.wardId
                            ? "Acknowledge restricted: You are unassigned. Only clinical staff on duty in this NICU ward can acknowledge alerts."
                            : "Acknowledge restricted: You are assigned to a different NICU ward."
                        }
                        style={!isAllowedToAck ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                      >
                        {!isAllowedToAck ? "Duty Restricted" : "Acknowledge"}
                      </button>
                    );
                  })()}

                  {a.acknowledged && (
                    <span
                      className="clinical-ack-badge"
                      title={a.acknowledgedBy?.name ? `Acknowledged by ${a.acknowledgedBy.name} (${a.acknowledgedBy.role || "Staff"})` : "Acknowledged by clinical staff"}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{a.acknowledgedBy?.name ? `Ack: ${a.acknowledgedBy.name}` : "Acknowledged"}</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

