const Alert = require("../models/Alert");
const Patient = require("../models/Patient");
const User = require("../models/User");
const { notifyClinicalTeamSimultaneously } = require("../services/whatsappService");

async function getAlerts(req, res) {
  const { deviceId, acknowledged, patientId, from, to, limit } = req.query;
  const query = {};

  // Hospital scoping: system_admin can optionally filter by hospitalId via query param;
  // all other roles are strictly restricted to their own hospital's alerts.
  if (req.user.role === "system_admin") {
    if (req.query.hospitalId) query.hospitalId = req.query.hospitalId;
  } else {
    if (!req.user.hospitalId) return res.status(403).json({ error: "No hospital assigned" });
    query.hospitalId = req.user.hospitalId;
  }

  if (deviceId) query.device_id = deviceId;
  if (acknowledged !== undefined) query.acknowledged = acknowledged === "true";

  // Patient scoping and matching
  if (patientId) {
    const mongoose = require("mongoose");
    if (mongoose.isValidObjectId(patientId)) {
      try {
        const patient = await Patient.findById(patientId);
        if (patient) {
          const patIdObj = new mongoose.Types.ObjectId(patientId);
          const patientConditions = [{ patientId: patIdObj }];

          // Also match alerts on the patient's incubator on or after admission date
          if (patient.incubatorId) {
            const incCondition = { incubatorId: patient.incubatorId };
            const admitDate = patient.admittedAt || patient.createdAt;
            if (admitDate) {
              incCondition.timestamp = { $gte: new Date(admitDate) };
              if (patient.dischargedAt) {
                incCondition.timestamp.$lte = new Date(patient.dischargedAt);
              }
            }
            patientConditions.push(incCondition);
          }
          query.$or = patientConditions;
        } else {
          query.patientId = patientId;
        }
      } catch {
        query.patientId = patientId;
      }
    }
  }

  // Date range filtering (e.g. filtered after admission date, or specific day)
  if (from || to) {
    const dateQuery = {};
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) dateQuery.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) dateQuery.$lte = toDate;
    }
    if (Object.keys(dateQuery).length > 0) {
      if (query.timestamp) {
        query.timestamp = { ...query.timestamp, ...dateQuery };
      } else {
        query.timestamp = dateQuery;
      }
    }
  }

  const queryLimit = Math.min(parseInt(limit, 10) || 100, 500);
  const alerts = await Alert.find(query)
    .populate("acknowledgedBy", "name role")
    .sort({ timestamp: -1 })
    .limit(queryLimit);
  res.json(alerts);
}

async function acknowledgeAlert(req, res) {
  const { id } = req.params;
  if (!require("mongoose").isValidObjectId(id)) return res.status(400).json({ error: "Invalid alert id" });
  const alert = await Alert.findById(id);
  if (!alert) return res.status(404).json({ error: "Alert not found" });

  // #6 FIX: Ensure the user belongs to the same hospital as the alert (unless system_admin)
  if (req.user.role !== "system_admin" && String(alert.hospitalId) !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Access denied: Alert belongs to another hospital facility." });
  }

  // OPTION B: Ward-Level Duty Guard
  // Only clinicians assigned to this NICU Ward, the patient's primary doctor/nurse, or hospital administrators can acknowledge.
  if (req.user.role === "doctor" || req.user.role === "nurse") {
    let effectiveWardId = alert.wardId;
    let assignedDoctorId = null;
    let assignedNurseId = null;

    if (alert.patientId) {
      try {
        const patient = await Patient.findById(alert.patientId).select("wardId assignedDoctor assignedNurse incubatorId");
        if (patient) {
          if (!effectiveWardId && patient.wardId) effectiveWardId = patient.wardId;
          assignedDoctorId = patient.assignedDoctor;
          assignedNurseId = patient.assignedNurse;
        }
      } catch {}
    }

    if (!effectiveWardId && alert.incubatorId) {
      try {
        const Incubator = require("../models/Incubator");
        const inc = await Incubator.findById(alert.incubatorId).select("wardId");
        if (inc?.wardId) effectiveWardId = inc.wardId;
      } catch {}
    }

    const isAssignedDoctor = assignedDoctorId && String(assignedDoctorId) === String(req.user.id);
    const isAssignedNurse = assignedNurseId && String(assignedNurseId) === String(req.user.id);
    const isWardDutyClinician = effectiveWardId && req.user.wardId && String(effectiveWardId) === String(req.user.wardId);

    if (!isAssignedDoctor && !isAssignedNurse && !isWardDutyClinician) {
      if (!req.user.wardId) {
        return res.status(403).json({
          error: "Clinical Governance Restriction: Unassigned clinical staff cannot acknowledge patient alerts. You must be assigned to duty in this NICU ward or assigned to the patient to acknowledge.",
        });
      } else {
        return res.status(403).json({
          error: "Clinical Governance Restriction: You are on duty in a different NICU ward. Only clinicians on duty in this NICU ward, the primary care team, or Hospital In-Charge can acknowledge this alert.",
        });
      }
    }
  }

  // Already acknowledged: keep the first acknowledger's name and time.
  if (alert.acknowledged) return res.json(alert);

  // Atomic update so two nurses acknowledging at once cannot overwrite each other
  const updated = await Alert.findOneAndUpdate(
    { _id: id, acknowledged: false },
    { acknowledged: true, acknowledgedBy: req.user.id, acknowledgedAt: new Date() },
    { new: true }
  ).populate("acknowledgedBy", "name role");

  if (!updated) return res.json(await Alert.findById(id).populate("acknowledgedBy", "name role"));

  const { emitDataChange } = require("../sockets/socket");
  emitDataChange("alert", "acknowledge", updated);

  res.json(updated);
}

async function notifyClinicalTeam(req, res) {
  const { id } = req.params;
  if (!require("mongoose").isValidObjectId(id)) return res.status(400).json({ error: "Invalid alert id" });
  const alert = await Alert.findById(id);
  if (!alert) return res.status(404).json({ error: "Alert not found" });

  if (req.user.role !== "system_admin" && String(alert.hospitalId) !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Access denied" });
  }

  let doctorPhone = alert.assignedDoctorPhone;
  let doctorName = alert.assignedDoctorName;
  let nursePhone = alert.dutyNursePhone;
  let nurseName = alert.dutyNurseName;

  // Fallback lookup if not stored on alert record
  if (!doctorPhone && alert.patientId) {
    try {
      const p = await Patient.findById(alert.patientId).populate("assignedDoctor", "name phone");
      if (p?.assignedDoctor?.phone) {
        doctorPhone = p.assignedDoctor.phone;
        doctorName = p.assignedDoctor.name;
      }
    } catch {}
  }

  if (!nursePhone && (alert.wardId || alert.hospitalId)) {
    try {
      let nurse = null;
      if (alert.wardId) {
        nurse = await User.findOne({ hospitalId: alert.hospitalId, role: "nurse", wardId: alert.wardId, isApproved: true });
      }
      if (!nurse && alert.hospitalId) {
        nurse = await User.findOne({ hospitalId: alert.hospitalId, role: "nurse", isApproved: true });
      }
      if (nurse?.phone) {
        nursePhone = nurse.phone;
        nurseName = nurse.name;
      }
    } catch {}
  }

  const patientName = alert.patientName || "Admitted Infant";
  const incubatorLabel = alert.incubatorLabel || alert.device_id;
  const condition = alert.condition || alert.type;
  const value = alert.value;
  const typeFormatted = (alert.type || "").replace(/_/g, " ").toUpperCase();

  const formattedDoc = doctorName ? (doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`) : "Attending Physician";

  const docMessage = `🩺 *NEOCARE CLINICAL ADVISORY • ATTENDING PHYSICIAN*\n\n` +
    `Dear ${formattedDoc},\n\n` +
    `Supervisory notification regarding patient under your care:\n\n` +
    `• Patient: *${patientName}*\n` +
    `• Bed Location: *${incubatorLabel}*\n` +
    `• Observation: *${condition}*\n` +
    `• Recorded Value: *${typeFormatted}: ${value}*\n` +
    `• Timestamp: ${new Date().toLocaleTimeString()}\n\n` +
    `A bedside evaluation or telemetry chart review is recommended at your earliest clinical convenience.\n\n` +
    `Hospital Administration • NeoCare Clinical Monitoring`;

  const nurseMessage = `🩺 *NEOCARE BEDSIDE ADVISORY • NURSING STATION*\n\n` +
    `Dear Nurse ${nurseName || "Duty Nurse"},\n\n` +
    `Supervisory notification regarding patient in *${incubatorLabel}*:\n\n` +
    `• Patient: *${patientName}*\n` +
    `• Bed Location: *${incubatorLabel}*\n` +
    `• Observation: *${condition}*\n` +
    `• Recorded Value: *${typeFormatted}: ${value}*\n` +
    `• Timestamp: ${new Date().toLocaleTimeString()}\n\n` +
    `Immediate bedside assessment of infant comfort, sensor placement, and vitals is requested.\n\n` +
    `Hospital Administration • NeoCare Clinical Monitoring`;

  const dispatchResults = await notifyClinicalTeamSimultaneously({
    doctorPhone,
    doctorName,
    nursePhone,
    nurseName,
    docMessage,
    nurseMessage,
  });

  alert.teamNotifiedAt = new Date();
  alert.teamNotifiedBy = req.user.id;
  if (!alert.assignedDoctorPhone && doctorPhone) alert.assignedDoctorPhone = doctorPhone;
  if (!alert.assignedDoctorName && doctorName) alert.assignedDoctorName = doctorName;
  if (!alert.dutyNursePhone && nursePhone) alert.dutyNursePhone = nursePhone;
  if (!alert.dutyNurseName && nurseName) alert.dutyNurseName = nurseName;
  await alert.save();

  const { emitDataChange } = require("../sockets/socket");
  emitDataChange("alert", "notify_team", alert);

  return res.json({
    success: true,
    message: "Clinical team notification dispatched simultaneously",
    alert,
    dispatch: dispatchResults,
  });
}

module.exports = { getAlerts, acknowledgeAlert, notifyClinicalTeam };

