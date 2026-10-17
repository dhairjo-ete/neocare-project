const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getStatus, toggleSimulator, injectScenario } = require("../controllers/simulator.controller");

// Status can be queried by authenticated staff or health checks
router.get("/status", verifyToken, getStatus);
router.post("/toggle", verifyToken, toggleSimulator);
router.post("/scenario", verifyToken, injectScenario);

module.exports = router;
