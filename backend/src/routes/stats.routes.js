const router = require("express").Router();
const Hospital = require("../models/Hospital");
const Ward = require("../models/Ward");
const Incubator = require("../models/Incubator");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Alert = require("../models/Alert");
const verifyToken = require("../middleware/verifyToken");

// Public endpoint: returns live system stats for the home page
router.get("/", async (req, res) => {
  try {
    const [hospitals, doctors, nurses] = await Promise.all([
      Hospital.countDocuments(),
      User.countDocuments({ role: "doctor", isApproved: true }),
      User.countDocuments({ role: "nurse", isApproved: true }),
    ]);
    res.json({ hospitals, doctors, nurses });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// Authenticated endpoint: returns Executive Cross-Hospital & Ward Occupancy Overview
router.get("/overview", verifyToken, async (req, res) => {
  try {
    const filter = req.user.role === "system_admin" ? {} : { hospitalId: req.user.hospitalId };

    const [
      totalHospitals,
      totalWards,
      totalIncubators,
      activeIncubators,
      maintenanceIncubators,
      offlineIncubators,
      totalActivePatients,
      unacknowledgedAlerts,
      allWards,
    ] = await Promise.all([
      Hospital.countDocuments(req.user.role === "system_admin" ? {} : { _id: req.user.hospitalId }),
      Ward.countDocuments(filter),
      Incubator.countDocuments(filter),
      Incubator.countDocuments({ ...filter, status: "active" }),
      Incubator.countDocuments({ ...filter, status: "maintenance" }),
      Incubator.countDocuments({ ...filter, status: "offline" }),
      Patient.countDocuments({ ...filter, dischargedAt: null }),
      Alert.countDocuments({ ...filter, acknowledged: false }),
      Ward.find(filter).populate("hospitalId", "name"),
    ]);

    const occupancyRate = totalIncubators > 0
      ? Math.round((totalActivePatients / totalIncubators) * 100)
      : 0;

    // Build per-ward overview
    const wardBreakdown = await Promise.all(
      allWards.map(async (ward) => {
        const wardIncubators = await Incubator.find({ wardId: ward._id });
        const incIds = wardIncubators.map((i) => i._id);
        const activePatientsCount = await Patient.countDocuments({ incubatorId: { $in: incIds }, dischargedAt: null });
        return {
          id: ward._id,
          name: ward.name,
          hospitalName: ward.hospitalId?.name || "Hospital",
          totalIncubators: wardIncubators.length,
          occupiedIncubators: activePatientsCount,
          availableIncubators: Math.max(0, wardIncubators.length - activePatientsCount),
          occupancyRate: wardIncubators.length > 0 ? Math.round((activePatientsCount / wardIncubators.length) * 100) : 0,
        };
      })
    );

    res.json({
      totalHospitals,
      totalWards,
      totalIncubators,
      activeIncubators,
      maintenanceIncubators,
      offlineIncubators,
      totalActivePatients,
      occupancyRate,
      unacknowledgedAlerts,
      wardBreakdown,
    });
  } catch (err) {
    console.error("[stats/overview]", err);
    res.status(500).json({ error: "Failed to fetch executive overview stats" });
  }
});

module.exports = router;

