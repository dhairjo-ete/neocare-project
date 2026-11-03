const Alert = require("../models/Alert");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Incubator = require("../models/Incubator");
const User = require("../models/User");
const { sendPushAlert } = require("./fcm");
const { emitNotification, emitDataChange } = require("../sockets/socket");
const { notifyClinicalTeamSimultaneously } = require("./whatsappService");
const { evaluateCriticalAlertWithGemini, generateDeterministicAdvisory } = require("./geminiClinicalAgent");

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
        // Cooldown: configurable throttle per vital type per severity per incubator (defaults to 90 seconds)
        const cooldownSeconds = Number(process.env.ALERT_COOLDOWN_SECONDS) || 90;
        const cooldownMs = cooldownSeconds * 1000;
        const cooldownKey = `cooldown:${key}:${result.severity}`;
        const lastAlertTime = consecutiveAbnormal[cooldownKey];
        if (lastAlertTime && Date.now() - lastAlertTime < cooldownMs) {
          continue; // In cooldown for this specific severity
        }

        // Check if an unacknowledged alert already exists for this incubator and vital type
        let alert = null;
        try {
          alert = await Alert.findOne({
            device_id: reading.device_id,
            type,
            acknowledged: false,
          });
        } catch (dbErr) {
          console.warn("[alertEngine] DB error finding existing alert (continuing):", dbErr.message);
        }

        // If an unacknowledged alert exists:
        // Update its latest reading. If the condition escalates from warning to critical,
        // bypass the cooldown and dispatch immediately.
        if (alert) {
          const previousSeverity = alert.severity;
          alert.value = value;
          alert.timestamp = new Date();
          alert.severity = result.severity;
          alert.condition = result.condition;

          const isEscalating = previousSeverity === "warning" && result.severity === "critical";
          const lastNotified = alert.teamNotifiedAt ? new Date(alert.teamNotifiedAt).getTime() : 0;
          if (!isEscalating && lastNotified && Date.now() - lastNotified < cooldownMs) {
            try { await alert.save(); } catch (e) { /* non-blocking */ }
            continue;
          }
        }

        // 1. Resolve Incubator metadata
        let incubator = null;
        if (reading.incubatorId) {
          try {
            incubator = await Incubator.findById(reading.incubatorId).select("label deviceTopicId wardId hospitalId");
          } catch (e) {
            console.warn("[alertEngine] Failed to populate incubator:", e.message);
          }
        }
        if (!incubator && reading.device_id) {
          try {
            incubator = await Incubator.findOne({
              $or: [{ deviceTopicId: reading.device_id }, { label: reading.device_id }],
            }).select("label deviceTopicId wardId hospitalId");
          } catch (e) {
            console.warn("[alertEngine] Failed to resolve incubator by device_id:", e.message);
          }
        }

        // 2. Resolve Patient (Admitted Infant)
        let patient = null;
        let doctor = null;
        let dutyNurse = null;

        if (reading.patientId) {
          try {
            patient = await Patient.findById(reading.patientId).populate("assignedDoctor assignedNurse", "name phone role");
          } catch (e) {
            console.warn("[alertEngine] Failed to populate patient by reading.patientId:", e.message);
          }
        }

        // If patient not explicitly provided, find active admitted patient in this incubator
        if (!patient && incubator?._id) {
          try {
            patient = await Patient.findOne({ incubatorId: incubator._id, dischargedAt: null })
              .populate("assignedDoctor assignedNurse", "name phone role");
          } catch (e) {
            console.warn("[alertEngine] Failed to resolve active patient for incubator:", e.message);
          }
        }

        if (patient?.assignedDoctor) {
          doctor = patient.assignedDoctor;
        }
        if (patient?.assignedNurse) {
          dutyNurse = patient.assignedNurse;
        }

        // 3. Robust Clinician Fallback: If no assigned doctor/nurse on patient profile, locate duty clinician for this hospital/ward
        const targetHospitalId = reading.hospitalId || incubator?.hospitalId || patient?.hospitalId;
        const targetWardId = reading.wardId || incubator?.wardId;

        if ((!doctor || !doctor.phone) && targetHospitalId) {
          try {
            if (targetWardId) {
              doctor = await User.findOne({
                hospitalId: targetHospitalId,
                role: "doctor",
                wardId: targetWardId,
                isApproved: true,
                phone: { $exists: true, $ne: "" },
              }).select("name phone role");
            }
            if (!doctor) {
              doctor = await User.findOne({
                hospitalId: targetHospitalId,
                role: "doctor",
                isApproved: true,
                phone: { $exists: true, $ne: "" },
              }).select("name phone role");
            }
          } catch (e) {
            console.warn("[alertEngine] Failed to find duty doctor fallback:", e.message);
          }
        }

        if ((!dutyNurse || !dutyNurse.phone) && targetHospitalId) {
          try {
            if (targetWardId) {
              dutyNurse = await User.findOne({
                hospitalId: targetHospitalId,
                role: "nurse",
                wardId: targetWardId,
                isApproved: true,
                phone: { $exists: true, $ne: "" },
              }).select("name phone role");
            }
            if (!dutyNurse) {
              dutyNurse = await User.findOne({
                hospitalId: targetHospitalId,
                role: "nurse",
                isApproved: true,
                phone: { $exists: true, $ne: "" },
              }).select("name phone role");
            }
          } catch (e) {
            console.warn("[alertEngine] Failed to find duty nurse fallback:", e.message);
          }
        }

        const patientName = patient?.name || "Admitted Infant";
        const incubatorLabel = incubator?.label || reading.device_id;
        const doctorName = doctor?.name || "Assigned Attending";
        const doctorPhone = doctor?.phone || "";
        const nurseName = dutyNurse?.name || "Duty Nurse";
        const nursePhone = dutyNurse?.phone || "";

        // 4. Create or Update Alert Document with rich clinical context
        try {
          if (!alert) {
            alert = await Alert.create({
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
              hospitalId: targetHospitalId || null,
              wardId: targetWardId || null,
              incubatorId: incubator?._id || reading.incubatorId || null,
              patientId: patient?._id || reading.patientId || null,
            });
          } else {
            alert.patientName = patientName;
            alert.incubatorLabel = incubatorLabel;
            alert.assignedDoctorName = doctorName;
            alert.assignedDoctorPhone = doctorPhone;
            alert.dutyNurseName = nurseName;
            alert.dutyNursePhone = nursePhone;
            if (targetHospitalId && !alert.hospitalId) alert.hospitalId = targetHospitalId;
            if (targetWardId && !alert.wardId) alert.wardId = targetWardId;
            if (incubator?._id && !alert.incubatorId) alert.incubatorId = incubator._id;
            if (patient?._id && !alert.patientId) alert.patientId = patient._id;
            await alert.save();
          }
        } catch (dbErr) {
          console.warn("[alertEngine] DB error saving alert (proceeding to dispatch):", dbErr.message);
          // Create a minimal in-memory alert object so dispatch still works
          if (!alert) {
            alert = { _id: null, device_id: reading.device_id, type, value, severity: result.severity, condition: result.condition, toObject: () => ({ device_id: reading.device_id, type, value, severity: result.severity, condition: result.condition, patientName, incubatorLabel }) };
          }
        }

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
        try {
          const alertPayload = typeof alert.toObject === "function" ? alert.toObject() : alert;
          if (reading.hospitalId) {
            io.to(`room:hospital:${reading.hospitalId}`).emit("alert:new", alertPayload);
            io.to("room:system_admin").emit("alert:new", alertPayload);
          } else {
            io.emit("alert:new", alertPayload);
          }
        } catch (socketErr) {
          console.warn("[alertEngine] Socket emit error:", socketErr.message);
        }

        // 4. Send Mobile Push (FCM)
        try {
          await sendPushAlert(alert);
        } catch (pushErr) {
          // Non-blocking
        }

        // 5. Tier 3: Automated WhatsApp / SMS Alert Dispatch via Gemini
        // Dispatches for EVERY clinical alert (critical priorities and clinical warnings)
        if (result.severity === "critical" || result.severity === "warning") {
          let docWhatsappText = "";
          let nurseWhatsappText = "";

          // Step A: Try AI-powered advisory generation
          try {
            const aiEvaluation = await evaluateCriticalAlertWithGemini({
              patient,
              incubator,
              doctor,
              dutyNurse,
              reading,
              type,
              value,
              result,
            });

            docWhatsappText = aiEvaluation.doctorAdvisory || "";
            nurseWhatsappText = aiEvaluation.nurseAdvisory || "";

            // Persist AI clinical assessment to alert document
            try {
              if (alert._id) {
                alert.aiAssessment = {
                  analyzed: true,
                  model: aiEvaluation.model || "gemini-3.6-flash",
                  isArtifact: Boolean(aiEvaluation.isArtifact),
                  clinicalImpression: aiEvaluation.clinicalImpression || "",
                  confidence: aiEvaluation.confidence || 0.95,
                  suggestedOrders: aiEvaluation.suggestedOrders || [],
                  evaluatedAt: new Date(),
                };
                await alert.save();
              }
            } catch (saveErr) {
              console.warn("[alertEngine] Failed to persist AI assessment (non-blocking):", saveErr.message);
            }
          } catch (aiErr) {
            console.error("[alertEngine] AI evaluation error:", aiErr.message);
          }

          // Step B: CRITICAL SAFETY NET — If AI advisory is empty/failed, use deterministic fallback
          // This guarantees the doctor and nurse ALWAYS receive a message, even if Gemini is down
          if (!docWhatsappText || docWhatsappText.length < 20) {
            console.log("[alertEngine] AI advisory empty/short — activating deterministic fallback for message text");
            const fallback = generateDeterministicAdvisory({
              patient,
              incubatorLabel,
              deviceId: reading.device_id,
              type,
              value,
              condition: result.condition,
              doctorName,
              nurseName,
            });
            docWhatsappText = fallback.doctorAdvisory;
            nurseWhatsappText = fallback.nurseAdvisory;
          }

          console.log("\n================ [CLINICAL ADVISORY - AI AUTOMATED DISPATCH] ================");
          console.log(`Doctor     : ${doctorName} (${doctorPhone || "No phone registered"})`);
          console.log(`Duty Nurse : ${nurseName} (${nursePhone || "No phone registered"})`);
          console.log(`Patient    : ${patientName} (${incubatorLabel})`);
          console.log(`Condition  : ${result.condition} (${type}: ${value})`);
          console.log(`Msg Length : doc=${docWhatsappText.length} nurse=${nurseWhatsappText.length}`);
          console.log(`AI Engine  : ${alert.aiAssessment?.model || "deterministic-fallback"}`);
          console.log("==============================================================================\n");

          // Step C: Dispatch simultaneously to Doctor and Nurse via WhatsApp / SMS Service
          if (doctorPhone || nursePhone) {
            try {
              const dispatchResults = await notifyClinicalTeamSimultaneously({
                doctorPhone,
                doctorName,
                nursePhone,
                nurseName,
                docMessage: docWhatsappText,
                nurseMessage: nurseWhatsappText,
              });

              console.log(`[alertEngine] WhatsApp dispatch results -> Doctor: ${dispatchResults.doctor?.success ? "✓ SENT" : "✗ " + (dispatchResults.doctor?.error || "failed")} | Nurse: ${dispatchResults.nurse?.success ? "✓ SENT" : "✗ " + (dispatchResults.nurse?.error || "failed")}`);

              try {
                if (alert._id) {
                  alert.teamNotifiedAt = new Date();
                  await alert.save();
                  emitDataChange("alert", "notify_team", alert);
                }
              } catch (saveErr) {
                console.warn("[alertEngine] Failed to update teamNotifiedAt (non-blocking):", saveErr.message);
              }
            } catch (teamErr) {
              console.error("[alertEngine] Failed simultaneous WhatsApp dispatch:", teamErr.message);
            }
          } else {
            console.warn(`[alertEngine] ⚠️ No doctor or nurse phone available for ${patientName} (${incubatorLabel}) — WhatsApp dispatch skipped`);
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
          io.to(`room:hospital:${alert.hospitalId}`).emit("alert:escalated", escPayload);
          io.to("room:system_admin").emit("alert:escalated", escPayload);
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

// Reset alerts when patient discharged/admitted, or scenario switched
function resetAlertDebounce(device_id) {
  if (!device_id || device_id === "__all__") {
    for (const key of Object.keys(consecutiveAbnormal)) {
      delete consecutiveAbnormal[key];
    }
    return;
  }
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
