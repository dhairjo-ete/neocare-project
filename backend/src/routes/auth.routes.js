const router = require("express").Router();
const {
  registerHospitalAdmin,
  registerStaff,
  verifyEmail,
  login,
  magicAccess,
  getPendingApprovals,
  approveUser,
  rejectUser,
  firstTimeChangePassword,
} = require("../controllers/auth.controller");
const verifyToken = require("../middleware/verifyToken");

router.post("/register-hospital-admin", registerHospitalAdmin);
router.post("/register-staff", registerStaff);
router.get("/verify-email", verifyEmail);
router.post("/login", login);
router.post("/magic-access", magicAccess);
router.post("/first-time-password", verifyToken, firstTimeChangePassword);

const requireRole = require("../middleware/requireRole");

router.get("/pending-approvals", verifyToken, requireRole("system_admin", "hospital_admin"), getPendingApprovals);
// #3 FIX: Missing role guards on sensitive auth endpoints
router.post("/approve-user/:userId", verifyToken, requireRole("system_admin", "hospital_admin"), approveUser);
router.delete("/reject-user/:userId", verifyToken, requireRole("system_admin", "hospital_admin"), rejectUser);

module.exports = router;
