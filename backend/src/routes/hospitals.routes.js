const router = require("express").Router();
const { createHospital, listHospitals, updateHospital, deleteHospital } = require("../controllers/hospitals.controller");
const Hospital = require("../models/Hospital");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

// Public endpoint: returns list of hospital names & IDs for the signup form
router.get("/public", async (req, res) => {
  try {
    const hospitals = await Hospital.find({}, "_id name").sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hospitals" });
  }
});

router.post("/", verifyToken, requireRole("system_admin"), createHospital);
router.get("/", verifyToken, requireRole("system_admin", "hospital_admin"), listHospitals);
router.patch("/:id", verifyToken, requireRole("system_admin", "hospital_admin"), updateHospital);
router.put("/:id", verifyToken, requireRole("system_admin", "hospital_admin"), updateHospital);
router.delete("/:id", verifyToken, requireRole("system_admin"), deleteHospital);

module.exports = router;

