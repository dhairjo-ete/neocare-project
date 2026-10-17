const router = require("express").Router();
const {
  getActiveAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleActive,
  deleteAnnouncement,
} = require("../controllers/announcement.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

const adminOnly = requireRole("system_admin", "hospital_admin");

// Active announcements for top marquee banner (all authenticated users)
router.get("/active", verifyToken, getActiveAnnouncements);

// Management routes for Admins
router.get("/", verifyToken, adminOnly, getAllAnnouncements);
router.post("/", verifyToken, adminOnly, createAnnouncement);
router.put("/:id", verifyToken, adminOnly, updateAnnouncement);
router.patch("/:id/toggle", verifyToken, adminOnly, toggleActive);
router.delete("/:id", verifyToken, adminOnly, deleteAnnouncement);

module.exports = router;
