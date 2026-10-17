const router = require("express").Router();
const {
  createIncubator,
  listIncubators,
  updateIncubator,
  deleteIncubator,
  getActiveSimulationDevices,
  controlIncubator,
  toggleIncubatorStatus,
} = require("../controllers/incubators.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");
const requireHospitalAssignment = require("../middleware/requireHospitalAssignment");
const scopeQuery = require("../middleware/scopeQuery");
const requireSimulatorKey = require("../middleware/requireSimulatorKey");

// Dedicated endpoint for the Python simulator to discover which beds are
// occupied. Authenticated with a long-lived service key (X-Simulator-Key
// header), NOT a user JWT - see requireSimulatorKey.js for why.
router.get("/active-simulation-devices", requireSimulatorKey, getActiveSimulationDevices);

// Hardware-in-the-Loop (HIL) actuator control endpoint for clinical staff
router.post("/:id/control", verifyToken, requireRole("doctor", "nurse", "hospital_admin", "system_admin"), controlIncubator);

// Toggle incubator active/standby status and trigger telemetry simulator
router.post("/:id/toggle-status", verifyToken, requireRole("doctor", "nurse", "hospital_admin", "system_admin"), toggleIncubatorStatus);

router.post("/", verifyToken, requireRole("hospital_admin"), requireHospitalAssignment, createIncubator);
router.get("/", verifyToken, requireHospitalAssignment, scopeQuery, listIncubators);
router.patch("/:id", verifyToken, requireRole("hospital_admin"), updateIncubator);
router.put("/:id", verifyToken, requireRole("hospital_admin"), updateIncubator);
router.delete("/:id", verifyToken, requireRole("hospital_admin"), deleteIncubator);

module.exports = router;
