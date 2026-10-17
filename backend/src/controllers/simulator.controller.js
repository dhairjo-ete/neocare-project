const {
  getSimulatorStatus,
  startTelemetrySimulator,
  stopTelemetrySimulator,
  setSimulationScenario,
} = require("../services/telemetrySimulator");

// GET /api/simulator/status
function getStatus(req, res) {
  res.json(getSimulatorStatus());
}

// POST /api/simulator/toggle
function toggleSimulator(req, res) {
  const io = req.app.get("io");
  const current = getSimulatorStatus();
  if (current.running) {
    stopTelemetrySimulator();
  } else {
    startTelemetrySimulator(io);
  }
  res.json(getSimulatorStatus());
}

// POST /api/simulator/scenario
function injectScenario(req, res) {
  const { scenario, deviceId } = req.body;
  setSimulationScenario(deviceId || "__all__", scenario);
  res.json({
    message: `Scenario '${scenario || "normal"}' applied to ${deviceId || "all beds"}.`,
    status: getSimulatorStatus(),
  });
}

module.exports = {
  getStatus,
  toggleSimulator,
  injectScenario,
};
