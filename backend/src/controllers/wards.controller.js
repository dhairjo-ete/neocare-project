const Ward = require("../models/Ward");
const { emitDataChange } = require("../sockets/socket");

// Only Hospital In-Charge (hospital_admin) creates NICU wards — system_admin
// is a platform-level role and does not provision hospital equipment.
async function createWard(req, res) {
  if (req.user.role === "system_admin") {
    return res.status(403).json({ error: "NICU wards must be created by the respective Hospital In-Charge." });
  }

  const { name, status } = req.body;
  const hospitalId = req.user.hospitalId;

  if (!hospitalId) {
    return res.status(400).json({ error: "Hospital assignment is required to create a NICU" });
  }

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "NICU name is required" });
  }

  const ward = await Ward.create({
    hospitalId,
    name: name.trim(),
    status: status && ["online", "maintenance", "offline"].includes(status) ? status : "online",
  });

  emitDataChange("ward", "create", ward);
  res.status(201).json(ward);
}

async function listWards(req, res) {
  const wards = await Ward.find(req.scope).populate("hospitalId", "name").sort({ name: 1 });
  res.json(wards);
}

// Update NICU (hospital_admin for their hospital only)
async function updateWard(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly modify hospital NICUs. Please send a Review Request to the Hospital In-Charge." });
    }

    const { name, status } = req.body;
    const ward = await Ward.findById(req.params.id);
    if (!ward) return res.status(404).json({ error: "NICU not found" });

    if (String(ward.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this NICU" });
    }

    if (name) ward.name = name.trim();
    if (status && ["online", "maintenance", "offline"].includes(status)) ward.status = status;

    await ward.save();
    emitDataChange("ward", "update", ward);
    res.json(ward);
  } catch (err) {
    res.status(500).json({ error: "Failed to update NICU" });
  }
}

// Delete NICU (hospital_admin for their hospital only)
async function deleteWard(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly delete hospital NICUs. Please send a Review Request to the Hospital In-Charge." });
    }

    const ward = await Ward.findById(req.params.id);
    if (!ward) return res.status(404).json({ error: "NICU not found" });

    if (String(ward.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "Access denied to this NICU" });
    }

    // Block deletion if any incubator in this ward has an active patient
    const Incubator = require("../models/Incubator");
    const Patient = require("../models/Patient");

    const wardIncubators = await Incubator.find({ wardId: ward._id });

    if (wardIncubators.length > 0) {
      const incubatorIds = wardIncubators.map((i) => i._id);
      const activePatient = await Patient.findOne({
        incubatorId: { $in: incubatorIds },
        dischargedAt: null,
      }).populate("incubatorId", "label deviceTopicId");

      if (activePatient) {
        const bedLabel = activePatient.incubatorId?.label || activePatient.incubatorId?.deviceTopicId || "a bed";
        return res.status(409).json({
          error: `Cannot delete NICU "${ward.name}": patient "${activePatient.name}" is currently admitted in "${bedLabel}". Discharge all patients first.`,
        });
      }

      return res.status(409).json({
        error: `Cannot delete NICU "${ward.name}": it still has ${wardIncubators.length} incubator(s) linked to it. Remove all incubators first.`,
      });
    }

    await Ward.findByIdAndDelete(req.params.id);
    
    // #10 FIX: Remove dangling references from users
    const User = require("../models/User");
    await User.updateMany({ wardId: ward._id }, { wardId: null });
    
    emitDataChange("ward", "delete", { id: req.params.id }, ward.hospitalId);
    res.json({ message: "NICU deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete NICU" });
  }
}

module.exports = { createWard, listWards, updateWard, deleteWard };
