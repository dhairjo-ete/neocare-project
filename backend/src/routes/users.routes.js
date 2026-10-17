const router = require("express").Router();
const { listUsers, assignUser, updateUser, deleteUser, getMyProfile, updateMyProfile } = require("../controllers/users.controller");
const verifyToken = require("../middleware/verifyToken");
const requireRole = require("../middleware/requireRole");

router.get("/me", verifyToken, getMyProfile);
router.patch("/me", verifyToken, updateMyProfile);

router.get("/", verifyToken, requireRole("system_admin", "hospital_admin"), listUsers);
router.patch("/:id/assign", verifyToken, requireRole("system_admin", "hospital_admin"), assignUser);
router.put("/:id", verifyToken, requireRole("system_admin", "hospital_admin"), updateUser);
router.patch("/:id", verifyToken, requireRole("system_admin", "hospital_admin"), updateUser);
router.delete("/:id", verifyToken, requireRole("system_admin", "hospital_admin"), deleteUser);

module.exports = router;
