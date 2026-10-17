const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  // Who should receive this notification
  targetRole: {
    type: String,
    enum: ["system_admin", "hospital_admin", "doctor", "nurse", "staff", "all"],
    required: true,
  },
  // If scoped to a specific user (for doctor/nurse targeted notifications)
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // If scoped to a specific hospital's admin or staff
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hospital",
    default: null,
  },
  type: {
    type: String,
    enum: [
      "new_hospital_admin",
      "new_staff",
      "new_signup",
      "review_request",
      "review_request_accepted",
      "review_request_rejected",
      "discharge_request",
      "discharge_request_accepted",
      "discharge_request_rejected",
      "vital_alert",
      "alert_escalation",
      "patient_referral",
    ],
    required: true,
  },
  // Patient reference for discharge or clinical alerts
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    default: null,
  },
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Alert",
    default: null,
  },
  severity: {
    type: String,
    enum: ["info", "warning", "critical"],
    default: "info",
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  // Review request or clinical device specific fields
  reviewEntity: {
    type: String,
    enum: ["ward", "incubator", "doctor", "nurse", "patient", "general", "incharge"],
    default: null,
  },
  reviewEntityId: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "resolved"],
    default: "pending",
  },
  linkedAnnouncementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Announcement",
    default: null,
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  requestReason: {
    type: String,
    default: "",
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  isRead: { type: Boolean, default: false },
  metadata: { type: Object, default: {} },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
