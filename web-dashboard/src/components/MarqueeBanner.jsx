import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { safeHref } from "../utils/safeUrl";
import { io } from "socket.io-client";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";
import { requestDesktopNotificationPermission } from "../utils/desktopNotification";
import {
  extractClinicalTeamContacts,
  directNotifyDoctor,
  directNotifyNurse,
  directNotifyBoth,
} from "../utils/clinicalCommunication";
import ErrorBoundary from "./ErrorBoundary";

export default function MarqueeBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [notifiedMap, setNotifiedMap] = useState({});
  const [openNotifyMenu, setOpenNotifyMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-request desktop notification permission on login for doctors and nurses
  useEffect(() => {
    if (user && ["doctor", "nurse", "hospital_admin", "system_admin"].includes(user.role)) {
      requestDesktopNotificationPermission().catch(() => {});
    }
  }, [user]);

  // Load active announcements from API
  const fetchActiveAnnouncements = async () => {
    try {
      const { data } = await axiosClient.get("/announcements/active");
      let list = data || [];
      setAnnouncements(list);
    } catch (err) {
      console.warn("Failed to fetch active announcements", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchActiveAnnouncements();

    // Setup Socket.io real-time connection
    const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token: localStorage.getItem("neocare_token") } });

    // Join hospital socket room
    socket.emit("join:room", {
      role: user.role,
      hospitalId: user.hospitalId,
    });

    const handleAnnouncementChange = () => {
      fetchActiveAnnouncements();
      setIsDismissed(false);
    };

    socket.on("data:change", (payload) => {
      if (payload.entity === "announcement") {
        handleAnnouncementChange();
      }
    });

    socket.on("announcement:change", handleAnnouncementChange);

    // Tier 1: Real-time clinical emergency alert integration
    socket.on("alert:new", (newAlert) => {
      if (newAlert.severity === "critical") {
        setIsDismissed(false);
        setEmergencyAlerts((prev) => {
          const exists = prev.some((a) => a._id === newAlert._id || (a.device_id === newAlert.device_id && a.type === newAlert.type));
          if (exists) return prev;
          return [newAlert, ...prev].slice(0, 5);
        });
      }
    });

    // Tier 4: Real-time unattended escalation alert
    socket.on("alert:escalated", (escAlert) => {
      setIsDismissed(false);
      setEmergencyAlerts((prev) => {
        return [
          { ...escAlert, escalated: true },
          ...prev.filter((a) => a._id !== escAlert._id && a.device_id !== escAlert.device_id),
        ].slice(0, 5);
      });
    });

    // Clear alert when acknowledged by clinician
    socket.on("alert:change", (change) => {
      if (change?.action === "acknowledge" && change?.data?._id) {
        setEmergencyAlerts((prev) => prev.filter((a) => a._id !== change.data._id));
      } else if (change?.action === "close_patient" && change?.data?.patientId) {
        setEmergencyAlerts((prev) => prev.filter((a) => String(a.patientId) !== String(change.data.patientId)));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Format emergency alerts into high-priority ticker items
  const formattedAlertItems = emergencyAlerts.map((a) => {
    const isEscalation = !!a.escalated;
    const title = isEscalation
      ? `Supervisor Advisory: ${a.patientName || "Infant"} (${a.incubatorLabel || a.device_id})`
      : `Clinical Priority: ${a.patientName || "Infant"} (${a.incubatorLabel || a.device_id})`;
    const conditionText = a.condition || (a.type ? a.type.replace(/_/g, " ") : "Telemetry observation");
    const docName = a.assignedDoctorName
      ? a.assignedDoctorName.startsWith("Dr.")
        ? a.assignedDoctorName
        : `Dr. ${a.assignedDoctorName}`
      : "Medical Team";

    return {
      _id: a._id || `alert-${a.device_id}-${a.type}`,
      type: isEscalation ? "emergency" : "critical",
      title,
      message: `${conditionText}: ${a.value} • Attending: ${docName}`,
      isClinicalAlert: true,
      alertData: a,
      createdAt: a.timestamp || new Date(),
    };
  });

  const handleNotifyDoctor = async (alertData, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyDoctor(alertData);
      setNotifiedMap((prev) => ({ ...prev, [alertData._id]: "doctor" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for attending doctor.");
    }
  };

  const handleNotifyNurse = async (alertData, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyNurse(alertData);
      setNotifiedMap((prev) => ({ ...prev, [alertData._id]: "nurse" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for bedside duty nurse.");
    }
  };

  const handleNotifyBoth = async (alertData, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyBoth(alertData);
      setNotifiedMap((prev) => ({ ...prev, [alertData._id]: "both" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for clinical team.");
    }
  };

  // Emergency clinical alerts always precede standard announcements
  const allItems = [...formattedAlertItems, ...announcements];

  // Cycle through items automatically if not paused and not hovered
  useEffect(() => {
    if (allItems.length <= 1 || isPaused || isDismissed) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % allItems.length);
    }, 7000); // 7s per item

    return () => clearInterval(interval);
  }, [allItems.length, isPaused, isDismissed]);

  if (!user || isDismissed || allItems.length === 0) {
    return null;
  }

  const current = allItems[currentIndex] || allItems[0];
  const hasMultiple = allItems.length > 1;

  const getSeverityBadge = (type) => {
    switch (type) {
      case "emergency":
        return {
          label: "SUPERVISOR ADVISORY",
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ),
          className: "badge-emergency",
        };
      case "critical":
        return {
          label: "CLINICAL PRIORITY",
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          ),
          className: "badge-critical",
        };
      case "review_request":
        return {
          label: "SYSTEM ADMIN REVIEW REQUEST",
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          ),
          className: "badge-warning",
        };
      case "warning":
        return {
          label: "SYSTEM WARNING",
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          ),
          className: "badge-warning",
        };
      default:
        return {
          label: "ANNOUNCEMENT",
          icon: (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          ),
          className: "badge-info",
        };
    }
  };

  const badge = getSeverityBadge(current.type);

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % allItems.length);
  };

  const handleTickerClick = () => {
    if (current.isClinicalAlert && current.alertData?.device_id) {
      navigate(`/dashboard?device=${current.alertData.device_id}`);
    } else if (current.actionUrl) {
      if (current.actionUrl.startsWith("/")) {
        navigate(current.actionUrl);
      } else if (safeHref(current.actionUrl)) {
        window.open(current.actionUrl, "_blank", "noopener,noreferrer");
      }
    } else {
      setSelectedItem(current);
    }
  };

  return (
    <>
      <div
        className={`marquee-top-banner marquee-${current.type} ${isPaused ? "marquee-paused" : ""}`}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        role="region"
        aria-label="Real-time Marquee Announcement Ticker"
      >
        <div className="marquee-content-container">
          {/* Badge indicator */}
          <div className={`marquee-badge ${badge.className}`}>
            <span className="marquee-badge-icon">{badge.icon}</span>
            <span className="marquee-badge-text">{badge.label}</span>
          </div>

          {/* Scrolling / Sliding Track */}
          <div
            className="marquee-track-wrapper"
            onClick={handleTickerClick}
            style={{ cursor: "pointer" }}
            title={
              current.isClinicalAlert
                ? `Click to immediately open incubator bed ${current.alertData?.device_id || ""}`
                : current.actionUrl
                ? `Click to navigate to ${current.actionUrl}`
                : "Click for details"
            }
          >
            <div className="marquee-track">
              <span className="marquee-text-title">{current.title}:</span>
              <span className="marquee-text-message">{current.message}</span>
              {current.hospitalId && (
                <span className="marquee-scope-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  {current.hospitalId.name || "Hospital Specific"}
                </span>
              )}
              <span className="marquee-click-hint" style={{ fontWeight: 700, color: current.isClinicalAlert ? "#fca5a5" : "inherit" }}>
                {current.isClinicalAlert ? "Open Bed Monitor →" : current.actionUrl ? "Open Module →" : "(Click for details)"}
              </span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="marquee-controls">
            <button
              type="button"
              className="marquee-ctrl-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedItem(current);
              }}
              title="View full announcement details"
              aria-label="View full announcement details"
              style={{ fontSize: 13, fontWeight: 700 }}
            >
              ℹ️
            </button>
            {hasMultiple && (
              <span className="marquee-counter">
                {currentIndex + 1}/{allItems.length}
              </span>
            )}

            {hasMultiple && (
              <>
                <button
                  type="button"
                  className="marquee-ctrl-btn"
                  onClick={handlePrev}
                  title="Previous Announcement"
                  aria-label="Previous Announcement"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="marquee-ctrl-btn"
                  onClick={handleNext}
                  title="Next Announcement"
                  aria-label="Next Announcement"
                >
                  ▶
                </button>
              </>
            )}

            <button
              type="button"
              className="marquee-ctrl-btn"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? "Resume Ticker" : "Pause Ticker"}
              aria-label={isPaused ? "Resume Ticker" : "Pause Ticker"}
            >
              {isPaused ? "▶" : "⏸"}
            </button>

            <button
              type="button"
              className="marquee-ctrl-btn marquee-dismiss-btn"
              onClick={() => setIsDismissed(true)}
              title="Dismiss Ticker"
              aria-label="Dismiss Ticker"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="modal-card marquee-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`marquee-badge ${getSeverityBadge(selectedItem.type).className}`}>
                  {getSeverityBadge(selectedItem.type).label}
                </span>
                <h3 className="modal-title" style={{ margin: 0 }}>
                  {selectedItem.title}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setSelectedItem(null)}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-meta-row">
                <span className={`detail-type-pill pill-${selectedItem.type}`}>
                  {selectedItem.type.replace("_", " ").toUpperCase()}
                </span>
                <span className="detail-time" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  {new Date(selectedItem.createdAt).toLocaleString()}
                </span>
                {selectedItem.hospitalId && (
                  <span className="detail-location" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                      <path d="M9 22v-4h6v4"></path>
                    </svg>
                    {selectedItem.hospitalId.name || "Hospital Specific"}
                  </span>
                )}
              </div>

              <div className={`detail-message-box msg-${selectedItem.type}`}>
                <div style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-tertiary)", marginBottom: 8 }}>
                  {selectedItem.isClinicalAlert ? "Clinical Observation & Guidance" : "Broadcast Message Details"}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>{selectedItem.message}</p>
              </div>

              {/* Tier 1 & Tier 3 Clinical Emergency Quick Action Bar */}
              {selectedItem.isClinicalAlert && selectedItem.alertData && (
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const devId = selectedItem.alertData.device_id;
                      setSelectedItem(null);
                      navigate(`/dashboard?device=${devId}`);
                    }}
                    className="btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#0284c7",
                      color: "#fff",
                      border: "none",
                      padding: "8px 18px",
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span>Open Bedside Telemetry</span>
                  </button>

                  {["hospital_admin", "system_admin"].includes(user?.role) && (
                    (() => {
                      const contacts = extractClinicalTeamContacts(selectedItem.alertData);
                      if (!contacts.hasDoctor && !contacts.hasNurse) return null;
                      return (
                        <div style={{ position: "relative" }}>
                          <div className="clinical-notify-dropdown-wrapper">
                            <button
                              type="button"
                              className={`btn-clinical-notify ${openNotifyMenu ? "active" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenNotifyMenu((prev) => !prev);
                              }}
                              aria-expanded={openNotifyMenu}
                              title="Dispatch instant clinical advisory via WhatsApp"
                            >
                              <span>Notify</span>
                              {notifiedMap[selectedItem.alertData._id] && <span className="notify-status-dot" />}
                              <svg className={`chevron-icon ${openNotifyMenu ? "open" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {openNotifyMenu && (
                              <div className="custom-select-menu clinical-notify-menu" onClick={(e) => e.stopPropagation()}>
                                {contacts.hasDoctor && (
                                  <div
                                    className="custom-select-option"
                                    onClick={(e) => {
                                      setOpenNotifyMenu(false);
                                      handleNotifyDoctor(selectedItem.alertData, e);
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
                                      setOpenNotifyMenu(false);
                                      handleNotifyNurse(selectedItem.alertData, e);
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
                        </div>
                      );
                    })()
                  )}


                </div>
              )}

              {/* Standard URL action link if present */}
              {!selectedItem.isClinicalAlert && selectedItem.actionUrl && (
                <div className="detail-action-link" style={{ marginTop: 14 }}>
                  {selectedItem.actionUrl.startsWith("/") ? (
                    <button
                      type="button"
                      className="btn-small"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                      onClick={() => {
                        const target = selectedItem.actionUrl;
                        setSelectedItem(null);
                        navigate(target);
                      }}
                    >
                      Take Action / View Module →
                    </button>
                  ) : safeHref(selectedItem.actionUrl) ? (
                    <a
                      href={safeHref(selectedItem.actionUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-small"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                    >
                      Take Action / View Module
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  ) : null}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-small-outline"
                onClick={() => setSelectedItem(null)}
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct WhatsApp actions handled inline */}
    </>
  );
}

