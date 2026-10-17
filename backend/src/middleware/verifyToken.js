const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies the JWT is authentic, then re-reads role/hospitalId/wardId fresh
// from the database on every request instead of trusting the token's payload
// for those fields. JWTs live for 7 days — if we trusted the snapshot taken
// at login, a system_admin reassigning someone's hospital (or a hospital
// being deleted/recreated during development) would have no effect until
// that person's existing token happened to expire. That silently scoped
// every request to a stale or dangling hospitalId, with no error anywhere:
// list endpoints just returned empty results forever, which is exactly what
// broke the Hospital In-Charge's Executive Overview page.
async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Patient / Guardian authentication handling
    if (decoded.role === "patient") {
      const Patient = require("../models/Patient");
      const patient = await Patient.findById(decoded.patientId || decoded.id).populate("hospitalId", "name");
      if (!patient) {
        return res.status(401).json({ error: "Patient record not found or no longer active." });
      }
      req.user = {
        id: decoded.id,
        name: decoded.name || patient.guardianName || patient.name,
        role: "patient",
        patientId: patient._id,
        hospitalId: patient.hospitalId?._id || patient.hospitalId || null,
        hospitalName: patient.hospitalId?.name || null,
        wardId: null,
      };
      return next();
    }

    const freshUser = await User.findById(decoded.id).select("name role hospitalId wardId isApproved isEmailVerified patientId");
    if (!freshUser) {
      return res.status(401).json({ error: "Account no longer exists. Please log in again." });
    }

    // #10 FIX: Re-check approval status on every request so admin-revoked accounts are locked immediately
    if (!freshUser.isApproved && freshUser.role !== "system_admin" && freshUser.role !== "patient") {
      return res.status(403).json({ error: "Your account is pending approval or has been suspended. Contact your administrator.", code: "AWAITING_APPROVAL" });
    }

    req.user = {
      id: decoded.id,
      name: freshUser.name,
      role: freshUser.role,
      hospitalId: freshUser.hospitalId || null,
      wardId: freshUser.wardId || null,
      patientId: freshUser.patientId || decoded.patientId || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = verifyToken;
