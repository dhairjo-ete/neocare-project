const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// Get notifications for the logged-in admin
async function getNotifications(req, res) {
  try {
    const { role, hospitalId } = req.user;

    let query = {};
    if (role === "system_admin") {
      query = { targetRole: "system_admin" };
    } else if (role === "hospital_admin") {
      query = {
        hospitalId: req.user.hospitalId,
        $or: [
          { targetRole: "hospital_admin" },
          { type: { $in: ["alert_escalation", "vital_alert"] } },
        ],
      };
    } else if (role === "doctor" || role === "nurse") {
      // Doctors and nurses see direct notifications + hospital clinical emergency alerts
      query = {
        $or: [
          { targetUserId: req.user.id },
          { hospitalId: req.user.hospitalId, type: { $in: ["vital_alert", "alert_escalation"] } },
          { hospitalId: req.user.hospitalId, targetRole: { $in: [role, "staff", "all"] } },
        ],
      };
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const notifications = await Notification.find(query)
      .populate("triggeredBy", "name email role")
      .populate("patientId", "name")
      .populate("alertId")
      .sort({ createdAt: -1 })
      .limit(60);

    res.json(notifications);
  } catch (err) {
    console.error("[getNotifications]", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
}

// Mark a notification as read (only the intended recipient may do this)
async function markRead(req, res) {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Notification not found" });

    // Ownership check: ensure only the rightful recipient can mark it read
    const { role, id: userId, hospitalId } = req.user;
    const isOwner =
      (notif.targetRole === "system_admin" && role === "system_admin") ||
      (notif.targetRole === "hospital_admin" && role === "hospital_admin" && String(notif.hospitalId) === String(hospitalId)) ||
      (["doctor", "nurse"].includes(notif.targetRole) && String(notif.targetUserId) === String(userId)) ||
      (notif.hospitalId && String(notif.hospitalId) === String(hospitalId) && ["vital_alert", "alert_escalation"].includes(notif.type));

    if (!isOwner) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    notif.isRead = true;
    await notif.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
}

// Mark ALL notifications as read for logged-in admin
async function markAllRead(req, res) {
  try {
    const { role, hospitalId } = req.user;
    let query;
    if (role === "system_admin") {
      query = { targetRole: "system_admin", isRead: false };
    } else if (role === "hospital_admin") {
      query = {
        hospitalId: req.user.hospitalId,
        $or: [
          { targetRole: "hospital_admin" },
          { type: { $in: ["vital_alert", "alert_escalation"] } },
        ],
        isRead: false,
      };
    } else if (role === "doctor" || role === "nurse") {
      query = {
        $or: [
          { targetUserId: req.user.id },
          { hospitalId: req.user.hospitalId, type: { $in: ["vital_alert", "alert_escalation"] } },
          { hospitalId: req.user.hospitalId, targetRole: { $in: [role, "staff", "all"] } },
        ],
        isRead: false,
      };
    } else {
      query = { targetUserId: req.user.id, isRead: false };
    }

    await Notification.updateMany(query, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
}

// Delete a notification (only the intended recipient may delete their own)
async function deleteNotification(req, res) {
  try {
    const notif = await Notification.findById(req.params.id);
    if (!notif) return res.status(404).json({ error: "Notification not found" });

    // Ownership check
    const { role, id: userId, hospitalId } = req.user;
    const isOwner =
      (notif.targetRole === "system_admin" && role === "system_admin") ||
      (notif.targetRole === "hospital_admin" && role === "hospital_admin" && String(notif.hospitalId) === String(hospitalId)) ||
      (["doctor", "nurse"].includes(notif.targetRole) && String(notif.targetUserId) === String(userId)) ||
      (notif.hospitalId && String(notif.hospitalId) === String(hospitalId) && ["vital_alert", "alert_escalation"].includes(notif.type));

    if (!isOwner) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    if (["review_request", "discharge_request"].includes(notif.type) && notif.status === "pending") {
      return res.status(400).json({ error: "Pending requests cannot be deleted. Please accept or decline the request to resolve it." });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete notification" });
  }
}

const Announcement = require("../models/Announcement");
const Hospital = require("../models/Hospital");
const Patient = require("../models/Patient");
const { emitNotification, emitDataChange } = require("../sockets/socket");

// System Admin sends a review request to a Hospital Admin
async function createReviewRequest(req, res) {
  try {
    const { hospitalId, reviewEntity, reviewEntityId, title, message } = req.body;

    if (!hospitalId || !message) {
      return res.status(400).json({ error: "Hospital ID and message are required" });
    }

    // 1. Create Notification for Hospital In-Charge
    const notification = await Notification.create({
      targetRole: "hospital_admin",
      hospitalId,
      type: "review_request",
      title: title || `Review Request from System Admin`,
      message,
      reviewEntity: reviewEntity || "general",
      reviewEntityId: reviewEntityId || null,
      status: "pending",
      triggeredBy: req.user.id,
    });

    let actionTab = "telemetry";
    if (reviewEntity === "ward") actionTab = "wards";
    else if (reviewEntity === "incubator") actionTab = "incubators";
    else if (reviewEntity === "doctor") actionTab = "doctors";
    else if (reviewEntity === "nurse") actionTab = "nurses";
    else if (reviewEntity === "incharge") actionTab = "incharge";
    else if (reviewEntity === "patient") actionTab = "patients";

    const actionUrl = `/admin/overview?tab=${actionTab}&hospitalId=${hospitalId}`;

    // 2. Automatically create Marquee Announcement for Hospital In-Charge ticker banner
    const announcement = await Announcement.create({
      title: title || "System Admin Review Request",
      message: message,
      type: "review_request",
      hospitalId,
      priority: 5,
      createdBy: req.user.id,
      isActive: true,
      actionUrl,
      reviewNotificationId: notification._id,
    });

    notification.linkedAnnouncementId = announcement._id;
    await notification.save();

    const populatedNotif = await Notification.findById(notification._id).populate("triggeredBy", "name email role");
    const populatedAnn = await Announcement.findById(announcement._id).populate("createdBy", "name role");

    // Real-time Socket.IO broadcasts
    emitNotification(populatedNotif);
    emitDataChange("announcement", "create", populatedAnn);

    res.status(201).json({ success: true, notification: populatedNotif, announcement: populatedAnn });
  } catch (err) {
    console.error("[createReviewRequest]", err);
    res.status(500).json({ error: "Failed to send review request" });
  }
}

// Hospital Admin accepts a review request
async function acceptReviewRequest(req, res) {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (req.user.role !== "hospital_admin" || String(notification.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    notification.status = "accepted";
    notification.isRead = true;
    await notification.save();

    // Deactivate linked Marquee Announcement ticker banner
    await Announcement.updateMany(
      { $or: [{ _id: notification.linkedAnnouncementId }, { reviewNotificationId: notification._id }] },
      { isActive: false }
    );

    const hospital = await Hospital.findById(req.user.hospitalId);
    const hospName = hospital ? hospital.name : "Hospital";

    // Notify System Admin
    const sysAdminNotif = await Notification.create({
      targetRole: "system_admin",
      type: "review_request_accepted",
      title: `Review Request Accepted — ${hospName}`,
      message: `Hospital In-Charge ${req.user.name} accepted the review request for "${notification.title}".`,
      reviewEntity: notification.reviewEntity,
      reviewEntityId: notification.reviewEntityId,
      status: "accepted",
      triggeredBy: req.user.id,
    });

    const populatedSys = await Notification.findById(sysAdminNotif._id).populate("triggeredBy", "name email role");
    emitNotification(populatedSys);
    emitDataChange("announcement", "update", { id: notification.linkedAnnouncementId, isActive: false }, notification.hospitalId);

    res.json({ success: true, notification, sysAdminNotification: populatedSys });
  } catch (err) {
    console.error("[acceptReviewRequest]", err);
    res.status(500).json({ error: "Failed to accept review request" });
  }
}

// Hospital Admin rejects/deletes a review request with mandatory reason
async function rejectReviewRequest(req, res) {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: "Please provide a reason for declining the review request." });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (req.user.role !== "hospital_admin" || String(notification.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    notification.status = "rejected";
    notification.isRead = true;
    notification.rejectionReason = rejectionReason.trim();
    await notification.save();

    // Deactivate linked Marquee Announcement ticker banner
    await Announcement.updateMany(
      { $or: [{ _id: notification.linkedAnnouncementId }, { reviewNotificationId: notification._id }] },
      { isActive: false }
    );

    const hospital = await Hospital.findById(req.user.hospitalId);
    const hospName = hospital ? hospital.name : "Hospital";

    // Notify System Admin with reason
    const sysAdminNotif = await Notification.create({
      targetRole: "system_admin",
      type: "review_request_rejected",
      title: `Review Request Declined — ${hospName}`,
      message: `Hospital In-Charge ${req.user.name} declined the review request for "${notification.title}". Reason: "${rejectionReason.trim()}"`,
      reviewEntity: notification.reviewEntity,
      reviewEntityId: notification.reviewEntityId,
      status: "rejected",
      rejectionReason: rejectionReason.trim(),
      triggeredBy: req.user.id,
    });

    const populatedSys = await Notification.findById(sysAdminNotif._id).populate("triggeredBy", "name email role");
    emitNotification(populatedSys);
    emitDataChange("announcement", "update", { id: notification.linkedAnnouncementId, isActive: false }, notification.hospitalId);

    res.json({ success: true, notification, sysAdminNotification: populatedSys });
  } catch (err) {
    console.error("[rejectReviewRequest]", err);
    res.status(500).json({ error: "Failed to decline review request" });
  }
}

// ── Discharge Request (Doctor → Hospital Admin) ───────────────────────────────

// Doctor sends a discharge request for a patient
async function createDischargeRequest(req, res) {
  try {
    const { patientId } = req.body;
    const message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, 500) : "";

    if (!patientId) {
      return res.status(400).json({ error: "Patient ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: "Invalid patient ID" });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    if (patient.dischargedAt) {
      return res.status(400).json({ error: "Patient is already discharged" });
    }

    // Check that the requesting doctor belongs to the same hospital
    if (String(patient.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "This patient does not belong to your hospital" });
    }

    // If a doctor has been assigned to this patient, only that doctor may request discharge
    if (patient.assignedDoctor && String(patient.assignedDoctor) !== String(req.user.id)) {
      return res.status(403).json({ error: "Only the doctor assigned to this patient can request discharge" });
    }

    // Prevent duplicate pending requests for the same patient
    const existingPending = await Notification.findOne({
      type: "discharge_request",
      patientId: patient._id,
      status: "pending",
    });
    if (existingPending) {
      return res.status(409).json({ error: "A discharge request for this patient is already awaiting the Hospital In-Charge." });
    }

    const doctorName = req.user.name || "Doctor";
    const patientName = patient.name || "Patient";
    const notifTitle = `Discharge Request — ${patientName}`;
    const notifMessage = message
      ? `Dr. ${doctorName} requests discharge for patient "${patientName}". Reason: ${message}`
      : `Dr. ${doctorName} requests discharge for patient "${patientName}".`;

    // 1. Create Notification for Hospital In-Charge
    const notification = await Notification.create({
      targetRole: "hospital_admin",
      hospitalId: patient.hospitalId,
      type: "discharge_request",
      title: notifTitle,
      message: notifMessage,
      patientId: patient._id,
      status: "pending",
      requestReason: message,
      triggeredBy: req.user.id,
    });

    // 2. Create Marquee Announcement for Hospital In-Charge banner
    const announcement = await Announcement.create({
      title: notifTitle,
      message: notifMessage,
      type: "review_request",  // reuse existing Announcement type for marquee
      hospitalId: patient.hospitalId,
      priority: 8,
      createdBy: req.user.id,
      isActive: true,
      actionUrl: `/patients/${patient._id}?action=discharge`,
      reviewNotificationId: notification._id,
    });

    notification.linkedAnnouncementId = announcement._id;
    await notification.save();

    const populatedNotif = await Notification.findById(notification._id)
      .populate("triggeredBy", "name email role")
      .populate("patientId", "name");
    const populatedAnn = await Announcement.findById(announcement._id).populate("createdBy", "name role");

    emitNotification(populatedNotif);
    emitDataChange("announcement", "create", populatedAnn);
    // Lets open patient pages refresh their "discharge requested" state
    emitDataChange("patient", "discharge_request", { id: patient._id, pending: true }, patient.hospitalId);

    res.status(201).json({ success: true, notification: populatedNotif });
  } catch (err) {
    console.error("[createDischargeRequest]", err);
    res.status(500).json({ error: "Failed to send discharge request" });
  }
}

// Hospital Admin accepts a discharge request → actually discharges the patient
async function acceptDischargeRequest(req, res) {
  try {
    const { id } = req.params;
    const providedSummary = typeof req.body.dischargeSummary === "string" ? req.body.dischargeSummary.trim() : "";

    const notification = await Notification.findById(id).populate("patientId", "name hospitalId incubatorId dischargedAt");

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.type !== "discharge_request") {
      return res.status(400).json({ error: "Not a discharge request" });
    }
    if (notification.status !== "pending") {
      return res.status(409).json({ error: `This request was already ${notification.status}` });
    }
    if (req.user.role !== "hospital_admin" || String(notification.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    // Discharge the patient
    const patient = notification.patientId ? await Patient.findById(notification.patientId._id) : null;
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    if (patient.dischargedAt) {
      return res.status(400).json({ error: "Patient is already discharged" });
    }

    patient.dischargedAt = new Date();
    patient.dischargedBy = req.user.id;
    // Use the In-Charge's summary if given, otherwise carry over the doctor's justification
    patient.dischargeSummary = providedSummary || (notification.requestReason || "").trim();
    await patient.save();

    // Invalidate MQTT cache
    const Incubator = require("../models/Incubator");
    const { invalidateIncubatorCache } = require("../config/mqtt");
    const inc = await Incubator.findById(patient.incubatorId).select("deviceTopicId");
    if (inc) invalidateIncubatorCache(inc.deviceTopicId);

    await require("../services/alertEngine").closeAlertsForPatient(patient._id, patient.hospitalId);
    emitDataChange("patient", "discharge", patient);

    // Update the notification status
    notification.status = "accepted";
    notification.isRead = true;
    await notification.save();

    // Deactivate marquee announcement
    await Announcement.updateMany(
      { $or: [{ _id: notification.linkedAnnouncementId }, { reviewNotificationId: notification._id }] },
      { isActive: false }
    );

    // Notify the requesting doctor
    const docNotif = await Notification.create({
      targetRole: "doctor",
      targetUserId: notification.triggeredBy,
      hospitalId: notification.hospitalId,
      type: "discharge_request_accepted",
      title: `Discharge Approved — ${patient.name}`,
      message: `Hospital In-Charge ${req.user.name} approved your discharge request for patient "${patient.name}".`,
      patientId: patient._id,
      status: "accepted",
      triggeredBy: req.user.id,
    });

    const populatedDocNotif = await Notification.findById(docNotif._id)
      .populate("triggeredBy", "name email role")
      .populate("patientId", "name");
    emitNotification(populatedDocNotif);
    emitDataChange("announcement", "update", { id: notification.linkedAnnouncementId, isActive: false }, notification.hospitalId);

    res.json({ success: true, notification, patient });
  } catch (err) {
    console.error("[acceptDischargeRequest]", err);
    res.status(500).json({ error: "Failed to accept discharge request" });
  }
}

// Hospital Admin rejects a discharge request with a reason
async function rejectDischargeRequest(req, res) {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: "Please provide a reason for declining the discharge request." });
    }

    const notification = await Notification.findById(id).populate("patientId", "name");

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (notification.type !== "discharge_request") {
      return res.status(400).json({ error: "Not a discharge request" });
    }
    if (notification.status !== "pending") {
      return res.status(409).json({ error: `This request was already ${notification.status}` });
    }
    if (req.user.role !== "hospital_admin" || String(notification.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this notification" });
    }

    notification.status = "rejected";
    notification.isRead = true;
    notification.rejectionReason = rejectionReason.trim();
    await notification.save();

    // Deactivate marquee announcement
    await Announcement.updateMany(
      { $or: [{ _id: notification.linkedAnnouncementId }, { reviewNotificationId: notification._id }] },
      { isActive: false }
    );

    const patientName = notification.patientId?.name || "Patient";

    // Notify the requesting doctor
    const docNotif = await Notification.create({
      targetRole: "doctor",
      targetUserId: notification.triggeredBy,
      hospitalId: notification.hospitalId,
      type: "discharge_request_rejected",
      title: `Discharge Declined — ${patientName}`,
      message: `Hospital In-Charge ${req.user.name} declined your discharge request for "${patientName}". Reason: "${rejectionReason.trim()}"`,
      patientId: notification.patientId,
      status: "rejected",
      rejectionReason: rejectionReason.trim(),
      triggeredBy: req.user.id,
    });

    const populatedDocNotif = await Notification.findById(docNotif._id)
      .populate("triggeredBy", "name email role")
      .populate("patientId", "name");
    emitNotification(populatedDocNotif);
    emitDataChange("announcement", "update", { id: notification.linkedAnnouncementId, isActive: false }, notification.hospitalId);
    // Re-enable the doctor's "Request Discharge" button on open patient pages
    emitDataChange("patient", "discharge_request", { id: notification.patientId?._id || notification.patientId, pending: false }, notification.hospitalId);

    res.json({ success: true, notification });
  } catch (err) {
    console.error("[rejectDischargeRequest]", err);
    res.status(500).json({ error: "Failed to decline discharge request" });
  }
}

module.exports = {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
  createReviewRequest,
  acceptReviewRequest,
  rejectReviewRequest,
  createDischargeRequest,
  acceptDischargeRequest,
  rejectDischargeRequest,
};
