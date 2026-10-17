const Patient = require("../models/Patient");
const PatientNote = require("../models/PatientNote");
const Incubator = require("../models/Incubator");
const { emitDataChange, emitNotification } = require("../sockets/socket");
const Notification = require("../models/Notification");
const { invalidateIncubatorCache } = require("../config/mqtt");
const { resolvePendingDischargeRequests } = require("../services/dischargeRequests");
const { closeAlertsForPatient } = require("../services/alertEngine");
const { sendAdmissionSms } = require("../services/sms.service");

function formatDoctorTitle(name) {
  if (!name) return "Doctor";
  const trimmed = String(name).trim();
  const stripped = trimmed.replace(/^(\s*dr\.?\s*)+/i, "").trim();
  return stripped ? `Dr. ${stripped}` : trimmed;
}

function formatNurseTitle(name) {
  if (!name) return "Duty Nurse";
  const trimmed = String(name).trim();
  const stripped = trimmed.replace(/^(\s*nurse\s*)+/i, "").trim();
  return stripped ? `Nurse ${stripped}` : trimmed;
}

async function generateUniqueAccessCode(patientName, guardianName) {
  const target = (patientName || guardianName || "BABY").toUpperCase();
  const cleaned = target
    .replace(/BABY\s+OF\s+/gi, "")
    .replace(/[^A-Z]/g, "");
  const prefix = (cleaned.slice(0, 3) || "NEO").padEnd(3, "X");

  for (let attempt = 0; attempt < 10; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${num}`;
    const exists = await Patient.findOne({ accessCode: candidate });
    if (!exists) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-4)}`;
}


async function createPatient(req, res) {
  const {
    incubatorId,
    name,
    gestationalAgeWeeks,
    birthWeightGrams,
    bloodType,
    assignedDoctor,
    assignedNurse,
    biologicalSex,
    dateOfBirth,
    primarySyndrome,
    guardianName,
    guardianPhone,
    guardianNationalId,
    guardianAddress,
  } = req.body;

  if (!biologicalSex || !["male", "female", "other"].includes(biologicalSex)) {
    return res.status(400).json({ error: "Biological sex must be 'male', 'female', or 'other'" });
  }
  if (!dateOfBirth) {
    return res.status(400).json({ error: "Date of birth is required" });
  }
  // #11 FIX: Date of birth cannot be in the future
  if (new Date(dateOfBirth) > new Date()) {
    return res.status(400).json({ error: "Date of birth cannot be in the future" });
  }
  if (!primarySyndrome || !primarySyndrome.trim()) {
    return res.status(400).json({ error: "Primary syndrome / admission reason is required" });
  }
  if (!guardianName || !guardianName.trim()) {
    return res.status(400).json({ error: "Mother/guardian name is required" });
  }
  if (!guardianPhone || !guardianPhone.trim()) {
    return res.status(400).json({ error: "Mother/guardian phone number is required for emergency contact and SMS alerts" });
  }
  if (!guardianAddress || !guardianAddress.trim()) {
    return res.status(400).json({ error: "Guardian address is required" });
  }
  // #12 FIX: Validate numeric ranges for clinical fields
  if (gestationalAgeWeeks !== undefined && gestationalAgeWeeks !== "") {
    const ga = Number(gestationalAgeWeeks);
    if (isNaN(ga) || ga < 22 || ga > 45) {
      return res.status(400).json({ error: "Gestational age must be between 22 and 45 weeks" });
    }
  }
  if (birthWeightGrams !== undefined && birthWeightGrams !== "") {
    const bw = Number(birthWeightGrams);
    if (isNaN(bw) || bw < 200 || bw > 6000) {
      return res.status(400).json({ error: "Birth weight must be between 200g and 6000g" });
    }
  }

  const incubator = await Incubator.findById(incubatorId);
  if (!incubator) return res.status(404).json({ error: "Incubator not found" });

  if (req.user.role !== "system_admin" && String(incubator.hospitalId) !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "That incubator does not belong to your hospital" });
  }

  // Ensure incubator is active (cannot admit to maintenance or offline incubator)
  if (incubator.status !== "active") {
    return res.status(400).json({
      error: `Cannot admit patient: Incubator "${incubator.label || incubator.deviceTopicId}" is currently ${incubator.status === "maintenance" ? "under maintenance" : "offline"}.`
    });
  }

  // Strict Medical Protocol Enforcement: 1 Patient Per Incubator
  const activeInIncubator = await Patient.findOne({ incubatorId: incubator._id, dischargedAt: null });
  if (activeInIncubator) {
    return res.status(409).json({
      error: `Medical Protocol Violation: Incubator "${incubator.label || incubator.deviceTopicId}" already has an active patient (${activeInIncubator.name}). Standard medical protocol strictly requires 1 patient per incubator.`
    });
  }

  // Validate that assignedDoctor belongs to the same hospital (if provided)
  if (assignedDoctor) {
    const User = require("../models/User");
    const doctor = await User.findById(assignedDoctor).select("role hospitalId isApproved");
    if (!doctor) {
      return res.status(404).json({ error: "Assigned doctor not found" });
    }
    if (doctor.role !== "doctor") {
      return res.status(400).json({ error: "The selected user is not a doctor" });
    }
    if (String(doctor.hospitalId) !== String(incubator.hospitalId)) {
      return res.status(403).json({ error: "Assigned doctor does not belong to this hospital" });
    }
    if (!doctor.isApproved) {
      return res.status(400).json({ error: "Assigned doctor account has not been approved yet" });
    }
  }

  // Validate that assignedNurse belongs to the same hospital (if provided)
  if (assignedNurse) {
    const User = require("../models/User");
    const nurse = await User.findById(assignedNurse).select("role hospitalId isApproved");
    if (!nurse) {
      return res.status(404).json({ error: "Assigned nurse not found" });
    }
    if (nurse.role !== "nurse") {
      return res.status(400).json({ error: "The selected user is not a nurse" });
    }
    if (String(nurse.hospitalId) !== String(incubator.hospitalId)) {
      return res.status(403).json({ error: "Assigned nurse does not belong to this hospital" });
    }
    if (!nurse.isApproved) {
      return res.status(400).json({ error: "Assigned nurse account has not been approved yet" });
    }
  }

  const accessCode = await generateUniqueAccessCode(name, guardianName);

  const patient = await Patient.create({
    hospitalId: incubator.hospitalId,
    incubatorId: incubator._id,
    name,
    gestationalAgeWeeks,
    birthWeightGrams,
    bloodType,
    assignedDoctor: assignedDoctor || null,
    assignedNurse: assignedNurse || null,
    biologicalSex,
    dateOfBirth,
    primarySyndrome: primarySyndrome.trim(),
    guardianName: guardianName.trim(),
    guardianPhone: guardianPhone.trim(),
    guardianNationalId: guardianNationalId ? guardianNationalId.trim() : "",
    guardianAddress: guardianAddress.trim(),
    accessCode,
  });

  // Construct One-Click Magic Link
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const magicLink = `${baseUrl}/patient/access?code=${accessCode}`;

  // Fetch hospital name for notification
  const Hospital = require("../models/Hospital");
  const hospital = await Hospital.findById(incubator.hospitalId).select("name");

  // Send automated SMS with magic link to guardian
  const smsResult = await sendAdmissionSms({
    guardianPhone: guardianPhone.trim(),
    guardianName: guardianName.trim(),
    patientName: name,
    incubatorLabel: incubator.label || incubator.deviceTopicId,
    hospitalName: hospital?.name || "NeoCare NICU",
    accessCode,
    magicLink,
  });

  // Invalidate the MQTT scope cache so vitals start streaming immediately for this bed
  invalidateIncubatorCache(incubator.deviceTopicId);

  emitDataChange("patient", "create", patient);
  res.status(201).json({
    ...patient.toObject(),
    accessCode,
    magicLink,
    smsDispatched: smsResult.success,
  });
}

async function listPatients(req, res) {
  const { activeOnly, status, hospitalId } = req.query;
  const query = { ...req.scope };

  if (hospitalId && req.user.role === "system_admin") {
    query.hospitalId = hospitalId;
  }

  // status is the preferred param now ("active" | "discharged" | "all");
  // activeOnly=true is kept working for backward compatibility.
  const effectiveStatus = status || (activeOnly === "true" ? "active" : "all");

  if (effectiveStatus === "active") query.dischargedAt = null;
  if (effectiveStatus === "discharged") query.dischargedAt = { $ne: null };
  // effectiveStatus === "all" -> no filter, but active/discharged should never be
  // rendered together in the UI - the frontend always asks for one explicitly.

  // req.scope may include wardId (for ward-scoped nurses), but Patient only
  // stores hospitalId + incubatorId directly, so resolve ward scoping via incubators.
  if (query.wardId) {
    const incubators = await Incubator.find({ wardId: query.wardId }).select("_id");
    query.incubatorId = { $in: incubators.map((i) => i._id) };
    delete query.wardId;
  }

  const sortField = effectiveStatus === "discharged" ? { dischargedAt: -1 } : { admittedAt: -1 };

  const patients = await Patient.find(query)
    .populate("incubatorId", "label deviceTopicId name controlSettings")
    .populate("assignedDoctor assignedNurse dischargedBy hospitalId", "label deviceTopicId name role phone email")
    .sort(sortField);

  res.json(patients);
}

async function getPatient(req, res) {
  const mongoose = require("mongoose");
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid patient ID format" });
  }

  // Only expose safe doctor & nurse fields
  const patient = await Patient.findById(req.params.id)
    .populate("incubatorId")
    .populate("assignedDoctor", "name email role phone licenseNumber")
    .populate("assignedNurse", "name email role phone licenseNumber")
    .populate("hospitalId", "name address");
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id
    ? String(patient.hospitalId._id)
    : String(patient.hospitalId);

  if (req.user.role === "patient") {
    if (String(patient._id) !== String(req.user.patientId)) {
      return res.status(403).json({ error: "Access denied. You can only view your own patient details." });
    }
  } else if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // Ensure legacy patients without accessCode get one generated automatically
  if (!patient.accessCode) {
    const accessCode = await generateUniqueAccessCode(patient.name, patient.guardianName);
    await Patient.findByIdAndUpdate(patient._id, { accessCode });
    patient.accessCode = accessCode;
  }

  // Is a discharge request currently waiting on the Hospital In-Charge?
  const pendingNotif = patient.dischargedAt
    ? null
    : await Notification.findOne({ type: "discharge_request", patientId: patient._id, status: "pending" })
        .populate("triggeredBy", "name")
        .lean();

  const body = patient.toObject();
  body.pendingDischarge = pendingNotif
    ? {
        notificationId: pendingNotif._id,
        reason: pendingNotif.requestReason || "",
        requestedBy: pendingNotif.triggeredBy?.name || null,
        requestedAt: pendingNotif.createdAt,
      }
    : null;

  res.json(body);
}

async function dischargePatient(req, res) {
  if (req.user.role === "patient") {
    return res.status(403).json({ error: "Patients / Guardians cannot discharge patients." });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);
  if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  if (patient.dischargedAt) {
    return res.status(400).json({ error: "This patient has already been discharged" });
  }

  // If a doctor has a pending request and the In-Charge gives no summary, carry over the doctor's reason
  let summary = typeof req.body.dischargeSummary === "string" ? req.body.dischargeSummary.trim() : "";
  if (!summary) {
    const pendingReq = await Notification.findOne({ type: "discharge_request", patientId: patient._id, status: "pending" }).select("requestReason");
    summary = (pendingReq?.requestReason || "").trim();
  }

  patient.dischargedAt = new Date();
  patient.dischargedBy = req.user.id;
  patient.dischargeSummary = summary;
  await patient.save();

  // Close any pending doctor request + its marquee banner so nothing is left orphaned
  await resolvePendingDischargeRequests(patient._id, { resolvedByName: req.user.name });
  await closeAlertsForPatient(patient._id, patient.hospitalId);

  // Invalidate MQTT scope cache so phantom vitals stop immediately
  const dischargedIncubator = await Incubator.findById(patient.incubatorId).select("deviceTopicId");
  if (dischargedIncubator) {
    invalidateIncubatorCache(dischargedIncubator.deviceTopicId);
  }

  emitDataChange("patient", "discharge", patient);
  res.json(patient);
}

async function addNote(req, res) {
  if (req.user.role === "patient") {
    return res.status(403).json({ error: "Patients / Guardians cannot add clinical notes." });
  }

  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);
  if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // #7 FIX: Prevent adding notes to discharged patients
  if (patient.dischargedAt) {
    return res.status(400).json({ error: "Cannot add clinical notes to a discharged patient." });
  }

  // #6 FIX: Validate note text is not blank
  const noteText = req.body.text?.trim();
  if (!noteText) {
    return res.status(400).json({ error: "Note text is required and cannot be blank." });
  }

  const note = await PatientNote.create({
    patientId: patient._id,
    incubatorId: patient.incubatorId,
    authorId: req.user.id,
    text: noteText,
    timestamp: req.body.timestamp || new Date(),
  });

  const populatedNote = await PatientNote.findById(note._id).populate("authorId", "name role");
  emitDataChange("patient_note", "create", populatedNote || note);
  res.status(201).json(populatedNote || note);
}

async function deleteNote(req, res) {
  try {
    if (req.user.role === "patient") {
      return res.status(403).json({ error: "Patients / Guardians cannot delete clinical notes." });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient record not found." });

    const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);
    if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }

    const note = await PatientNote.findOne({ _id: req.params.noteId, patientId: patient._id });
    if (!note) {
      return res.status(404).json({ error: "Clinical note not found." });
    }

    // Strict author-only deletion enforcement:
    // Only the clinical staff member who wrote the note can delete it.
    // Doctors cannot delete nurse or hospital in-charge notes; nurses cannot delete doctor or in-charge notes.
    const noteAuthorId = note.authorId?._id ? String(note.authorId._id) : String(note.authorId);
    if (noteAuthorId !== String(req.user.id)) {
      return res.status(403).json({
        error: "Unauthorized: You can only delete clinical notes that you authored. Notes authored by other doctors, nurses, or hospital in-charges cannot be deleted.",
      });
    }

    await PatientNote.findByIdAndDelete(note._id);

    emitDataChange("patient_note", "delete", { _id: note._id, patientId: patient._id });
    return res.json({ message: "Clinical note deleted successfully.", deletedNoteId: note._id });
  } catch (err) {
    console.error("deleteNote error:", err);
    return res.status(500).json({ error: "Failed to delete clinical note." });
  }
}


async function listNotes(req, res) {
  const patient = await Patient.findById(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);

  if (req.user.role === "patient") {
    if (String(patient._id) !== String(req.user.patientId)) {
      return res.status(403).json({ error: "Access denied" });
    }
  } else if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const notes = await PatientNote.find({ patientId: patient._id })
    .populate("authorId", "name role")
    .sort({ timestamp: 1 });

  res.json(notes);
}

async function updatePatient(req, res) {
  try {
    if (req.user.role === "patient") {
      return res.status(403).json({ error: "Patients / Guardians cannot modify patient records." });
    }

    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly modify patient records. Please send a Review Request to the Hospital In-Charge." });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (String(patient.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this patient" });
    }

    // #8 & #10 FIX: Check tenancy and invalidate cache on incubator switch
    let oldIncubatorId = null;
    let newIncubatorId = null;

    if (req.body.incubatorId && String(req.body.incubatorId) !== String(patient.incubatorId)) {
      const targetInc = await Incubator.findById(req.body.incubatorId);
      if (!targetInc) return res.status(404).json({ error: "Target incubator not found" });

      if (String(targetInc.hospitalId) !== String(patient.hospitalId)) {
        return res.status(403).json({ error: "Target incubator belongs to a different hospital." });
      }

      if (targetInc.status !== "active") {
        return res.status(400).json({
          error: `Cannot assign incubator: Incubator "${targetInc.label || targetInc.deviceTopicId}" is currently ${targetInc.status === "maintenance" ? "under maintenance" : "offline"}.`
        });
      }
      const activeInTarget = await Patient.findOne({ incubatorId: targetInc._id, dischargedAt: null, _id: { $ne: patient._id } });
      if (activeInTarget) {
        return res.status(409).json({
          error: `Incubator "${targetInc.label || targetInc.deviceTopicId}" already has an active patient (${activeInTarget.name}). Standard medical protocol strictly requires 1 patient per incubator.`
        });
      }

      oldIncubatorId = patient.incubatorId;
      newIncubatorId = targetInc._id;
    }

    // #13 FIX: Clinical field range validations for updatePatient
    if (req.body.dateOfBirth && new Date(req.body.dateOfBirth) > new Date()) {
      return res.status(400).json({ error: "Date of birth cannot be in the future" });
    }
    if (req.body.gestationalAgeWeeks !== undefined && req.body.gestationalAgeWeeks !== "") {
      const ga = Number(req.body.gestationalAgeWeeks);
      if (isNaN(ga) || ga < 22 || ga > 45) {
        return res.status(400).json({ error: "Gestational age must be between 22 and 45 weeks" });
      }
    }
    if (req.body.birthWeightGrams !== undefined && req.body.birthWeightGrams !== "") {
      const bw = Number(req.body.birthWeightGrams);
      if (isNaN(bw) || bw < 200 || bw > 6000) {
        return res.status(400).json({ error: "Birth weight must be between 200g and 6000g" });
      }
    }

    const User = require("../models/User");

    // Track Doctor handover
    const oldDoctorId = patient.assignedDoctor ? String(patient.assignedDoctor) : null;
    let newDoctorId = oldDoctorId;
    let oldDoctorUser = null;
    let newDoctorUser = null;
    let doctorChanged = false;

    if (req.body.assignedDoctor !== undefined) {
      const candidateDoc = req.body.assignedDoctor && req.body.assignedDoctor !== "" ? String(req.body.assignedDoctor) : null;
      if (candidateDoc !== oldDoctorId) {
        doctorChanged = true;
        if (candidateDoc) {
          const doctor = await User.findById(candidateDoc).select("name role hospitalId isApproved phone email");
          if (!doctor) {
            return res.status(404).json({ error: "Assigned doctor not found" });
          }
          if (doctor.role !== "doctor") {
            return res.status(400).json({ error: "The selected user is not a doctor" });
          }
          if (String(doctor.hospitalId) !== String(patient.hospitalId)) {
            return res.status(403).json({ error: "Assigned doctor does not belong to this hospital" });
          }
          if (!doctor.isApproved) {
            return res.status(400).json({ error: "Assigned doctor account has not been approved yet" });
          }
          newDoctorId = String(doctor._id);
          newDoctorUser = doctor;
        } else {
          newDoctorId = null;
        }
      }
    }

    // Track Nurse handover
    const oldNurseId = patient.assignedNurse ? String(patient.assignedNurse) : null;
    let newNurseId = oldNurseId;
    let oldNurseUser = null;
    let newNurseUser = null;
    let nurseChanged = false;

    if (req.body.assignedNurse !== undefined) {
      const candidateNurse = req.body.assignedNurse && req.body.assignedNurse !== "" ? String(req.body.assignedNurse) : null;
      if (candidateNurse !== oldNurseId) {
        nurseChanged = true;
        if (candidateNurse) {
          const nurse = await User.findById(candidateNurse).select("name role hospitalId isApproved phone email");
          if (!nurse) {
            return res.status(404).json({ error: "Assigned nurse not found" });
          }
          if (nurse.role !== "nurse") {
            return res.status(400).json({ error: "The selected user is not a nurse" });
          }
          if (String(nurse.hospitalId) !== String(patient.hospitalId)) {
            return res.status(403).json({ error: "Assigned nurse does not belong to this hospital" });
          }
          if (!nurse.isApproved) {
            return res.status(400).json({ error: "Assigned nurse account has not been approved yet" });
          }
          newNurseId = String(nurse._id);
          newNurseUser = nurse;
        } else {
          newNurseId = null;
        }
      }
    }

    // Process Doctor referral notifications and timeline note
    if (doctorChanged) {
      if (oldDoctorId && !oldDoctorUser) {
        oldDoctorUser = await User.findById(oldDoctorId).select("name role hospitalId phone email");
      }
      const prevDocLabel = oldDoctorUser ? formatDoctorTitle(oldDoctorUser.name) : "Previous Attending";
      const nextDocLabel = newDoctorUser ? formatDoctorTitle(newDoctorUser.name) : "Unassigned Caregiver";

      // 1. Notify Previous Doctor that patient was referred/shifted
      if (oldDoctorUser) {
        try {
          const notifPrevDoc = await Notification.create({
            targetRole: "doctor",
            targetUserId: oldDoctorUser._id,
            hospitalId: patient.hospitalId,
            type: "patient_referral",
            patientId: patient._id,
            severity: "info",
            title: "Patient Care Transferred / Referred",
            message: `Care of patient ${patient.name} has been transferred to ${nextDocLabel}. Your previous medical notes and clinical history remain intact.`,
            metadata: {
              patientId: patient._id,
              patientName: patient.name,
              direction: "outgoing",
              previousDoctor: prevDocLabel,
              newDoctor: nextDocLabel,
              referredBy: req.user.name,
            },
          });
          emitNotification(notifPrevDoc);
        } catch (notifErr) {
          console.warn("[updatePatient] Failed to notify previous doctor:", notifErr.message);
        }
      }

      // 2. Notify New Doctor that a patient was referred to them
      if (newDoctorUser) {
        try {
          const notifNextDoc = await Notification.create({
            targetRole: "doctor",
            targetUserId: newDoctorUser._id,
            hospitalId: patient.hospitalId,
            type: "patient_referral",
            patientId: patient._id,
            severity: "info",
            title: "New Patient Assigned / Referred",
            message: oldDoctorUser
              ? `Patient ${patient.name} has been referred to your care from ${prevDocLabel}. All past clinical history and notes are available in the patient chart.`
              : `Patient ${patient.name} has been assigned to your primary attending care.`,
            metadata: {
              patientId: patient._id,
              patientName: patient.name,
              direction: "incoming",
              previousDoctor: prevDocLabel,
              newDoctor: nextDocLabel,
              referredBy: req.user.name,
            },
          });
          emitNotification(notifNextDoc);
        } catch (notifErr) {
          console.warn("[updatePatient] Failed to notify new doctor:", notifErr.message);
        }
      }

      // 3. Document Handover on Clinical Timeline Note (permanent clinical audit trail)
      try {
        const referralNote = await PatientNote.create({
          patientId: patient._id,
          incubatorId: patient.incubatorId,
          authorId: req.user.id,
          text: `Transfer of Care: Attending physician reassigned ${oldDoctorUser ? `from ${prevDocLabel} ` : ""}to ${nextDocLabel} by ${req.user.name} (${req.user.role === "hospital_admin" ? "Hospital In-Charge" : "Supervisor"}).`,
          timestamp: new Date(),
        });
        emitDataChange("patient_note", "create", referralNote);
      } catch (noteErr) {
        console.warn("[updatePatient] Failed to create referral note:", noteErr.message);
      }

      patient.assignedDoctor = newDoctorId;
    }

    // Process Nurse handover notifications and timeline note
    if (nurseChanged) {
      if (oldNurseId && !oldNurseUser) {
        oldNurseUser = await User.findById(oldNurseId).select("name role hospitalId phone email");
      }
      const prevNurseLabel = oldNurseUser ? formatNurseTitle(oldNurseUser.name) : "Previous Duty Nurse";
      const nextNurseLabel = newNurseUser ? formatNurseTitle(newNurseUser.name) : "Unassigned Duty Nurse";

      // 1. Notify Previous Nurse that care was handed over
      if (oldNurseUser) {
        try {
          const notifPrevNurse = await Notification.create({
            targetRole: "nurse",
            targetUserId: oldNurseUser._id,
            hospitalId: patient.hospitalId,
            type: "patient_referral",
            patientId: patient._id,
            severity: "info",
            title: "Patient Nursing Care Handover",
            message: `Bedside nursing care for patient ${patient.name} has been handed over to ${nextNurseLabel}. Previous records remain intact.`,
            metadata: {
              patientId: patient._id,
              patientName: patient.name,
              direction: "outgoing",
              previousNurse: prevNurseLabel,
              newNurse: nextNurseLabel,
              referredBy: req.user.name,
            },
          });
          emitNotification(notifPrevNurse);
        } catch (notifErr) {
          console.warn("[updatePatient] Failed to notify previous nurse:", notifErr.message);
        }
      }

      // 2. Notify New Nurse of incoming patient
      if (newNurseUser) {
        try {
          const notifNextNurse = await Notification.create({
            targetRole: "nurse",
            targetUserId: newNurseUser._id,
            hospitalId: patient.hospitalId,
            type: "patient_referral",
            patientId: patient._id,
            severity: "info",
            title: "New Patient Assigned to Nursing Care",
            message: oldNurseUser
              ? `Bedside nursing care for patient ${patient.name} has been assigned to you from ${prevNurseLabel}.`
              : `Bedside nursing care for patient ${patient.name} has been assigned to you.`,
            metadata: {
              patientId: patient._id,
              patientName: patient.name,
              direction: "incoming",
              previousNurse: prevNurseLabel,
              newNurse: nextNurseLabel,
              referredBy: req.user.name,
            },
          });
          emitNotification(notifNextNurse);
        } catch (notifErr) {
          console.warn("[updatePatient] Failed to notify new nurse:", notifErr.message);
        }
      }

      // 3. Document Nursing Handover on Clinical Timeline Note
      try {
        const nurseHandoverNote = await PatientNote.create({
          patientId: patient._id,
          incubatorId: patient.incubatorId,
          authorId: req.user.id,
          text: `Nursing Handover: Bedside care reassigned ${oldNurseUser ? `from ${prevNurseLabel} ` : ""}to ${nextNurseLabel} by ${req.user.name} (${req.user.role === "hospital_admin" ? "Hospital In-Charge" : "Supervisor"}).`,
          timestamp: new Date(),
        });
        emitDataChange("patient_note", "create", nurseHandoverNote);
      } catch (noteErr) {
        console.warn("[updatePatient] Failed to create nurse handover note:", noteErr.message);
      }

      patient.assignedNurse = newNurseId;
    }

    const fields = [
      "name", "gestationalAgeWeeks", "birthWeightGrams", "bloodType",
      "biologicalSex", "dateOfBirth", "primarySyndrome",
      "guardianName", "guardianPhone", "guardianNationalId", "guardianAddress", "incubatorId"
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) patient[f] = req.body[f];
    });

    await patient.save();

    if (oldIncubatorId || newIncubatorId) {
      const { invalidateIncubatorCache } = require("../config/mqtt");
      if (oldIncubatorId) {
        const oldInc = await Incubator.findById(oldIncubatorId);
        if (oldInc) invalidateIncubatorCache(oldInc.deviceTopicId);
      }
      if (newIncubatorId) {
        const newInc = await Incubator.findById(newIncubatorId);
        if (newInc) invalidateIncubatorCache(newInc.deviceTopicId);
      }
    }

    const populated = await Patient.findById(patient._id)
      .populate("incubatorId", "label deviceTopicId name controlSettings")
      .populate("assignedDoctor assignedNurse dischargedBy hospitalId", "label deviceTopicId name role phone email");

    emitDataChange("patient", "update", populated);
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update patient details" });
  }
}

async function deletePatient(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly delete patient records. Please send a Review Request to the Hospital In-Charge." });
    }

    if (req.user.role !== "hospital_admin") {
      return res.status(403).json({ error: "Only the Hospital In-Charge can delete patient records." });
    }

    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    if (String(patient.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this patient" });
    }

    await Patient.findByIdAndDelete(req.params.id);
    await resolvePendingDischargeRequests(patient._id, {
      reason: "Your discharge request was closed because the patient record was removed.",
    });

    // Remove the patient's clinical records so nothing is left orphaned
    const Vital = require("../models/Vital");
    const Alert = require("../models/Alert");
    await Promise.all([
      Vital.deleteMany({ patientId: patient._id }),
      Alert.deleteMany({ patientId: patient._id }),
      PatientNote.deleteMany({ patientId: patient._id }),
    ]);

    // Stop the MQTT ingest from tagging new readings with the deleted patient
    if (patient.incubatorId) {
      const bed = await Incubator.findById(patient.incubatorId).select("deviceTopicId");
      if (bed) invalidateIncubatorCache(bed.deviceTopicId);
    }

    emitDataChange("patient", "delete", { id: req.params.id }, patient.hospitalId);
    res.json({ message: "Patient record deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete patient record" });
  }
}

module.exports = {
  createPatient,
  listPatients,
  getPatient,
  updatePatient,
  deletePatient,
  dischargePatient,
  addNote,
  listNotes,
  deleteNote,
};
