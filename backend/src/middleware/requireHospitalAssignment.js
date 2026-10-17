// Blocks access until a user has been assigned to a hospital by an admin.
// system_admin bypasses this entirely (they aren't scoped to any single hospital).
function requireHospitalAssignment(req, res, next) {
  if (req.user.role === "system_admin") return next();

  if (!req.user.hospitalId) {
    return res.status(403).json({
      error: "Your account has not been assigned to a hospital yet. Contact your administrator.",
    });
  }
  next();
}

module.exports = requireHospitalAssignment;
