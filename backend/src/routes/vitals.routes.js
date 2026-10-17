const router = require("express").Router();
const {
  getLatest,
  getHistory,
  getDevices,
  getStats,
  getPatientVitals,
  getPatientVitalsStats,
} = require("../controllers/vitals.controller");
const verifyToken = require("../middleware/verifyToken");

router.get("/devices", verifyToken, getDevices);
router.get("/patient/:patientId/stats", verifyToken, getPatientVitalsStats);
router.get("/patient/:patientId", verifyToken, getPatientVitals);
router.get("/:deviceId/latest", verifyToken, getLatest);
router.get("/:deviceId/stats", verifyToken, getStats);
router.get("/:deviceId", verifyToken, getHistory);

module.exports = router;

