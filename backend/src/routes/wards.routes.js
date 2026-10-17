const router = require("express").Router();
const { createWard, listWards, updateWard, deleteWard } = require("../controllers/wards.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");
const requireHospitalAssignment = require("../middleware/requireHospitalAssignment");
const scopeQuery = require("../middleware/scopeQuery");

router.post("/", verifyToken, requireRole("hospital_admin"), requireHospitalAssignment, createWard);
router.get("/", verifyToken, requireHospitalAssignment, scopeQuery, listWards);
router.patch("/:id", verifyToken, requireRole("hospital_admin"), updateWard);
router.put("/:id", verifyToken, requireRole("hospital_admin"), updateWard);
router.delete("/:id", verifyToken, requireRole("hospital_admin"), deleteWard);

module.exports = router;

