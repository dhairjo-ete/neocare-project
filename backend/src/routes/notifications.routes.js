const router = require("express").Router();
const {
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
} = require("../controllers/notifications.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const adminOnly = requireRole("system_admin", "hospital_admin");
const systemAdminOnly = requireRole("system_admin");
const hospitalAdminOnly = requireRole("hospital_admin");
const doctorOnly = requireRole("doctor");
const staffOrAdmin = requireRole("system_admin", "hospital_admin", "doctor", "nurse");

// Any authenticated staff can fetch their own notifications
router.get("/", verifyToken, staffOrAdmin, getNotifications);

// Review request (System Admin → Hospital Admin)
router.post("/review-request", verifyToken, systemAdminOnly, createReviewRequest);
router.patch("/:id/accept", verifyToken, hospitalAdminOnly, acceptReviewRequest);
router.post("/:id/reject", verifyToken, hospitalAdminOnly, rejectReviewRequest);

// Discharge request (Doctor → Hospital Admin)
router.post("/discharge-request", verifyToken, doctorOnly, createDischargeRequest);
router.patch("/:id/accept-discharge", verifyToken, hospitalAdminOnly, acceptDischargeRequest);
router.post("/:id/reject-discharge", verifyToken, hospitalAdminOnly, rejectDischargeRequest);

// Read / delete (any staff can manage their own)
router.patch("/:id/read", verifyToken, staffOrAdmin, markRead);
router.patch("/read-all", verifyToken, staffOrAdmin, markAllRead);
router.delete("/:id", verifyToken, staffOrAdmin, deleteNotification);

module.exports = router;
