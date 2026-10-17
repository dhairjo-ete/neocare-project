const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  device_id: { type: String, required: true, index: true },
  type: { type: String, enum: ["heart_rate", "spo2", "temperature"], required: true },
  value: { type: Number, required: true },
  severity: { type: String, enum: ["warning", "critical"], required: true },
  condition: { type: String, default: "Abnormal Vital Sign" },
  acknowledged: { type: Boolean, default: false },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  acknowledgedAt: { type: Date },
  timestamp: { type: Date, default: Date.now },

  // Clinical context for immediate identification
  patientName: { type: String, default: "" },
  incubatorLabel: { type: String, default: "" },
  assignedDoctorName: { type: String, default: "" },
  assignedDoctorPhone: { type: String, default: "" },
  dutyNurseName: { type: String, default: "" },
  dutyNursePhone: { type: String, default: "" },

  // Supervisory Clinical Team Notification Tracking
  teamNotifiedAt: { type: Date, default: null },
  teamNotifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Tier 4 Escalation Tracking
  escalated: { type: Boolean, default: false },
  escalatedAt: { type: Date, default: null },

  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", default: null, index: true },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", default: null },
  incubatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Incubator", default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model("Alert", alertSchema);
