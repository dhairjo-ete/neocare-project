const mongoose = require("mongoose");
const Incubator = require("../models/Incubator");
const Ward = require("../models/Ward");
const Patient = require("../models/Patient");
const { emitDataChange } = require("../sockets/socket");
const { publishControlCommand } = require("../config/mqtt");

// Turns a human-typed incubator name (e.g. "Bay 3 — South") into an MQTT-safe
// topic segment (e.g. "bay_3_south"). The name and the MQTT device topic ID
// are treated as ONE identity — staff only ever type the name once.
const crypto = require("crypto");

function slugify(str) {
  const base = String(str)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "incubator";
  // #8 FIX: Append a short random hash to prevent deleted incubators from bleeding old vitals into new ones with the same name
  return `${base}_${crypto.randomBytes(3).toString("hex")}`;
}

// Ensures the generated deviceTopicId is unique across all incubators
// (MQTT topics must not collide), appending _2, _3, ... if needed.
// `excludeId` lets renames skip clashing with the incubator's own prior value.
async function generateUniqueDeviceTopicId(name, excludeId) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const query = { deviceTopicId: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const clash = await Incubator.findOne(query);
    if (!clash) return candidate;
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

// Only Hospital In-Charge (hospital_admin) creates Incubators — system_admin
// is a platform-level role and does not provision hospital equipment.
async function createIncubator(req, res) {
  if (req.user.role === "system_admin") {
    return res.status(403).json({ error: "Incubators must be provisioned by the respective Hospital In-Charge." });
  }

  const { wardId, name } = req.body;

  if (!wardId || !name || !name.trim()) {
    return res.status(400).json({ error: "NICU and incubator name are required" });
  }

  const ward = await Ward.findById(wardId);
  if (!ward) return res.status(404).json({ error: "NICU not found" });

  if (String(ward.hospitalId) !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "That NICU does not belong to your hospital" });
  }

  const deviceTopicId = await generateUniqueDeviceTopicId(name);

  const incubator = await Incubator.create({
    hospitalId: ward.hospitalId,
    wardId: ward._id,
    deviceTopicId,
    label: name.trim(),
    status: "active",
  });

  emitDataChange("incubator", "create", incubator);
  res.status(201).json(incubator);
}

async function listIncubators(req, res) {
  const incubators = await Incubator.find(req.scope)
    .populate("wardId", "name")
    .populate("hospitalId", "name")
    .sort({ label: 1 });
  res.json(incubators);
}

// Update Incubator (hospital_admin for their hospital only)
async function updateIncubator(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly modify hospital incubators. Please send a Review Request to the Hospital In-Charge." });
    }

    const { name, status, wardId } = req.body;
    const incubator = await Incubator.findById(req.params.id);
    if (!incubator) return res.status(404).json({ error: "Incubator not found" });

    if (String(incubator.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this incubator" });
    }

    // #8 FIX: Block status change to maintenance/offline if an active patient is admitted
    if (status && status !== "active" && status !== incubator.status) {
      const activePatient = await Patient.findOne({ incubatorId: incubator._id, dischargedAt: null });
      if (activePatient) {
        return res.status(409).json({
          error: `Cannot set Incubator "${incubator.label || incubator.deviceTopicId}" to "${status}": patient "${activePatient.name}" is currently admitted here. Please shift patient "${activePatient.name}" to another active incubator first before changing device status.`,
        });
      }
    }

    if (name !== undefined && name.trim()) {
      incubator.label = name.trim();
    }
    if (status !== undefined) incubator.status = status;
    if (wardId !== undefined) {
      const { wardBelongsToHospital } = require("../utils/wardGuard");
      if (!wardId || !(await wardBelongsToHospital(wardId, incubator.hospitalId))) {
        return res.status(400).json({ error: "Selected NICU does not belong to this hospital" });
      }
      incubator.wardId = wardId;
    }

    await incubator.save();

    const { invalidateIncubatorCache } = require("../config/mqtt");
    invalidateIncubatorCache(incubator.deviceTopicId);

    emitDataChange("incubator", "update", incubator);
    res.json(incubator);
  } catch (err) {
    res.status(500).json({ error: "Failed to update incubator" });
  }
}

// Delete Incubator (hospital_admin for their hospital only)
async function deleteIncubator(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly delete hospital incubators. Please send a Review Request to the Hospital In-Charge." });
    }

    const incubator = await Incubator.findById(req.params.id);
    if (!incubator) return res.status(404).json({ error: "Incubator not found" });

    if (String(incubator.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this incubator" });
    }

    // Block deletion if an active patient is currently in this incubator
    const activePatient = await Patient.findOne({ incubatorId: incubator._id, dischargedAt: null });
    if (activePatient) {
      return res.status(409).json({
        error: `Cannot delete incubator "${incubator.label || incubator.deviceTopicId}": patient "${activePatient.name}" is currently admitted. Discharge the patient first.`,
      });
    }

    await Incubator.findByIdAndDelete(req.params.id);
    emitDataChange("incubator", "delete", { id: req.params.id }, incubator.hospitalId);
    res.json({ message: "Incubator deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete incubator" });
  }
}

// Get all active incubators that currently have an actively admitted patient (for simulator & IoT telemetry)
async function getActiveSimulationDevices(req, res) {
  try {
    const activePatients = await Patient.find({ dischargedAt: null })
      .populate("incubatorId")
      .populate("assignedDoctor assignedNurse", "name");

    const activeList = [];
    for (const p of activePatients) {
      if (p.incubatorId && p.incubatorId.status === "active") {
        activeList.push({
          deviceTopicId: p.incubatorId.deviceTopicId,
          incubatorId: p.incubatorId._id,
          label: p.incubatorId.label || p.incubatorId.deviceTopicId,
          status: p.incubatorId.status,
          controlSettings: p.incubatorId.controlSettings || { targetTemperature: 37.0, oxygenFlow: 2.0, phototherapy: false },
          hospitalId: p.hospitalId,
          wardId: p.incubatorId.wardId,
          patient: {
            id: p._id,
            name: p.name,
            primarySyndrome: p.primarySyndrome || "",
            gestationalAgeWeeks: p.gestationalAgeWeeks,
            birthWeightGrams: p.birthWeightGrams,
            biologicalSex: p.biologicalSex,
            bloodType: p.bloodType,
            admittedAt: p.admittedAt,
            assignedDoctor: p.assignedDoctor?.name || "NICU Care Team",
            assignedNurse: p.assignedNurse?.name || null,
          },
        });
      }
    }

    const allIncubators = await Incubator.find().select("deviceTopicId label status hospitalId wardId controlSettings");

    res.json({
      activeSimulations: activeList,
      activeDeviceTopicIds: activeList.map((a) => a.deviceTopicId),
      allIncubators,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active simulation devices", message: err.message });
  }
}

/**
 * Hardware-in-the-Loop (HIL) Actuation Control Endpoint
 * Allows clinicians to adjust incubator chamber temperature, oxygen flow, and phototherapy.
 * Dispatches MQTT message to neocare/{deviceTopicId}/control and emits Socket.io event.
 */
async function controlIncubator(req, res) {
  try {
    const { id } = req.params;
    const { targetTemperature, oxygenFlow, phototherapy } = req.body;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id }
      : { deviceTopicId: id };

    const incubator = await Incubator.findOne(query);
    if (!incubator) {
      return res.status(404).json({ error: "Incubator not found" });
    }

    // Role hospital scoping guard
    if (req.user.role !== "system_admin" && incubator.hospitalId.toString() !== req.user.hospitalId?.toString()) {
      return res.status(403).json({ error: "Forbidden - Incubator belongs to another hospital facility" });
    }

    const newSettings = {
      targetTemperature: incubator.controlSettings?.targetTemperature ?? 37.0,
      oxygenFlow: incubator.controlSettings?.oxygenFlow ?? 2.0,
      phototherapy: incubator.controlSettings?.phototherapy ?? false,
      lastUpdatedBy: req.user._id || req.user.id,
      lastUpdatedAt: new Date(),
    };

    if (targetTemperature !== undefined) {
      const t = Number(targetTemperature);
      if (isNaN(t) || t < 34.0 || t > 39.0) {
        return res.status(400).json({ error: "Target temperature must be between 34.0°C and 39.0°C" });
      }
      newSettings.targetTemperature = Math.round(t * 10) / 10;
    }

    if (oxygenFlow !== undefined) {
      const o2 = Number(oxygenFlow);
      if (isNaN(o2) || o2 < 1.0 || o2 > 10.0) {
        return res.status(400).json({ error: "Oxygen flow rate must be between 1.0 and 10.0 L/min" });
      }
      newSettings.oxygenFlow = Math.round(o2 * 10) / 10;
    }

    if (phototherapy !== undefined) {
      newSettings.phototherapy = Boolean(phototherapy);
    }

    incubator.controlSettings = newSettings;
    await incubator.save();

    // 1. Dispatch over MQTT to hardware / simulator
    const mqttPayload = {
      command: "set_parameters",
      device_id: incubator.deviceTopicId,
      targetTemperature: newSettings.targetTemperature,
      oxygenFlow: newSettings.oxygenFlow,
      phototherapy: newSettings.phototherapy,
      updatedBy: req.user.name || "Medical Staff",
      timestamp: new Date().toISOString(),
    };
    publishControlCommand(incubator.deviceTopicId, mqttPayload);

    // Apply directly to the built-in continuous digital twin
    const { applyTwinActuators } = require("../services/telemetrySimulator");
    applyTwinActuators(incubator.deviceTopicId, newSettings);

    // 2. Broadcast live event via WebSockets so all clinical dashboards update immediately
    const io = req.app.get("io");
    if (io) {
      io.to(`room:hospital:${incubator.hospitalId}`)
        .to("room:system_admin")
        .emit("incubator:control_updated", {
          incubatorId: incubator._id,
          deviceTopicId: incubator.deviceTopicId,
          controlSettings: newSettings,
          updatedBy: req.user.name || "Medical Staff",
        });
    }

    // 3. Emit standard data change event for data sync hook
    emitDataChange("incubator", "update", incubator, incubator.hospitalId);

    res.json({
      success: true,
      message: `Settings dispatched to ${incubator.label || incubator.deviceTopicId}`,
      controlSettings: newSettings,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to dispatch incubator controls", message: err.message });
  }
}

// Toggle Incubator Active/Maintenance Status & Trigger Live Telemetry Simulator
async function toggleIncubatorStatus(req, res) {
  try {
    const { id } = req.params;

    // Flexible lookup: ObjectId, exact deviceTopicId, or label
    let query;
    if (mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id) {
      query = { $or: [{ _id: id }, { deviceTopicId: id }] };
    } else {
      query = {
        $or: [
          { deviceTopicId: id },
          { deviceTopicId: new RegExp(`^${id}$`, "i") },
          { label: id },
        ],
      };
    }

    const incubator = await Incubator.findOne(query);
    if (!incubator) {
      return res.status(404).json({ error: "Incubator not found", message: `No incubator found matching '${id}'` });
    }

    // Role check: hospital staff can only control their hospital's incubators
    const incHospId = incubator.hospitalId?._id ? String(incubator.hospitalId._id) : (incubator.hospitalId ? String(incubator.hospitalId) : null);
    const userHospId = req.user?.hospitalId?._id ? String(req.user.hospitalId._id) : (req.user?.hospitalId ? String(req.user.hospitalId) : null);

    if (req.user?.role !== "system_admin" && incHospId && userHospId && incHospId !== userHospId) {
      return res.status(403).json({ error: "Forbidden - Incubator belongs to another hospital facility" });
    }

    const newStatus = incubator.status === "active" ? "maintenance" : "active";

    // Use findByIdAndUpdate to safely update ONLY the status without triggering schema validation on legacy docs
    const updatedIncubator = await Incubator.findByIdAndUpdate(
      incubator._id,
      { $set: { status: newStatus } },
      { new: true }
    );

    // Invalidate MQTT cache
    try {
      const { invalidateIncubatorCache } = require("../config/mqtt");
      invalidateIncubatorCache(updatedIncubator.deviceTopicId);
    } catch (e) {}

    // Ensure backend simulator engine is running and trigger an immediate tick
    try {
      const { startTelemetrySimulator, getSimulatorStatus, triggerTickNow } = require("../services/telemetrySimulator");
      const simStatus = getSimulatorStatus();
      const io = req.app.get("io");
      if (io && (!simStatus.running || newStatus === "active")) {
        startTelemetrySimulator(io);
      }
      if (typeof triggerTickNow === "function") {
        triggerTickNow();
      }
    } catch (e) {}

    // Emit live sync event
    try {
      emitDataChange("incubator", "update", updatedIncubator, updatedIncubator.hospitalId);
    } catch (e) {}

    res.json({
      success: true,
      incubator: updatedIncubator,
      status: updatedIncubator.status,
      message: `Incubator ${updatedIncubator.label || updatedIncubator.deviceTopicId} is now ${updatedIncubator.status.toUpperCase()}`,
    });
  } catch (err) {
    console.error("[incubators] toggleIncubatorStatus error:", err);
    res.status(500).json({ error: "Failed to update incubator status", message: err.message });
  }
}

module.exports = {
  createIncubator,
  listIncubators,
  updateIncubator,
  deleteIncubator,
  getActiveSimulationDevices,
  controlIncubator,
  toggleIncubatorStatus,
};



