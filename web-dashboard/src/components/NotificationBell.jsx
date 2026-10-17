import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";
import {
  extractClinicalTeamContacts,
  directNotifyDoctor,
  directNotifyNurse,
  directNotifyBoth,
  getClinicalSeverityMeta,
  formatDoctorName,
} from "../utils/clinicalCommunication";
import ErrorBoundary from "./ErrorBoundary";

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [notifiedMap, setNotifiedMap] = useState({});
  const [openNotifyMenuId, setOpenNotifyMenuId] = useState(null);
  const panelRef = useRef(null);

  const unread = notifications.filter((n) => !n.isRead).length;

  // Load initial notifications
  async function loadNotifications() {
    try {
      const { data } = await axiosClient.get("/notifications");
      setNotifications(data);
    } catch {
      // Silently fail - not critical
    }
  }

  useEffect(() => {
    if (!user || !["system_admin", "hospital_admin", "doctor", "nurse"].includes(user.role)) return;
    loadNotifications();

    // Connect to socket and join the right room
    const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token: localStorage.getItem("neocare_token") } });
    socket.emit("join:room", {
      role: user.role,
      hospitalId: user.hospitalId,
      userId: user.id || user._id,
    });

    socket.on("notification:new", (notif) => {
      // Hospital isolation for non-system admins
      if (user.role !== "system_admin" && notif.hospitalId && String(notif.hospitalId) !== String(user.hospitalId)) {
        return;
      }
      // Clinical alerts (vital_alert, alert_escalation) are visible to all medical staff in the ward/hospital
      if (notif.type === "vital_alert" || notif.type === "alert_escalation") {
        setNotifications((prev) => [notif, ...prev]);
        return;
      }
      // For personal notifications: only show if targeted to this user
      if ((user.role === "doctor" || user.role === "nurse") && notif.targetUserId) {
        const myId = user.id || user._id;
        if (String(notif.targetUserId) !== String(myId)) return;
      }
      setNotifications((prev) => [notif, ...prev]);
    });

    return () => socket.disconnect();
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync notify menu when panel closes or user clicks outside notify menu
  useEffect(() => {
    if (!open) {
      setOpenNotifyMenuId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!openNotifyMenuId) return;
    function handleClickOutsideNotify(e) {
      if (!e.target.closest(".clinical-notify-dropdown-wrapper")) {
        setOpenNotifyMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutsideNotify);
    return () => document.removeEventListener("mousedown", handleClickOutsideNotify);
  }, [openNotifyMenuId]);

  const [rejectingNotif, setRejectingNotif] = useState({ open: false, notif: null, reason: "" });
  const [rejectingDischarge, setRejectingDischarge] = useState({ open: false, notif: null, reason: "" });

  async function handleAcceptReview(notif, e) {
    e.stopPropagation();
    try {
      await axiosClient.patch(`/notifications/${notif._id}/accept`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, status: "accepted", isRead: true } : n))
      );
    } catch (err) {
      console.error("[handleAcceptReview]", err);
    }
  }

  function openRejectModal(notif, e) {
    e.stopPropagation();
    setRejectingNotif({ open: true, notif, reason: "" });
  }

  async function handleConfirmReject(e) {
    e.preventDefault();
    if (!rejectingNotif.reason.trim() || !rejectingNotif.notif) return;
    try {
      await axiosClient.post(`/notifications/${rejectingNotif.notif._id}/reject`, {
        rejectionReason: rejectingNotif.reason.trim(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n._id === rejectingNotif.notif._id ? { ...n, status: "rejected", isRead: true } : n))
      );
      setRejectingNotif({ open: false, notif: null, reason: "" });
    } catch (err) {
      console.error("[handleConfirmReject]", err);
    }
  }

  async function handleAcceptDischarge(notif, e) {
    e.stopPropagation();
    try {
      await axiosClient.patch(`/notifications/${notif._id}/accept-discharge`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, status: "accepted", isRead: true } : n))
      );
    } catch (err) {
      console.error("[handleAcceptDischarge]", err);
    }
  }

  function openRejectDischargeModal(notif, e) {
    e.stopPropagation();
    setRejectingDischarge({ open: true, notif, reason: "" });
  }

  async function handleConfirmRejectDischarge(e) {
    e.preventDefault();
    if (!rejectingDischarge.reason.trim() || !rejectingDischarge.notif) return;
    try {
      await axiosClient.post(`/notifications/${rejectingDischarge.notif._id}/reject-discharge`, {
        rejectionReason: rejectingDischarge.reason.trim(),
      });
      setNotifications((prev) =>
        prev.map((n) => (n._id === rejectingDischarge.notif._id ? { ...n, status: "rejected", isRead: true } : n))
      );
      setRejectingDischarge({ open: false, notif: null, reason: "" });
    } catch (err) {
      console.error("[handleConfirmRejectDischarge]", err);
    }
  }

  async function handleMarkAllRead() {
    try {
      await axiosClient.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    try {
      await axiosClient.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch {}
  }

  const handleNotifyDoctor = async (notif, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyDoctor(notif);
      setNotifiedMap((prev) => ({ ...prev, [notif._id]: "doctor" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for attending doctor.");
    }
  };

  const handleNotifyNurse = async (notif, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyNurse(notif);
      setNotifiedMap((prev) => ({ ...prev, [notif._id]: "nurse" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for bedside duty nurse.");
    }
  };

  const handleNotifyBoth = async (notif, e) => {
    if (e) e.stopPropagation();
    try {
      await directNotifyBoth(notif);
      setNotifiedMap((prev) => ({ ...prev, [notif._id]: "both" }));
    } catch (err) {
      alert(err.message || "Unable to launch WhatsApp for clinical team.");
    }
  };

  function getNotificationTargetUrl(notif) {
    const userRole = user?.role;
    if (!notif) return ["doctor", "nurse"].includes(userRole) ? "/dashboard" : "/admin/overview";

    // 1. Bedside & Ward Clinical Vital Alerts / Escalations -> direct incubator telemetry on /dashboard
    if (notif.type === "vital_alert" || notif.type === "alert_escalation") {
      const deviceId = notif.metadata?.deviceId || notif.reviewEntityId;
      return deviceId ? `/dashboard?device=${deviceId}` : "/dashboard";
    }

    // 2. Patient Discharge Requests & Status Updates -> /patients/:id or /patients
    if (
      notif.type === "discharge_request" ||
      notif.type === "discharge_request_accepted" ||
      notif.type === "discharge_request_rejected" ||
      notif.type === "patient_referral"
    ) {
      const pId = notif.patientId?._id || notif.patientId || notif.metadata?.patientId;
      if (pId) {
        if (notif.type === "discharge_request" && userRole === "hospital_admin") {
          return `/patients/${pId}?action=discharge`;
        }
        return `/patients/${pId}`;
      }
      return userRole === "system_admin" ? "/admin/overview?tab=patients" : "/patients";
    }

    // 3. System Admin <-> Hospital In-Charge Review Requests & Responses -> exact entity tab
    if (
      notif.type === "review_request" ||
      notif.type === "review_request_accepted" ||
      notif.type === "review_request_rejected"
    ) {
      const entity = notif.reviewEntity;
      const hospParam = notif.hospitalId ? `&hospitalId=${notif.hospitalId}` : "";
      if (entity === "doctor") return `/admin/overview?tab=doctors${hospParam}`;
      if (entity === "nurse") return `/admin/overview?tab=nurses${hospParam}`;
      if (entity === "ward") return `/admin/overview?tab=wards${hospParam}`;
      if (entity === "incubator") return `/admin/overview?tab=incubators${hospParam}`;
      if (entity === "incharge") return `/admin/overview?tab=incharge${hospParam}`;
      if (entity === "patient") {
        if (notif.reviewEntityId) {
          return `/patients/${notif.reviewEntityId}`;
        }
        return userRole === "system_admin" ? `/admin/overview?tab=patients${hospParam}` : "/patients";
      }
      return `/admin/overview?tab=telemetry${hospParam}`;
    }

    // 4. Staff Registration Approvals (Doctors & Nurses) -> /admin/users?role=doctor|nurse
    if (notif.type === "new_staff") {
      const roleParam = notif.metadata?.role ? `?role=${notif.metadata.role}` : "";
      return userRole === "hospital_admin" ? `/admin/users${roleParam}` : "/admin/overview";
    }

    // 5. Hospital In-Charge Registration Approvals -> /admin/users
    if (notif.type === "new_hospital_admin" || notif.type === "new_signup") {
      return userRole === "system_admin" ? "/admin/users" : "/admin/overview";
    }

    // Role-safe fallback
    if (userRole === "doctor" || userRole === "nurse") {
      return "/dashboard";
    }
    return "/admin/overview";
  }

  async function handleClickNotif(notif) {
    if (!notif.isRead) {
      try {
        await axiosClient.patch(`/notifications/${notif._id}/read`);
        setNotifications((prev) =>
          prev.map((n) => (n._id === notif._id ? { ...n, isRead: true } : n))
        );
      } catch {}
    }
    setOpen(false);
    const targetUrl = getNotificationTargetUrl(notif);
    navigate(targetUrl);
  }

  const getNotifIcon = (type) => {
    switch (type) {
      case "vital_alert":
        return (
          <span style={{ display: "inline-flex", color: "#ef4444" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </span>
        );
      case "alert_escalation":
        return (
          <span style={{ display: "inline-flex", color: "#dc2626" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        );
      case "review_request":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
        );
      case "review_request_accepted":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        );
      case "review_request_rejected":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      case "discharge_request":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case "discharge_request_accepted":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        );
      case "discharge_request_rejected":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--critical)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      case "new_hospital_admin":
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
            <path d="M9 22v-4h6v4"></path>
            <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M12 14h.01M8 14h.01M16 14h.01"></path>
          </svg>
        );
      case "patient_referral":
        return (
          <span style={{ display: "inline-flex", color: "#0ea5e9" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </span>
        );
      default:
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        );
    }
  };

  if (!user || !["system_admin", "hospital_admin", "doctor", "nurse"].includes(user.role)) return null;

  return (
    <>
      <div className="notif-wrapper" ref={panelRef}>
        <button
          className="notif-bell-btn"
          onClick={() => setOpen((o) => !o)}
          title="Notifications"
          aria-label="Notifications"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unread > 0 && (
            <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>

        {open && (
          <div className="notif-panel">
            <div className="notif-panel-header">
              <span className="notif-panel-title">Notifications</span>
              {unread > 0 && (
                <button className="notif-mark-all" onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
            </div>

            <div className="notif-list">
              {notifications.length === 0 && (
                <div className="notif-empty" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    <line x1="2" y1="2" x2="22" y2="22"></line>
                  </svg>
                  No notifications yet
                </div>
              )}
              {notifications.map((n) => {
                const isClinical = n.type === "vital_alert" || n.type === "alert_escalation";
                const isEscalation = n.type === "alert_escalation";
                const contacts = extractClinicalTeamContacts(n);
                return (
                  <div
                    key={n._id}
                    className={`notif-item ${!n.isRead ? "unread" : ""}`}
                    style={
                      isEscalation
                        ? { background: "rgba(185, 28, 28, 0.05)", borderLeft: "3px solid #b91c1c" }
                        : isClinical
                        ? { background: n.severity === "critical" ? "rgba(194, 65, 12, 0.05)" : "rgba(180, 83, 9, 0.05)", borderLeft: `3px solid ${n.severity === "critical" ? "#c2410c" : "#b45309"}` }
                        : n.type === "patient_referral"
                        ? { background: "rgba(14, 165, 233, 0.04)", borderLeft: "3px solid #0284c7" }
                        : undefined
                    }
                    onClick={() => handleClickNotif(n)}
                  >
                    <div className="notif-item-icon">
                      {getNotifIcon(n.type)}
                    </div>
                    <div className="notif-item-body">
                      <div className="notif-item-title" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{n.title}</span>
                        {isEscalation && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(185, 28, 28, 0.12)", color: "#b91c1c", border: "1px solid rgba(185, 28, 28, 0.3)", letterSpacing: "0.03em" }}>
                            SUPERVISOR ADVISORY
                          </span>
                        )}
                        {!isEscalation && isClinical && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: n.severity === "critical" ? "rgba(194, 65, 12, 0.12)" : "rgba(180, 83, 9, 0.12)", color: n.severity === "critical" ? "#c2410c" : "#b45309", border: `1px solid ${n.severity === "critical" ? "rgba(194, 65, 12, 0.3)" : "rgba(180, 83, 9, 0.3)"}`, letterSpacing: "0.03em" }}>
                            {n.severity === "critical" ? "CLINICAL PRIORITY" : "CLINICAL NOTICE"}
                          </span>
                        )}
                        {n.type === "patient_referral" && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "rgba(14, 165, 233, 0.12)", color: "#0284c7", border: "1px solid rgba(14, 165, 233, 0.3)", letterSpacing: "0.03em" }}>
                            CARE REFERRAL
                          </span>
                        )}
                      </div>
                      <div className="notif-item-msg">{n.message}</div>

                    {/* Interactive Accept / Decline buttons for Hospital In-Charge */}
                    {n.type === "review_request" && user.role === "hospital_admin" && (
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                        {(!n.status || n.status === "pending") ? (
                          <>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 14px",
                                fontSize: 11.5,
                                fontWeight: 700,
                                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: 6,
                                cursor: "pointer",
                                boxShadow: "0 2px 5px rgba(16, 185, 129, 0.25)",
                                transition: "all 0.15s ease-in-out",
                              }}
                              onClick={(e) => handleAcceptReview(n, e)}
                              title="Accept review request and mark resolved"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              Accept Request
                            </button>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 13px",
                                fontSize: 11.5,
                                fontWeight: 600,
                                background: "rgba(239, 68, 68, 0.08)",
                                color: "#e11d48",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: 6,
                                cursor: "pointer",
                                transition: "all 0.15s ease-in-out",
                              }}
                              onClick={(e) => openRejectModal(n, e)}
                              title="Decline review request and provide reason"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                              Decline Request
                            </button>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "5px 11px",
                                fontSize: 11,
                                fontWeight: 600,
                                background: "rgba(99, 102, 241, 0.1)",
                                color: "#4f46e5",
                                border: "1px solid rgba(99, 102, 241, 0.35)",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                              onClick={() => handleClickNotif(n)}
                              title="Open module in Executive Overview"
                            >
                              View in Overview →
                            </button>
                          </>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "4px 10px",
                              borderRadius: 9999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: n.status === "accepted" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                              color: n.status === "accepted" ? "#059669" : "#dc2626",
                              border: `1px solid ${n.status === "accepted" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                            }}
                          >
                            {n.status === "accepted" ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Accepted &amp; Resolved
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Declined
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Interactive Accept / Decline for Hospital In-Charge - discharge_request */}
                    {n.type === "discharge_request" && user.role === "hospital_admin" && (
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                        {(!n.status || n.status === "pending") ? (
                          <>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "6px 14px",
                                fontSize: 11.5,
                                fontWeight: 700,
                                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: 6,
                                cursor: "pointer",
                                boxShadow: "0 2px 5px rgba(16, 185, 129, 0.25)",
                                transition: "all 0.15s ease-in-out",
                              }}
                              onClick={(e) => handleAcceptDischarge(n, e)}
                              title="Approve discharge and discharge the patient"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                              Approve Discharge
                            </button>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 13px",
                                fontSize: 11.5,
                                fontWeight: 600,
                                background: "rgba(239, 68, 68, 0.08)",
                                color: "#e11d48",
                                border: "1px solid rgba(225, 29, 72, 0.4)",
                                borderRadius: 6,
                                cursor: "pointer",
                                transition: "all 0.15s ease-in-out",
                              }}
                              onClick={(e) => openRejectDischargeModal(n, e)}
                              title="Decline discharge request"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                              Decline
                            </button>
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "5px 11px",
                                fontSize: 11,
                                fontWeight: 600,
                                background: "rgba(59, 130, 246, 0.1)",
                                color: "#2563eb",
                                border: "1px solid rgba(59, 130, 246, 0.35)",
                                borderRadius: 6,
                                cursor: "pointer",
                              }}
                              onClick={() => handleClickNotif(n)}
                              title="Open patient medical records"
                            >
                              View Patient Chart →
                            </button>
                          </>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "4px 10px",
                              borderRadius: 9999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: n.status === "accepted" ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                              color: n.status === "accepted" ? "#059669" : "#dc2626",
                              border: `1px solid ${n.status === "accepted" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                            }}
                          >
                            {n.status === "accepted" ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Discharge Approved
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Declined
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Direct action button for discharge request outcomes (for Doctor) */}
                    {(n.type === "discharge_request_accepted" || n.type === "discharge_request_rejected") && (
                      <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            background: "rgba(59, 130, 246, 0.1)",
                            color: "#2563eb",
                            border: "1px solid rgba(59, 130, 246, 0.35)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => handleClickNotif(n)}
                        >
                          View Patient File →
                        </button>
                      </div>
                    )}

                    {/* Direct action button for new staff registration approvals */}
                    {n.type === "new_staff" && (
                      <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.1)",
                            color: "#059669",
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => handleClickNotif(n)}
                        >
                          Review Staff Approvals →
                        </button>
                      </div>
                    )}

                    {/* Direct action button for new hospital admin registration approvals */}
                    {(n.type === "new_hospital_admin" || n.type === "new_signup") && (
                      <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "5px 12px",
                            fontSize: 11,
                            fontWeight: 600,
                            background: "rgba(16, 185, 129, 0.1)",
                            color: "#059669",
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => handleClickNotif(n)}
                        >
                          Review In-Charge Approvals →
                        </button>
                      </div>
                    )}

                    {/* Interactive Emergency Telemetry & WhatsApp actions for vital alerts and escalations */}
                    {isClinical && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: "var(--text-secondary)" }}>
                          {n.metadata?.patientName && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: "var(--text-primary)" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="7" r="4" />
                                <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
                              </svg>
                              <span>{n.metadata.patientName}</span>
                            </span>
                          )}
                          {(n.metadata?.incubatorLabel || n.reviewEntityId) && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 4v16" />
                                <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                                <path d="M2 17h20" />
                                <path d="M6 8v9" />
                              </svg>
                              <span>{n.metadata?.incubatorLabel || n.reviewEntityId}</span>
                            </span>
                          )}
                          {n.metadata?.doctorName && (
                            <span>• {formatDoctorName(n.metadata.doctorName)}</span>
                          )}
                        </div>

                        {["hospital_admin", "system_admin"].includes(user?.role) && (contacts.hasDoctor || contacts.hasNurse) && (
                          <div style={{ marginTop: 6, position: "relative" }}>
                            <div className="clinical-notify-dropdown-wrapper">
                              <button
                                type="button"
                                className={`btn-clinical-notify ${openNotifyMenuId === n._id ? "active" : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenNotifyMenuId(openNotifyMenuId === n._id ? null : n._id);
                                }}
                                aria-expanded={openNotifyMenuId === n._id}
                                title="Dispatch clinical advisory via WhatsApp"
                              >
                                <span>Notify</span>
                                {notifiedMap[n._id] && <span className="notify-status-dot" />}
                                <svg className={`chevron-icon ${openNotifyMenuId === n._id ? "open" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </button>

                              {openNotifyMenuId === n._id && (
                                <div className="custom-select-menu clinical-notify-menu" onClick={(e) => e.stopPropagation()}>
                                  {contacts.hasDoctor && (
                                    <div
                                      className="custom-select-option"
                                      onClick={(e) => {
                                        setOpenNotifyMenuId(null);
                                        handleNotifyDoctor(n, e);
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
                                        handleNotifyNurse(n, e);
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
                        )}
                      </div>
                    )}

                    <div className="notif-item-time">
                      {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="notif-item-delete"
                    onClick={(e) => handleDelete(n._id, e)}
                    title="Dismiss"
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>

            {notifications.length > 0 && (
              <div className="notif-panel-footer">
                <button
                  className="notif-view-all"
                  onClick={() => {
                    setOpen(false);
                    if (["system_admin", "hospital_admin"].includes(user?.role)) {
                      navigate("/admin/overview");
                    } else {
                      navigate("/dashboard");
                    }
                  }}
                >
                  {["system_admin", "hospital_admin"].includes(user?.role)
                    ? "View Command Center →"
                    : "View NICU Dashboard →"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========== DECLINE REVIEW REQUEST MODAL =========== */}
      {rejectingNotif.open && (
        <div className="modal-overlay" onClick={() => setRejectingNotif({ open: false, notif: null, reason: "" })}>
          <div className="modal-panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                  Decline Review Request
                </div>
                <div className="modal-subtitle">Provide explanatory response for System Admin</div>
              </div>
              <button className="modal-close" onClick={() => setRejectingNotif({ open: false, notif: null, reason: "" })}>x</button>
            </div>
            <form onSubmit={handleConfirmReject}>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Reason for Declining *</label>
                <textarea
                  className="input-textarea"
                  rows={3}
                  placeholder="e.g. License verified directly with the medical council registry; entry is correct."
                  value={rejectingNotif.reason}
                  onChange={(e) => setRejectingNotif((prev) => ({ ...prev, reason: e.target.value }))}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--sans)", marginTop: 6 }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-small-outline" onClick={() => setRejectingNotif({ open: false, notif: null, reason: "" })}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-small"
                  style={{
                    background: "#e11d48",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600
                  }}
                >
                  Decline &amp; Send Reason
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========== DECLINE DISCHARGE REQUEST MODAL =========== */}
      {rejectingDischarge.open && (
        <div className="modal-overlay" onClick={() => setRejectingDischarge({ open: false, notif: null, reason: "" })}>
          <div className="modal-panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                  </svg>
                  Decline Discharge Request
                </div>
                <div className="modal-subtitle">The doctor will be notified of the reason</div>
              </div>
              <button className="modal-close" onClick={() => setRejectingDischarge({ open: false, notif: null, reason: "" })}>x</button>
            </div>
            <form onSubmit={handleConfirmRejectDischarge}>
              <div className="field">
                <label style={{ fontWeight: 600, fontSize: 13 }}>Reason for Declining *</label>
                <textarea
                  className="input-textarea"
                  rows={3}
                  placeholder="e.g. Patient vitals are still unstable. Continue monitoring for 24 more hours."
                  value={rejectingDischarge.reason}
                  onChange={(e) => setRejectingDischarge((prev) => ({ ...prev, reason: e.target.value }))}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--sans)", marginTop: 6 }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn-small-outline" onClick={() => setRejectingDischarge({ open: false, notif: null, reason: "" })}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-small"
                  style={{
                    background: "#e11d48",
                    color: "#ffffff",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600
                  }}
                >
                  Decline &amp; Notify Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct WhatsApp actions handled inline */}
    </>
  );
}

