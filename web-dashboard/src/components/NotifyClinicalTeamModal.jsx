import React, { useState } from "react";
import axiosClient from "../api/axiosClient";
import {
  formatDoctorClinicalAdvisory,
  formatNurseClinicalAdvisory,
} from "../utils/clinicalCommunication";

/**
 * NotifyClinicalTeamModal
 *
 * Dedicated supervisory dispatch modal for Hospital In-Charge.
 * Provides a single, unified point of action to notify BOTH Doctor and Nurse simultaneously
 * via automated backend WhatsApp dispatch, with direct one-click WhatsApp chat fallbacks.
 */
export default function NotifyClinicalTeamModal({
  isOpen,
  onClose,
  alert: alertData,
  onNotified,
}) {
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen || !alertData) return null;

  const alertId = alertData._id || alertData.id || alertData.alertId;
  const patientName = String(alertData.patientName || "Admitted Infant");
  const incubatorLabel = String(alertData.incubatorLabel || alertData.device_id || "NICU Bed");
  const condition = String(
    alertData.condition ||
      (alertData.type ? String(alertData.type).replace(/_/g, " ") : "Parameter variance")
  );
  const vitalType = String(alertData.type || "").replace(/_/g, " ").toUpperCase();
  const vitalValue = alertData.value ?? "--";
  const timestamp = alertData.timestamp || alertData.createdAt || new Date();

  // Normalize Attending Doctor
  const rawDoc = alertData.assignedDoctorName;
  const rawDocName = typeof rawDoc === "object" && rawDoc ? rawDoc.name : String(rawDoc || "");
  const doctorName = rawDocName
    ? rawDocName.startsWith("Dr.")
      ? rawDocName
      : `Dr. ${rawDocName}`
    : "Assigned Attending";
  const doctorPhone = String(
    alertData.assignedDoctorPhone || (typeof rawDoc === "object" && rawDoc?.phone) || ""
  );

  // Normalize Duty Nurse
  const rawNurse = alertData.dutyNurseName;
  const nurseName = typeof rawNurse === "object" && rawNurse ? (rawNurse.name || "On-Duty Nurse") : String(rawNurse || "On-Duty Nurse");
  const nursePhone = String(
    alertData.dutyNursePhone || (typeof rawNurse === "object" && rawNurse?.phone) || ""
  );

  // Direct WhatsApp links
  const cleanDocPhone = doctorPhone.replace(/[^0-9]/g, "");
  let docWaLink = null;
  if (cleanDocPhone) {
    try {
      const docText = formatDoctorClinicalAdvisory({
        patientName,
        incubatorLabel,
        condition,
        type: alertData.type,
        value: vitalValue,
        assignedDoctorName: doctorName,
        timestamp,
        deviceId: alertData.device_id,
        escalated: alertData.escalated,
      });
      docWaLink = `https://wa.me/${cleanDocPhone}?text=${encodeURIComponent(docText)}`;
    } catch (e) {
      docWaLink = `https://wa.me/${cleanDocPhone}?text=${encodeURIComponent(`NeoCare Clinical Advisory: ${patientName} (${incubatorLabel}) - ${condition}`)}`;
    }
  }

  const cleanNursePhone = nursePhone.replace(/[^0-9]/g, "");
  let nurseWaLink = null;
  if (cleanNursePhone) {
    try {
      const nurseText = formatNurseClinicalAdvisory({
        patientName,
        incubatorLabel,
        condition,
        type: alertData.type,
        value: vitalValue,
        nurseName,
        timestamp,
        deviceId: alertData.device_id,
        escalated: alertData.escalated,
      });
      nurseWaLink = `https://wa.me/${cleanNursePhone}?text=${encodeURIComponent(nurseText)}`;
    } catch (e) {
      nurseWaLink = `https://wa.me/${cleanNursePhone}?text=${encodeURIComponent(`NeoCare Bedside Advisory: ${patientName} (${incubatorLabel}) - ${condition}`)}`;
    }
  }

  const handleSimultaneousDispatch = async () => {
    // 1. Open Doctor WhatsApp Web
    if (docWaLink) {
      window.open(docWaLink, "_blank");
    }

    // 2. Open Nurse WhatsApp Web with a slight delay so popup blockers don't suppress the second tab
    if (nurseWaLink) {
      setTimeout(() => {
        window.open(nurseWaLink, "_blank");
      }, 400);
    }

    // 3. Record supervisory action in backend
    if (alertId) {
      setDispatching(true);
      setError("");
      try {
        const res = await axiosClient.post(`/alerts/${alertId}/notify-team`);
        setDispatchResult({
          success: true,
          message: "Clinical team WhatsApp chats launched & supervisory notification recorded in NeoCare audit trail.",
        });
        if (onNotified) {
          onNotified(res.data.alert || alertData);
        }
      } catch (err) {
        console.warn("[notify-team record]", err);
        // Even if network record fails, chats already opened
        setDispatchResult({
          success: true,
          message: "WhatsApp chats launched with pre-formatted clinical advisory.",
        });
      } finally {
        setDispatching(false);
      }
    } else {
      setDispatchResult({
        success: true,
        message: "WhatsApp chats launched with pre-formatted clinical advisory.",
      });
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-card"
        style={{
          background: "var(--bg-main, #0f172a)",
          color: "var(--text-primary, #f8fafc)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          maxWidth: 520,
          width: "100%",
          padding: 24,
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  Notify Clinical Team
                </h3>
                <span style={{ fontSize: 12, color: "var(--text-secondary, #94a3b8)" }}>
                  Hospital In-Charge Supervisory Action
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #94a3b8)",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Clinical Context Snapshot */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 16,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span><strong>Patient:</strong> {patientName}</span>
            <span><strong>Bed:</strong> {incubatorLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#f87171" }}>
            <span><strong>Observation:</strong> {condition}</span>
            <span><strong>Reading:</strong> {vitalType ? `${vitalType}: ${vitalValue}` : vitalValue}</span>
          </div>
        </div>

        {/* Clinical Recipients Overview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {/* Attending Doctor */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "rgba(14, 165, 233, 0.06)",
              border: "1px solid rgba(14, 165, 233, 0.2)",
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8" }}>
                👨‍⚕️ Attending: {doctorName}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary, #94a3b8)" }}>
                {doctorPhone ? `WhatsApp: ${doctorPhone}` : "⚠️ No phone number registered"}
              </div>
            </div>
            {docWaLink && (
              <a
                href={docWaLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11.5,
                  padding: "6px 12px",
                  color: "#ffffff",
                  background: "#10b981",
                  textDecoration: "none",
                  fontWeight: 600,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
                }}
              >
                💬 Chat Doctor
              </a>
            )}
          </div>

          {/* On-Duty Nurse */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              background: "rgba(16, 185, 129, 0.06)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>
                👩‍⚕️ Duty Nurse: {nurseName}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary, #94a3b8)" }}>
                {nursePhone ? `WhatsApp: ${nursePhone}` : "⚠️ No phone number registered"}
              </div>
            </div>
            {nurseWaLink && (
              <a
                href={nurseWaLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11.5,
                  padding: "6px 12px",
                  color: "#ffffff",
                  background: "#10b981",
                  textDecoration: "none",
                  fontWeight: 600,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
                }}
              >
                💬 Chat Nurse
              </a>
            )}
          </div>
        </div>

        {/* Collapsible Message Preview */}
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #94a3b8)",
              fontSize: 11.5,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "underline",
            }}
          >
            {showPreview ? "Hide Message Preview ▲" : "Preview Clinical Advisory Text ▼"}
          </button>
          {showPreview && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "rgba(0, 0, 0, 0.3)",
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "monospace",
                color: "#94a3b8",
                whiteSpace: "pre-line",
                lineHeight: 1.4,
                border: "1px solid rgba(255, 255, 255, 0.06)",
                maxHeight: 140,
                overflowY: "auto",
              }}
            >
              {formatDoctorClinicalAdvisory({
                patientName,
                incubatorLabel,
                condition,
                type: alertData.type,
                value: vitalValue,
                assignedDoctorName: doctorName,
                timestamp,
                deviceId: alertData.device_id,
                escalated: alertData.escalated,
              })}
            </div>
          )}
        </div>

        {/* Success or Action Banner */}
        {dispatchResult && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.12)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontSize: 12,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              ✓ WhatsApp Advisory Launched!
            </div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              {dispatchResult.message}
            </div>
          </div>
        )}

        {/* Primary Unified Action Button */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={handleSimultaneousDispatch}
            disabled={dispatching || (!doctorPhone && !nursePhone)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "11px 16px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: dispatching || (!doctorPhone && !nursePhone) ? "not-allowed" : "pointer",
              opacity: dispatching || (!doctorPhone && !nursePhone) ? 0.6 : 1,
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            {dispatching
              ? "Launching WhatsApp..."
              : "Launch WhatsApp for Both (Doctor & Nurse)"}
          </button>

          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary, #64748b)",
              textAlign: "center",
              marginTop: 2,
            }}
          >
            Opens WhatsApp Web with pre-formatted clinical text & logs notification in NeoCare.
          </div>
        </div>
      </div>
    </div>
  );
}

