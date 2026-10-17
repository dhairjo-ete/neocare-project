const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["emergency", "critical", "warning", "info", "review_request"],
      default: "info",
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null, // null means global system broadcast across all hospitals
      index: true,
    },
    reviewNotificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notification",
      default: null,
    },
    isActive: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 1 }, // Higher number = higher display priority
    expiresAt: { type: Date, default: null }, // Optional auto-expiration date
    actionUrl: { type: String, default: "" }, // Optional link if user clicks the announcement
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcement", announcementSchema);
