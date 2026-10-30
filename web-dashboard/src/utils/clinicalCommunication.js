import axiosClient from "../api/axiosClient";

/**
 * Clinical Communication Standards for NeoCare NICU Monitoring
 *
 * Provides gentle, respectful, and clinically rigorous message formatting
 * for clinicians, hospital supervisors, and patient families.
 * Follows healthcare communication guidelines:
 * - Clear identification of patient and bedside location
 * - Objective parameter readings with context
 * - Calm, professional, and non-alarmist terminology
 * - Courteous greetings and structured action recommendations
 */

/**
 * Normalizes doctor name with exactly one 'Dr.' prefix.
 * If the doctor already input their name with 'Dr.' or 'Dr', another 'Dr.' is NOT added.
 * If multiple consecutive 'Dr.' prefixes exist (e.g. 'Dr. Dr.'), it collapses them to a single 'Dr.'.
 * If no 'Dr.' prefix is present, it is added.
 *
 * @param {string} name
 * @returns {string} Formatted doctor name, e.g. "Dr. PJ"
 */
export function formatDoctorName(name) {
  if (!name) return "";
  const trimmed = String(name).trim();
  const stripped = trimmed.replace(/^(\s*dr\.?\s*)+/i, "").trim();
  if (!stripped) return trimmed;
  return `Dr. ${stripped}`;
}

/**
 * Returns the canonical public domain for clinical portals,
 * ensuring desktop clients (file://) and localhost use the live public URL.
 */
export function getPublicWebOrigin() {
  if (typeof window !== "undefined") {
    const isFileOrDesktop =
      window.location.protocol === "file:" ||
      Boolean(window.electron) ||
      navigator.userAgent.toLowerCase().includes("electron");

    if (!isFileOrDesktop && window.location.origin && !window.location.origin.includes("localhost") && !window.location.origin.includes("file:")) {
      return window.location.origin.replace(/\/+$/, "");
    }
  }
  return "https://neocaretelemetry.netlify.app";
}

/**
 * Formats a courteous, professional clinical advisory for attending physicians.
 *
 * @param {Object} params
 * @param {string} params.patientName
 * @param {string} params.incubatorLabel
 * @param {string} params.condition
 * @param {string} params.type
 * @param {string|number} params.value
 * @param {string} [params.assignedDoctorName]
 * @param {string|Date} [params.timestamp]
 * @param {string} [params.deviceId]
 * @param {boolean} [params.escalated]
 * @returns {string} Formatted WhatsApp / SMS message text
 */
export function formatDoctorClinicalAdvisory(params = {}) {
  try {
    const {
      patientName = "Admitted Infant",
      incubatorLabel = "NICU Bed",
      condition = "Physiological parameter observation",
      type = "Telemetry Reading",
      value = "N/A",
      assignedDoctorName = "Doctor",
      timestamp = null,
      deviceId = null,
      escalated = false,
    } = params;

    const docStr = typeof assignedDoctorName === "object" && assignedDoctorName
      ? (assignedDoctorName.name || "Doctor")
      : String(assignedDoctorName || "Doctor");
    const formattedDoctor = formatDoctorName(docStr);

    let timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      if (timestamp) {
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
      }
    } catch {}

    const cleanType = String(type || "Telemetry");
    const paramLabel = cleanType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const header = escalated
      ? "📋 NeoCare Clinical Advisory • Supervisor Notification"
      : "🩺 NeoCare Clinical Advisory • Neonatal Care";

    const recommendation = escalated
      ? "An ongoing parameter variance has elapsed without acknowledgement. A bedside assessment or nursing consultation is requested at your earliest convenience."
      : "A bedside evaluation or telemetry chart review is recommended at your earliest clinical convenience.";

    const origin = getPublicWebOrigin();
    const bedUrl = deviceId ? `${origin}/dashboard?device=${deviceId}` : `${origin}/dashboard`;

    return (
      `${header}\n\n` +
      `Dear ${formattedDoctor},\n\n` +
      `This is an automated advisory regarding your admitted patient:\n\n` +
      `• Patient: ${patientName}\n` +
      `• Bed Location: ${incubatorLabel}\n` +
      `• Observation: ${condition}\n` +
      `• Recorded Value: ${paramLabel}: ${value}\n` +
      `• Timestamp: ${timeStr}\n\n` +
      `${recommendation}\n\n` +
      `🔗 Live Bed Telemetry: ${bedUrl}\n\n` +
      `NeoCare Clinical Monitoring Services`
    );
  } catch (err) {
    console.error("[formatDoctorClinicalAdvisory] Fallback triggered:", err);
    return `🩺 NeoCare Clinical Advisory\n\nPatient: ${params?.patientName || "Admitted Infant"}\nBed: ${params?.incubatorLabel || "NICU Bed"}\nObservation: ${params?.condition || "Telemetry notice"}\nValue: ${params?.value || "N/A"}`;
  }
}

/**
 * Formats a courteous, structured clinical advisory for bedside duty nurses.
 *
 * @param {Object} params
 * @returns {string} Formatted WhatsApp / SMS message text
 */
export function formatNurseClinicalAdvisory(params = {}) {
  try {
    const {
      patientName = "Admitted Infant",
      incubatorLabel = "NICU Bed",
      condition = "Physiological parameter observation",
      type = "Telemetry Reading",
      value = "N/A",
      nurseName = "Duty Nurse",
      timestamp = null,
      deviceId = null,
      escalated = false,
    } = params;

    const nurseStr = typeof nurseName === "object" && nurseName
      ? (nurseName.name || "Duty Nurse")
      : String(nurseName || "Duty Nurse");
    const formattedNurse = nurseStr.startsWith("Nurse") ? nurseStr : `Nurse ${nurseStr}`;

    let timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    try {
      if (timestamp) {
        const d = new Date(timestamp);
        if (!isNaN(d.getTime())) {
          timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
      }
    } catch {}

    const cleanType = String(type || "Telemetry");
    const paramLabel = cleanType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const header = escalated
      ? "📋 NeoCare Bedside Advisory • Supervisor Notice"
      : "🩺 NeoCare Bedside Advisory • Nursing Station";

    const recommendation = escalated
      ? "An ongoing parameter variance has elapsed without acknowledgement. Immediate bedside verification of sensor placement, airway, and vitals is requested."
      : "Immediate bedside verification of infant comfort, sensor placement, and physiological status is requested.";

    const origin = getPublicWebOrigin();
    const bedUrl = deviceId ? `${origin}/dashboard?device=${deviceId}` : `${origin}/dashboard`;

    return (
      `${header}\n\n` +
      `Dear ${formattedNurse},\n\n` +
      `This is an automated advisory regarding patient in ${incubatorLabel}:\n\n` +
      `• Patient: ${patientName}\n` +
      `• Bed Location: ${incubatorLabel}\n` +
      `• Observation: ${condition}\n` +
      `• Recorded Value: ${paramLabel}: ${value}\n` +
      `• Timestamp: ${timeStr}\n\n` +
      `${recommendation}\n\n` +
      `🔗 Live Bed Telemetry: ${bedUrl}\n\n` +
      `NeoCare Clinical Monitoring Services`
    );
  } catch (err) {
    console.error("[formatNurseClinicalAdvisory] Fallback triggered:", err);
    return `🩺 NeoCare Bedside Advisory\n\nPatient: ${params?.patientName || "Admitted Infant"}\nBed: ${params?.incubatorLabel || "NICU Bed"}\nObservation: ${params?.condition || "Telemetry notice"}\nValue: ${params?.value || "N/A"}`;
  }
}

/**
 * Formats a warm, reassuring, and dignified update for parents & guardians.
 *
 * @param {Object} params
 * @param {string} params.patientName
 * @param {string} [params.guardianName]
 * @param {string} [params.incubatorLabel]
 * @param {string} [params.accessCode]
 * @param {string} [params.magicLink]
 * @returns {string} Formatted WhatsApp message text
 */
export function formatGuardianCareUpdate({
  patientName = "Baby",
  guardianName = "",
  incubatorLabel = "Bedside Monitor",
  accessCode = "",
  magicLink = "",
}) {
  const greeting = guardianName ? `Dear ${guardianName},` : "Dear Parent / Guardian,";
  const origin = getPublicWebOrigin();
  const cleanMagicLink = magicLink && !magicLink.includes("file:") && !magicLink.includes("localhost")
    ? magicLink.replace(/\/+$/, "")
    : null;
  const portalUrl = cleanMagicLink || (accessCode ? `${origin}/patient/access?code=${accessCode}` : `${origin}/patient/access`);

  return (
    `🌸 NeoCare Neonatal Care • Family Portal\n\n` +
    `${greeting}\n\n` +
    `Warm greetings from the NICU clinical team caring for Baby ${patientName}.\n\n` +
    `Our medical and nursing staff are attending bedside and managing your little one's continuous care in ${incubatorLabel}.\n\n` +
    `You can securely stay close to your baby's live parameters and daily progress anytime via our secure Family Portal:\n\n` +
    `🔗 Live Portal: ${portalUrl}\n` +
    (accessCode ? `🔑 Access Code: ${accessCode}\n\n` : "\n") +
    `Please feel welcome to reach out to our nursing station whenever you wish.\n\n` +
    `With warmth and care,\n` +
    `NeoCare Neonatal Care Team`
  );
}

/**
 * Returns humanized, gentle clinical status badges and descriptions.
 *
 * @param {string} severity "critical" | "warning" | "info"
 * @param {boolean} [escalated=false]
 * @returns {{ label: string, shortLabel: string, color: string, bg: string, border: string }}
 */
export function getClinicalSeverityMeta(severity, escalated = false) {
  if (escalated) {
    return {
      label: "SUPERVISOR ADVISORY",
      shortLabel: "SUPERVISOR",
      color: "#b91c1c",
      bg: "rgba(185, 28, 28, 0.08)",
      border: "rgba(185, 28, 28, 0.35)",
    };
  }

  if (severity === "critical") {
    return {
      label: "CLINICAL PRIORITY",
      shortLabel: "PRIORITY",
      color: "#c2410c",
      bg: "rgba(194, 65, 12, 0.08)",
      border: "rgba(194, 65, 12, 0.35)",
    };
  }

  if (severity === "warning") {
    return {
      label: "CLINICAL NOTICE",
      shortLabel: "NOTICE",
      color: "#b45309",
      bg: "rgba(180, 83, 9, 0.08)",
      border: "rgba(180, 83, 9, 0.35)",
    };
  }

  return {
    label: "OBSERVATION",
    shortLabel: "INFO",
    color: "#0369a1",
    bg: "rgba(3, 105, 161, 0.08)",
    border: "rgba(3, 105, 161, 0.35)",
  };
}

/**
 * Cleans phone number and formats it for WhatsApp URL (wa.me)
 * Ensures international dialing format (e.g. Bangladesh numbers starting with 01 become 8801...)
 *
 * @param {string} phone
 * @returns {string} Digits only
 */
export function cleanPhoneNumberForWhatsApp(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/[^0-9]/g, "");
  // If 11 digits starting with 01 (standard Bangladesh mobile prefix), prepend 88
  if (digits.length === 11 && digits.startsWith("01")) {
    digits = "88" + digits;
  }
  return digits;
}

/**
 * Extracts and normalizes clinical team contacts (assigned doctor & duty nurse)
 * from any alert, notification, or telemetry object.
 *
 * @param {Object} alertData
 * @returns {Object} Normalized contacts and clinical details
 */
export function extractClinicalTeamContacts(alertData = {}) {
  const safe = alertData || {};
  const patientName = String(
    safe.patientName ||
    safe.metadata?.patientName ||
    safe.patientId?.name ||
    "Admitted Infant"
  );

  const incubatorLabel = String(
    safe.incubatorLabel ||
    safe.metadata?.incubatorLabel ||
    safe.device_id ||
    safe.metadata?.deviceId ||
    safe.reviewEntityId ||
    "NICU Bed"
  );

  const condition = String(
    safe.condition ||
    safe.metadata?.condition ||
    (safe.type ? String(safe.type).replace(/_/g, " ") : "Parameter variance")
  );

  const type = String(safe.type || safe.metadata?.type || "Telemetry");
  const value = safe.value ?? safe.metadata?.value ?? "--";
  const timestamp = safe.timestamp || safe.createdAt || new Date();
  const deviceId = safe.device_id || safe.metadata?.deviceId || null;
  const escalated = Boolean(safe.escalated || safe.metadata?.escalated);
  const alertId = safe._id || safe.id || safe.alertId || safe.metadata?.alertId || null;

  // Extract Attending Doctor
  let docName = "";
  if (typeof safe.assignedDoctorName === "string" && safe.assignedDoctorName) {
    docName = safe.assignedDoctorName;
  } else if (safe.assignedDoctor?.name) {
    docName = safe.assignedDoctor.name;
  } else if (safe.metadata?.doctorName) {
    docName = safe.metadata.doctorName;
  } else if (safe.patientId?.assignedDoctor?.name) {
    docName = safe.patientId.assignedDoctor.name;
  }
  const formattedDoctor = docName
    ? formatDoctorName(docName)
    : "Assigned Attending";

  let docPhone = "";
  if (safe.assignedDoctorPhone) {
    docPhone = safe.assignedDoctorPhone;
  } else if (safe.assignedDoctor?.phone) {
    docPhone = safe.assignedDoctor.phone;
  } else if (safe.metadata?.doctorPhone) {
    docPhone = safe.metadata.doctorPhone;
  } else if (safe.patientId?.assignedDoctor?.phone) {
    docPhone = safe.patientId.assignedDoctor.phone;
  }

  // Extract Duty Nurse
  let nurseName = "";
  if (typeof safe.dutyNurseName === "string" && safe.dutyNurseName) {
    nurseName = safe.dutyNurseName;
  } else if (safe.dutyNurse?.name) {
    nurseName = safe.dutyNurse.name;
  } else if (safe.metadata?.nurseName) {
    nurseName = safe.metadata.nurseName;
  } else if (safe.wardId?.dutyNurse?.name) {
    nurseName = safe.wardId.dutyNurse.name;
  }
  const formattedNurse = nurseName || "Duty Nurse";

  let nursePhone = "";
  if (safe.dutyNursePhone) {
    nursePhone = safe.dutyNursePhone;
  } else if (safe.dutyNurse?.phone) {
    nursePhone = safe.dutyNurse.phone;
  } else if (safe.metadata?.nursePhone) {
    nursePhone = safe.metadata.nursePhone;
  } else if (safe.wardId?.dutyNurse?.phone) {
    nursePhone = safe.wardId.dutyNurse.phone;
  }

  return {
    alertId,
    patientName,
    incubatorLabel,
    condition,
    type,
    value,
    timestamp,
    deviceId,
    escalated,
    doctorName: formattedDoctor,
    doctorPhone: docPhone,
    hasDoctor: Boolean(docPhone && cleanPhoneNumberForWhatsApp(docPhone)),
    nurseName: formattedNurse,
    nursePhone,
    hasNurse: Boolean(nursePhone && cleanPhoneNumberForWhatsApp(nursePhone)),
  };
}

/**
 * Builds direct WhatsApp Web URL with pre-filled clinical advisory for Attending Doctor.
 */
export function buildDoctorWhatsAppUrl(alertData) {
  if (!alertData) return null;
  const contacts = extractClinicalTeamContacts(alertData);
  const cleanPhone = cleanPhoneNumberForWhatsApp(contacts.doctorPhone);
  if (!cleanPhone) return null;

  try {
    const text = formatDoctorClinicalAdvisory({
      patientName: contacts.patientName,
      incubatorLabel: contacts.incubatorLabel,
      condition: contacts.condition,
      type: contacts.type,
      value: contacts.value,
      assignedDoctorName: contacts.doctorName,
      timestamp: contacts.timestamp,
      deviceId: contacts.deviceId,
      escalated: contacts.escalated,
    });
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  } catch (err) {
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`NeoCare Clinical Advisory: ${contacts.patientName} (${contacts.incubatorLabel}) - ${contacts.condition}`)}`;
  }
}

/**
 * Builds direct WhatsApp Web URL with pre-filled bedside advisory for Duty Nurse.
 */
export function buildNurseWhatsAppUrl(alertData) {
  if (!alertData) return null;
  const contacts = extractClinicalTeamContacts(alertData);
  const cleanPhone = cleanPhoneNumberForWhatsApp(contacts.nursePhone);
  if (!cleanPhone) return null;

  try {
    const text = formatNurseClinicalAdvisory({
      patientName: contacts.patientName,
      incubatorLabel: contacts.incubatorLabel,
      condition: contacts.condition,
      type: contacts.type,
      value: contacts.value,
      nurseName: contacts.nurseName,
      timestamp: contacts.timestamp,
      deviceId: contacts.deviceId,
      escalated: contacts.escalated,
    });
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  } catch (err) {
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`NeoCare Bedside Advisory: ${contacts.patientName} (${contacts.incubatorLabel}) - ${contacts.condition}`)}`;
  }
}

/**
 * Direct 1-Click WhatsApp Dispatch to Attending Doctor.
 * Opens WhatsApp Web immediately with pre-filled clinical advisory and records supervisory audit log.
 */
export async function directNotifyDoctor(alertData) {
  const url = buildDoctorWhatsAppUrl(alertData);
  if (!url) {
    throw new Error("No contact number registered for attending doctor.");
  }

  // 1. Immediately launch WhatsApp Web (zero delay)
  window.open(url, "_blank");

  // 2. Background audit trail
  const contacts = extractClinicalTeamContacts(alertData);
  if (contacts.alertId) {
    try {
      await axiosClient.post(`/alerts/${contacts.alertId}/notify-team`);
    } catch (err) {
      console.warn("[directNotifyDoctor] Audit trail recording failed (message still sent):", err);
    }
  }

  return { success: true, target: "doctor", phone: contacts.doctorPhone };
}

/**
 * Direct 1-Click WhatsApp Dispatch to Bedside Nurse.
 * Opens WhatsApp Web immediately with pre-filled bedside advisory and records supervisory audit log.
 */
export async function directNotifyNurse(alertData) {
  const url = buildNurseWhatsAppUrl(alertData);
  if (!url) {
    throw new Error("No contact number registered for bedside duty nurse.");
  }

  // 1. Immediately launch WhatsApp Web (zero delay)
  window.open(url, "_blank");

  // 2. Background audit trail
  const contacts = extractClinicalTeamContacts(alertData);
  if (contacts.alertId) {
    try {
      await axiosClient.post(`/alerts/${contacts.alertId}/notify-team`);
    } catch (err) {
      console.warn("[directNotifyNurse] Audit trail recording failed (message still sent):", err);
    }
  }

  return { success: true, target: "nurse", phone: contacts.nursePhone };
}

/**
 * Direct 1-Click WhatsApp Dispatch to BOTH Doctor and Nurse simultaneously.
 */
export async function directNotifyBoth(alertData) {
  const docUrl = buildDoctorWhatsAppUrl(alertData);
  const nurseUrl = buildNurseWhatsAppUrl(alertData);

  if (!docUrl && !nurseUrl) {
    throw new Error("No contact numbers registered for either doctor or nurse.");
  }

  if (docUrl) {
    window.open(docUrl, "_blank");
  }

  if (nurseUrl) {
    // 350ms delay to prevent browser pop-up blocker from suppressing the second tab
    setTimeout(() => {
      window.open(nurseUrl, "_blank");
    }, 350);
  }

  // Background audit trail
  const contacts = extractClinicalTeamContacts(alertData);
  if (contacts.alertId) {
    try {
      await axiosClient.post(`/alerts/${contacts.alertId}/notify-team`);
    } catch (err) {
      console.warn("[directNotifyBoth] Audit trail recording failed:", err);
    }
  }

  return { success: true, target: "both" };
}
