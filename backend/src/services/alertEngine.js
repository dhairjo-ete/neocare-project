const Alert = require("../models/Alert");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Incubator = require("../models/Incubator");
const User = require("../models/User");
const { sendPushAlert } = require("./fcm");
const { emitNotification, emitDataChange } = require("../sockets/socket");
const { notifyClinicalTeamSimultaneously } = require("./whatsappService");

// Require 2 consecutive abnormal readings before firing an alert (debouncing)
const DEBOUNCE_COUNT = 2;

const THRESHOLDS = {
  heart_rate: { low: 100, high: 180, criticalLow: 80, criticalHigh: 200 },
  spo2: { low: 94, criticalLow: 90 },
  temperature: { low: 36.0, high: 37.8, criticalLow: 35.5, criticalHigh: 38.5 },
};

const consecutiveAbnormal = {};

function classify(type, value) {
  const t = THRESHOLDS[type];
  if (type === "spo2") {
    if (value < t.criticalLow) return { severity: "critical", condition: "Severe Hypoxia (Low SpO2)" };
    if (value < t.low) return { severity: "warning", condition: "Mild Hypoxia Warning" };
    return null;
  }
  if (type === "heart_rate") {
    if (value < t.criticalLow) return { severity: "critical", condition: "Severe Bradycardia (Low HR)" };
    if (value > t.criticalHigh) return { severity: "critical", condition: "Severe Tachycardia (High HR)" };
    if (value < t.low) return { severity: "warning", condition: "Mild Bradycardia Warning" };
    if (value > t.high) return { severity: "warning", condition: "Mild Tachycardia Warning" };
    return null;
  }
  if (type === "temperature") {
    if (value < t.criticalLow) return { severity: "critical", condition: "Severe Hypothermia (Low Temp)" };
    if (value > t.criticalHigh) return { severity: "critical", condition: "High Fever / Hyperthermia" };
    if (value < t.low) return { severity: "warning", condition: "Mild Hypothermia Warning" };
    if (value > t.high) return { severity: "warning", condition: "Elevated Temperature" };
    return null;
  }
  return null;
}

async function checkThresholds(reading, io) {
  const checks = [
    ["heart_rate", reading.heart_rate],
    ["spo2", reading.spo2],
    ["temperature", reading.temperature],
  ];

  for (const [type, value] of checks) {
    if (value === undefined || value === null) continue;

    const key = `${reading.device_id}:${type}`;
    const result = classify(type, value);

    if (result) {
      consecutiveAbnormal[key] = (consecutiveAbnormal[key] || 0) + 1;

      if (consecutiveAbnormal[key] >= DEBOUNCE_COUNT) {
        // Cooldown: 5 minutes per alert type per severity per incubator
        const cooldownKey = `cooldown:${key}:${result.severity}`;
        const lastAlertTime = consecutiveAbnormal[cooldownKey];
        if (lastAlertTime && Date.now() - lastAlertTime < 5 * 60 * 1000) {
          continue; // In cooldown for this specific severity
        }

        // Check if an unacknowledged alert already exists for this incubator and vital type
        const existingAlert = await Alert.findOne({
          device_id: reading.device_id,
          type,
          acknowledged: false,
        });

        if (existingAlert) {
          // If already alarmed at the same severity, update value without flooding the UI with duplicate alerts
          if (existingAlert.severity === result.severity) {
            existingAlert.value = value;
            existingAlert.timestamp = new Date();
            await existingAlert.save();
            continue;
          }
        }

        // Fetch Patient, Doctor, Nurse, and Incubator metadata
        let patient = null;
        let doctor = null;
        let dutyNurse = null;
        let incubator = null;

        if (reading.patientId) {
          try {
            patient = await Patient.findById(reading.patientId).populate("assignedDoctor assignedNurse", "name phone role");
            if (patient?.assignedDoctor) {
              doctor = patient.assignedDoctor;
            }
            if (patient?.assignedNurse) {
              dutyNurse = patient.assignedNurse;
            }
          } catch (e) {
            console.warn("[alertEngine] Failed to populate patient:", e.message);
          }
        }

        if (reading.incubatorId) {
          try {
            incubator = await Incubator.findById(reading.incubatorId).select("label deviceTopicId wardId");
          } catch (e) {
            console.warn("[alertEngine] Failed to populate incubator:", e.message);
          }
        }

        // Locate duty nurse assigned to this ward or hospital
        const targetWardId = reading.wardId || incubator?.wardId;
        if (targetWardId || reading.hospitalId) {
          try {
            if (targetWardId) {
              dutyNurse = await User.findOne({
                hospitalId: reading.hospitalId,
                role: "nurse",
                wardId: targetWardId,
                isApproved: true,
              }).select("name phone role");
            }
            if (!dutyNurse && reading.hospitalId) {
              dutyNurse = await User.findOne({
                hospitalId: reading.hospitalId,
                role: "nurse",
                isApproved: true,
              }).select("name phone role");
            }
          } catch (e) {
            console.warn("[alertEngine] Failed to populate duty nurse:", e.message);
          }
        }

        const patientName = patient?.name || "Admitted Infant";
        const incubatorLabel = incubator?.label || reading.device_id;
        const doctorName = doctor?.name || "Assigned Attending";
        const doctorPhone = doctor?.phone || "";
        const nurseName = dutyNurse?.name || "Duty Nurse";
        const nursePhone = dutyNurse?.phone || "";

        // 1. Create Alert Document with rich clinical context (including both doctor and nurse)
        const alert = await Alert.create({
          device_id: reading.device_id,
          type,
          value,
          severity: result.severity,
          condition: result.condition,
          patientName,
          incubatorLabel,
          assignedDoctorName: doctorName,
          assignedDoctorPhone: doctorPhone,
          dutyNurseName: nurseName,
          dutyNursePhone: nursePhone,
          hospitalId: reading.hospitalId || null,
          wardId: targetWardId || null,
          incubatorId: reading.incubatorId || null,
          patientId: reading.patientId || null,
        });

        // 2. Tier 1: Create in-app Notification for Doctor & Nurse Notification Bar
        try {
          const notif = await Notification.create({
            targetRole: "all",
            targetUserId: null,
            hospitalId: reading.hospitalId || null,
            type: "vital_alert",
            patientId: reading.patientId || null,
            alertId: alert._id,
            severity: result.severity,
            title: `${result.severity === "critical" ? "Clinical Priority" : "Clinical Notice"}: ${patientName} (${incubatorLabel})`,
            message: `Parameter variance noted — ${result.condition} (${type.replace(/_/g, " ")}: ${value}). Bedside review recommended.`,
            reviewEntity: "incubator",
            reviewEntityId: reading.device_id,
            metadata: {
              alertId: alert._id,
              deviceId: reading.device_id,
              incubatorLabel,
              patientName,
              doctorName,
              doctorPhone,
              nurseName,
              nursePhone,
              type,
              value,
              severity: result.severity,
              condition: result.condition,
            },
          });
          emitNotification(notif);
        } catch (nErr) {
          console.warn("[alertEngine] Failed to create Notification record:", nErr.message);
        }

        // 3. Tier 1 & Tier 2: Real-time Socket Emission (for in-app banner & desktop notification)
        const alertPayload = alert.toObject();
        if (reading.hospitalId) {
          io.to(`room:hospital:${reading.hospitalId}`).to("room:system_admin").emit("alert:new", alertPayload);
        } else {
          io.emit("alert:new", alertPayload);
        }

        // 4. Send Mobile Push (FCM)
        await sendPushAlert(alert);

        // 5. Tier 3: Automated WhatsApp / SMS Alert Dispatch for Critical Alarms (Doctor AND Nurse)
        if (result.severity === "critical") {
          const formattedDoc = doctorName ? (doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`) : "Attending Physician";
          const docWhatsappText = `🩺 *NEOCARE CLINICAL ADVISORY • NEONATAL CARE*\n\n` +
            `Dear ${formattedDoc},\n\n` +
            `This is an automated advisory regarding your admitted patient:\n\n` +
            `• Patient: *${patientName}*\n` +
            `• Bed Location: *${incubatorLabel}*\n` +
            `• Observation: *${result.condition}*\n` +
            `• Recorded Value: *${type.replace(/_/g, " ").toUpperCase()}: ${value}*\n` +
            `• Timestamp: ${new Date().toLocaleTimeString()}\n\n` +
            `A bedside evaluation or telemetry chart review is recommended at your earliest clinical convenience.\n\n` +
            `NeoCare Clinical Monitoring Services`;

          const nurseWhatsappText = `🩺 *NEOCARE BEDSIDE ADVISORY • NURSING STATION*\n\n` +
            `Dear Nurse ${nurseName},\n\n` +
            `This is an automated advisory regarding patient in *${incubatorLabel}*:\n\n` +
            `• Patient: *${patientName}*\n` +
            `• Bed Location: *${incubatorLabel}*\n` +
            `• Observation: *${result.condition}*\n` +
            `• Recorded Value: *${type.replace(/_/g, " ").toUpperCase()}: ${value}*\n` +
            `• Timestamp: ${new Date().toLocaleTimeString()}\n\n` +
            `Immediate bedside assessment of infant comfort, sensor placement, and vitals is requested.\n\n` +
            `NeoCare Clinical Monitoring Services`;

          console.log("\n================ [CLINICAL ADVISORY - AUTOMATED DISPATCH] ================");
          console.log(`Doctor     : ${doctorName} (${doctorPhone || "No phone registered"})`);
          console.log(`Duty Nurse : ${nurseName} (${nursePhone || "No phone registered"})`);
          console.log(`Patient    : ${patientName} (${incubatorLabel})`);
          console.log(`Condition  : ${result.condition} (${type}: ${value})`);
          console.log("==========================================================================\n");

          // Dispatch simultaneously to Doctor and Nurse via WhatsApp Service
          try {
            await notifyClinicalTeamSimultaneously({
              doctorPhone,
              doctorName,
              nursePhone,
              nurseName,
              docMessage: docWhatsappText,
              nurseMessage: nurseWhatsappText,
            });
          } catch (teamErr) {
            console.error("[alertEngine] Failed simultaneous WhatsApp dispatch:", teamErr.message);
          }
        }

        consecutiveAbnormal[cooldownKey] = Date.now();
        consecutiveAbnormal[key] = 0; // reset counter after firing
      }
    } else {
      consecutiveAbnormal[key] = 0; // reset streak when normal
      // Do not delete cooldownKey here — cooldown persists for its configured duration
      // to avoid rapid alarm re-triggering caused by physiological baseline fluctuation
    }
  }
}

// Tier 4: Background Escalation Daemon for Unattended Critical Alarms (>60 seconds)
let escalationIntervalId = null;

function startEscalationMonitor(io) {
  if (escalationIntervalId) return;

  escalationIntervalId = setInterval(async () => {
    try {
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);

      // Find critical alerts unacknowledged for >60s that haven't been escalated yet
      const unattendedAlerts = await Alert.find({
        severity: "critical",
        acknowledged: false,
        escalated: false,
        createdAt: { $lte: sixtySecondsAgo },
      }).limit(10);

      for (const alert of unattendedAlerts) {
        alert.escalated = true;
        alert.escalatedAt = new Date();
        await alert.save();

        console.log(`[ESCALATION] Alert ${alert._id} (${alert.condition}) UNATTENDED >60s. Escalating to Hospital In-Charge.`);

        // Create Escalation Notification targeted to Hospital In-Charge and Ward Staff
        const escNotif = await Notification.create({
          targetRole: "hospital_admin",
          hospitalId: alert.hospitalId,
          type: "alert_escalation",
          patientId: alert.patientId,
          alertId: alert._id,
          severity: "critical",
          title: `Supervisor Advisory: ${alert.patientName || "Infant"} (${alert.incubatorLabel || alert.device_id})`,
          message: `Clinical event unacknowledged for >60s — ${alert.condition} (${alert.type}: ${alert.value}). Supervisory review requested.`,
          reviewEntity: "incubator",
          reviewEntityId: alert.device_id,
          metadata: {
            alertId: alert._id,
            deviceId: alert.device_id,
            incubatorLabel: alert.incubatorLabel,
            patientName: alert.patientName,
            type: alert.type,
            value: alert.value,
            condition: alert.condition,
            escalated: true,
          },
        });
        emitNotification(escNotif);

        // Broadcast over Socket.io
        const escPayload = alert.toObject();
        if (alert.hospitalId) {
          io.to(`room:hospital:${alert.hospitalId}`).to("room:system_admin").emit("alert:escalated", escPayload);
        } else {
          io.emit("alert:escalated", escPayload);
        }

        // Re-dispatch emergency push notification with high priority
        await sendPushAlert({
          ...escPayload,
          severity: "critical",
          condition: `[SUPERVISOR ADVISORY] ${alert.condition}`,
        });
      }
    } catch (err) {
      console.error("[alertEngine] Escalation monitor check error:", err.message);
    }
  }, 15000); // Check every 15 seconds
}

// Reset alerts when patient discharged/admitted
function resetAlertDebounce(device_id) {
  for (const key of Object.keys(consecutiveAbnormal)) {
    if (key.startsWith(device_id + ":") || key.startsWith("cooldown:" + device_id + ":")) {
      delete consecutiveAbnormal[key];
    }
  }
}

// When a patient leaves (discharge), their open alerts are closed
async function closeAlertsForPatient(patientId, hospitalId) {
  if (!patientId) return 0;
  const result = await Alert.updateMany(
    { patientId, acknowledged: false },
    { acknowledged: true, acknowledgedAt: new Date() }
  );
  if (result.modifiedCount > 0) {
    emitDataChange("alert", "close_patient", { patientId: String(patientId), hospitalId: hospitalId || null }, hospitalId);
  }
  return result.modifiedCount || 0;
}

module.exports = {
  checkThresholds,
  resetAlertDebounce,
  closeAlertsForPatient,
  startEscalationMonitor,
};
