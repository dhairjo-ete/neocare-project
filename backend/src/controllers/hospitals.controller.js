const Hospital = require("../models/Hospital");
const User = require("../models/User");
const Ward = require("../models/Ward");
const { emitDataChange } = require("../sockets/socket");

// system_admin only - create hospital directly
async function createHospital(req, res) {
  // #18 FIX: Validate hospital name is not blank
  const name = req.body.name?.trim();
  const address = req.body.address?.trim() || "";
  if (!name) return res.status(400).json({ error: "Hospital name is required" });

  const hospital = await Hospital.create({ name, address });
  emitDataChange("hospital", "create", hospital);
  res.status(201).json(hospital);
}

// System admin sees every hospital; hospital_admin sees only their own
// (as a single-item array, so the response shape stays consistent for callers
// like the Executive Overview page that run the same query for both roles).
async function listHospitals(req, res) {
  if (req.user.role === "system_admin") {
    const hospitals = await Hospital.find().sort({ name: 1 });
    return res.json(hospitals);
  }

  if (!req.user.hospitalId) {
    return res.json([]);
  }

  const hospital = await Hospital.findById(req.user.hospitalId);
  res.json(hospital ? [hospital] : []);
}

// Public listing for staff signup dropdowns
async function listPublicHospitals(req, res) {
  try {
    const hospitals = await Hospital.find().select("_id name address").sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: "Failed to list hospitals" });
  }
}

// Update hospital (system_admin or hospital_admin for their own hospital)
async function updateHospital(req, res) {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });

    // Authorization: system_admin can update any hospital; hospital_admin can only update their own hospital
    if (req.user.role === "hospital_admin") {
      if (!req.user.hospitalId || String(req.user.hospitalId) !== String(hospital._id)) {
        return res.status(403).json({ error: "Access denied. Hospital In-Charge can only update their own hospital's details." });
      }
    } else if (req.user.role !== "system_admin") {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // #19 FIX: Trim and validate name on update
    if (req.body.name !== undefined) {
      const trimmedName = req.body.name.trim();
      if (!trimmedName) return res.status(400).json({ error: "Hospital name cannot be empty" });
      hospital.name = trimmedName;
    }
    if (req.body.address !== undefined) {
      hospital.address = req.body.address.trim();
    }

    await hospital.save();
    emitDataChange("hospital", "update", hospital);
    res.json(hospital);
  } catch (err) {
    res.status(500).json({ error: "Failed to update hospital" });
  }
}

// Delete hospital (system_admin only)
async function deleteHospital(req, res) {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });

    const Incubator = require("../models/Incubator");
    const Patient = require("../models/Patient");
    const [staffCount, wardCount, incubatorCount, activePatientCount] = await Promise.all([
      User.countDocuments({ hospitalId: hospital._id }),
      Ward.countDocuments({ hospitalId: hospital._id }),
      Incubator.countDocuments({ hospitalId: hospital._id }),
      Patient.countDocuments({ hospitalId: hospital._id, dischargedAt: null }),
    ]);

    if (staffCount > 0 || wardCount > 0 || incubatorCount > 0 || activePatientCount > 0) {
      return res.status(409).json({
        error: `Cannot delete "${hospital.name}": it still has ${staffCount} staff account(s), ${wardCount} NICU unit(s), ${incubatorCount} incubator(s), and ${activePatientCount} active patient(s) linked to it. Reassign or remove them first.`,
      });
    }

    await Hospital.findByIdAndDelete(req.params.id);
    emitDataChange("hospital", "delete", { id: req.params.id }, hospital._id);
    res.json({ message: "Hospital deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete hospital" });
  }
}

module.exports = { createHospital, listHospitals, listPublicHospitals, updateHospital, deleteHospital };


