const router = require("express").Router();
const {
  createPatient, listPatients, getPatient, updatePatient, deletePatient, dischargePatient, addNote, listNotes, deleteNote,
} = require("../controllers/patients.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");
const requireHospitalAssignment = require("../middleware/requireHospitalAssignment");
const scopeQuery = require("../middleware/scopeQuery");

router.post("/", verifyToken, requireRole("hospital_admin", "doctor", "nurse"), requireHospitalAssignment, createPatient);
router.get("/", verifyToken, requireHospitalAssignment, scopeQuery, listPatients);
router.get("/:id", verifyToken, requireHospitalAssignment, getPatient);
// #9 FIX: Allow doctors and nurses to update patient records since they can admit them
router.put("/:id", verifyToken, requireRole("hospital_admin", "doctor", "nurse"), requireHospitalAssignment, updatePatient);
router.patch("/:id", verifyToken, requireRole("hospital_admin", "doctor", "nurse"), requireHospitalAssignment, updatePatient);
router.delete("/:id", verifyToken, requireRole("hospital_admin"), requireHospitalAssignment, deletePatient);
// #9 FIX: Allow doctors to discharge patients directly
router.patch("/:id/discharge", verifyToken, requireRole("hospital_admin", "doctor"), requireHospitalAssignment, dischargePatient);
// Notes: any hospital staff may read/write clinical notes, authors may delete their own notes
router.post("/:id/notes", verifyToken, requireHospitalAssignment, addNote);
router.get("/:id/notes", verifyToken, requireHospitalAssignment, listNotes);
router.delete("/:id/notes/:noteId", verifyToken, requireHospitalAssignment, deleteNote);

module.exports = router;
