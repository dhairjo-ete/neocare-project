const Notification = require("../models/Notification");
const Announcement = require("../models/Announcement");
const { emitNotification, emitDataChange } = require("../sockets/socket");

/**
 * Close every still-pending discharge request for a patient and take down the
 * marquee announcements that were raised for them.
 *
 * Used whenever a patient leaves the active list through a path other than the
 * accept/reject buttons (direct discharge by the In-Charge, or record deletion),
 * so no orphaned "pending" request or stale banner is left behind.
 *
 * @param {ObjectId|string} patientId
 * @param {{ resolvedByName?: string, reason?: string }} [opts]
 */
async function resolvePendingDischargeRequests(patientId, opts = {}) {
  const pending = await Notification.find({
    type: "discharge_request",
    patientId,
    status: "pending",
  });
  if (!pending.length) return 0;

  const announcementIds = [];
  for (const notif of pending) {
    notif.status = "resolved";
    notif.isRead = true;
    await notif.save();

    if (notif.linkedAnnouncementId) announcementIds.push(notif.linkedAnnouncementId);

    // Let the requesting doctor know the request no longer needs action.
    if (notif.triggeredBy) {
      try {
        const doctorNotif = await Notification.create({
          targetRole: "doctor",
          targetUserId: notif.triggeredBy,
          hospitalId: notif.hospitalId,
          type: "discharge_request_accepted",
          title: "Discharge Request Closed",
          message: opts.reason
            || `Your discharge request was closed${opts.resolvedByName ? ` — ${opts.resolvedByName} handled the discharge directly` : ""}.`,
          patientId,
          status: "resolved",
          triggeredBy: null,
        });
        emitNotification(doctorNotif);
      } catch (err) {
        console.error("[resolvePendingDischargeRequests] doctor notify failed", err.message);
      }
    }
  }

  if (announcementIds.length) {
    await Announcement.updateMany(
      { $or: [{ _id: { $in: announcementIds } }, { reviewNotificationId: { $in: pending.map((n) => n._id) } }] },
      { isActive: false }
    );
    announcementIds.forEach((id) => emitDataChange("announcement", "update", { id, isActive: false }, pending[0]?.hospitalId));
  }

  return pending.length;
}

module.exports = { resolvePendingDischargeRequests };
