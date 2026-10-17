const router = require("express").Router();
const { getAlerts, acknowledgeAlert, notifyClinicalTeam } = require("../controllers/alerts.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

router.get("/", verifyToken, getAlerts);
router.patch("/:id/acknowledge", verifyToken, requireRole("system_admin", "hospital_admin", "doctor", "nurse"), acknowledgeAlert);
router.post("/:id/notify-team", verifyToken, requireRole("system_admin", "hospital_admin"), notifyClinicalTeam);

module.exports = router;

