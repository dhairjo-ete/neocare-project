const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { emitDataChange } = require("../sockets/socket");

// Lists hospital staff and admins pending assignment,
// or all users within the caller's hospital if not a system_admin.
// Excludes system_admin accounts from being listed for hospital assignments.
async function listUsers(req, res) {
  const query = req.user.role === "system_admin"
    ? { role: { $ne: "system_admin" } }
    : { hospitalId: req.user.hospitalId, role: { $ne: "system_admin" } };

  const users = await User.find(query)
    .populate("hospitalId", "name")
    .populate("wardId", "name")
    .select("-passwordHash")
    .sort({ createdAt: -1 });
  res.json(users);
}

// system_admin assigns a user to a hospital.
// hospital_admin assigns a user already in their hospital to a ward.
async function assignUser(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  // Safety protection: System Administrators can NEVER be assigned to a hospital or demoted
  if (target.role === "system_admin" || target.email === "admin.neocare@gmail.com") {
    return res.status(400).json({ error: "Cannot modify or reassign a System Administrator." });
  }

  // #13 FIX: Prevent any admin from modifying their own assignment/role
  if (String(target._id) === String(req.user.id)) {
    return res.status(400).json({ error: "You cannot modify your own account role or assignment through this endpoint." });
  }

  if (req.user.role === "system_admin") {
    const { hospitalId, role } = req.body;
    if (hospitalId !== undefined) {
      if (hospitalId) {
        const Hospital = require("../models/Hospital");
        if (!require("mongoose").isValidObjectId(hospitalId) || !(await Hospital.exists({ _id: hospitalId }))) {
          return res.status(400).json({ error: "Selected hospital does not exist" });
        }
      }
      if (String(target.hospitalId) !== String(hospitalId)) {
        target.wardId = null; // #10 FIX: Clear old ward assignment when moving hospitals
      }
      target.hospitalId = hospitalId || null;
    }
    // Only update role if explicitly provided and valid (must not be system_admin)
    if (role && ["hospital_admin", "doctor", "nurse"].includes(role)) {
      target.role = role;
    }
  } else if (req.user.role === "hospital_admin") {
    if (String(target.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "That user is not in your hospital" });
    }
    // A hospital admin manages doctors and nurses only; assigning a ward to a
    // fellow admin used to silently demote them to nurse.
    if (!["doctor", "nurse"].includes(target.role)) {
      return res.status(403).json({ error: "Hospital In-Charge accounts cannot be re-assigned through this endpoint." });
    }
    const { wardId } = req.body;
    if (wardId !== undefined) {
      const { wardBelongsToHospital } = require("../utils/wardGuard");
      if (!(await wardBelongsToHospital(wardId, req.user.hospitalId))) {
        return res.status(400).json({ error: "Selected NICU does not belong to your hospital" });
      }
      target.wardId = wardId || null;
    }
  } else {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  await target.save();
  emitDataChange("user", "assign", target);
  res.json({ id: target._id, name: target.name, role: target.role, hospitalId: target.hospitalId, wardId: target.wardId });
}

// Update user details (name, email, phone, licenseNumber, wardId, role) - hospital_admin only for staff
async function updateUser(req, res) {
  try {
    if (req.user.role === "system_admin") {
      return res.status(403).json({ error: "System Admin cannot directly modify hospital staff. Please send a Review Request to the Hospital In-Charge." });
    }

    const { id } = req.params;
    const { name, email, phone, licenseNumber, wardId, role } = req.body;
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.role === "system_admin" || target.email === "admin.neocare@gmail.com") {
      return res.status(400).json({ error: "Cannot modify System Administrator accounts." });
    }

    if (String(target.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "You can only edit staff in your hospital" });
    }

    // #12 FIX: Admin cannot modify their own role/ward via staff endpoints
    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ error: "You cannot modify your own privileges here. Use the profile endpoint." });
    }

    // Peers: one Hospital In-Charge cannot edit another's account
    if (target.role === "hospital_admin") {
      return res.status(403).json({ error: "You cannot edit another Hospital In-Charge account." });
    }

    if (name) target.name = name.trim();

    if (email && email.trim().toLowerCase() !== target.email.toLowerCase()) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({ email: cleanEmail, _id: { $ne: target._id } });
      if (existingEmail) {
        return res.status(409).json({ error: "Email address is already registered to another account." });
      }
      target.email = cleanEmail;
    }

    if (phone !== undefined) {
      const cleanPhone = phone.trim();
      if (cleanPhone !== "" && cleanPhone !== target.phone) {
        const existingPhone = await User.findOne({ phone: cleanPhone, _id: { $ne: target._id } });
        if (existingPhone) {
          return res.status(409).json({ error: "Phone number is already registered to another account." });
        }
      }
      target.phone = cleanPhone;
    }

    if (licenseNumber !== undefined) target.licenseNumber = licenseNumber.trim();
    if (wardId !== undefined) {
      const { wardBelongsToHospital } = require("../utils/wardGuard");
      if (!(await wardBelongsToHospital(wardId, req.user.hospitalId))) {
        return res.status(400).json({ error: "Selected NICU does not belong to your hospital" });
      }
      target.wardId = wardId || null;
    }
    // Hospital In-Charge accounts keep their role; only staff roles can be changed here
    if (role && ["doctor", "nurse"].includes(role) && ["doctor", "nurse"].includes(target.role)) target.role = role;

    if (req.body.password && req.body.password.trim()) {
      if (req.body.password.trim().length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
      }
      target.passwordHash = await bcrypt.hash(req.body.password.trim(), 10);
    }

    await target.save();
    emitDataChange("user", "update", target);
    res.json(target);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update user" });
  }
}

// Delete user account - hospital_admin only for staff
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.role === "system_admin" || target.email === "admin.neocare@gmail.com") {
      return res.status(400).json({ error: "Cannot delete System Administrator accounts." });
    }

    if (req.user.role === "system_admin") {
      // Offboarding path: the only account a System Admin may remove is a
      // Hospital In-Charge, and only when the hospital has no admitted patients.
      // Without this, a hospital with an approved admin could never be deleted.
      if (target.role !== "hospital_admin") {
        return res.status(403).json({ error: "System Admin cannot directly delete hospital staff. Please send a Review Request to the Hospital In-Charge." });
      }
      const PatientModel = require("../models/Patient");
      const admitted = target.hospitalId
        ? await PatientModel.countDocuments({ hospitalId: target.hospitalId, dischargedAt: null })
        : 0;
      if (admitted > 0) {
        return res.status(409).json({
          error: `Cannot remove this Hospital In-Charge: ${admitted} patient(s) are still admitted in their hospital. Discharge them first.`,
        });
      }
      await User.findByIdAndDelete(id);
      emitDataChange("user", "delete", { id }, target.hospitalId);
      return res.json({ message: `Hospital In-Charge ${target.name} removed. The hospital can now be reassigned or deleted once its remaining staff are removed.` });
    }

    if (String(target.hospitalId) !== String(req.user.hospitalId)) {
      return res.status(403).json({ error: "You can only delete staff in your hospital" });
    }

    // #12 FIX: Admin cannot delete themselves via staff endpoints
    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    // Peers: Hospital In-Charge cannot delete another Hospital In-Charge
    if (target.role === "hospital_admin") {
      return res.status(403).json({
        error: "You cannot delete another Hospital In-Charge account. Institutional administration changes must be coordinated via formal governance review."
      });
    }

    // Clinical Requirement: Doctor or Nurse cannot be deleted if assigned to active patients
    const Patient = require("../models/Patient");
    const activeAssignedPatients = await Patient.find({
      $or: [
        { assignedDoctor: target._id },
        { assignedNurse: target._id },
      ],
      dischargedAt: null,
    });

    if (activeAssignedPatients.length > 0) {
      const patientList = activeAssignedPatients.map((p) => `"${p.name}"`).join(", ");
      return res.status(409).json({
        error: `Cannot delete ${target.role === "doctor" ? "Doctor" : "Staff"} "${target.name}": currently assigned to ${activeAssignedPatients.length} active patient(s) (${patientList}). Please reassign or unassign their patients before deleting this account.`
      });
    }

    await User.findByIdAndDelete(id);
    emitDataChange("user", "delete", { id }, target.hospitalId);
    res.json({ message: `Staff member ${target.name} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete user" });
  }
}

// Fetch logged-in user's own profile
async function getMyProfile(req, res) {
  try {
    if (req.user.role === "patient") {
      const Patient = require("../models/Patient");
      const patient = await Patient.findById(req.user.patientId || req.user.id).populate("hospitalId", "name address");
      if (!patient) return res.status(404).json({ error: "Patient record not found" });
      return res.json({
        _id: patient._id,
        name: patient.guardianName || "Guardian",
        patientName: patient.name,
        role: "patient",
        patientId: patient._id,
        hospitalId: patient.hospitalId,
        isApproved: true,
        isEmailVerified: true,
      });
    }

    const user = await User.findById(req.user.id)
      .populate("hospitalId", "name address")
      .populate("wardId", "name")
      .select("-passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch profile" });
  }
}

// Update logged-in user's own profile info & optional password
async function updateMyProfile(req, res) {
  try {
    const bcrypt = require("bcryptjs");
    const { name, phone, licenseNumber, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name) user.name = name.trim();
    if (phone !== undefined) {
      const cleanPhone = phone.trim();
      if (cleanPhone !== "" && cleanPhone !== user.phone) {
        const existingPhone = await User.findOne({ phone: cleanPhone, _id: { $ne: user._id } });
        if (existingPhone) {
          return res.status(409).json({ error: "Phone number is already registered to another account." });
        }
      }
      user.phone = cleanPhone;
    }
    if (licenseNumber !== undefined) user.licenseNumber = licenseNumber.trim();

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to change password." });
      }
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(400).json({ error: "Incorrect current password." });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.mustChangePassword = false;
    }

    await user.save();

    const updated = await User.findById(user._id)
      .populate("hospitalId", "name address")
      .populate("wardId", "name")
      .select("-passwordHash");

    emitDataChange("user", "update", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update profile" });
  }
}

module.exports = { listUsers, assignUser, updateUser, deleteUser, getMyProfile, updateMyProfile };


