const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const Notification = require("../models/Notification");
const { generateVerificationToken, sendVerificationEmail, sendStaffWelcomeEmail } = require("../services/emailService");
const { emitNotification, emitDataChange } = require("../sockets/socket");


// 1. Register Hospital Admin + Create Hospital Record
async function registerHospitalAdmin(req, res) {
  try {
    const { hospitalName, hospitalAddress, adminName, adminEmail, adminPhone, password } = req.body;

    if (!hospitalName || !adminName || !adminEmail || !adminPhone || !password) {
      return res.status(400).json({ error: "All required fields must be provided" });
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    const cleanPhone = adminPhone ? adminPhone.trim() : "";

    const existingEmailUser = await User.findOne({ email: cleanEmail });
    if (existingEmailUser) {
      return res.status(409).json({ error: "Email address is already registered to another account." });
    }

    if (cleanPhone) {
      const existingPhoneUser = await User.findOne({ phone: cleanPhone });
      if (existingPhoneUser) {
        return res.status(409).json({ error: "Phone number is already registered to another account." });
      }
    }

    // #11 FIX: Do not allow reusing an existing hospital name to prevent hijacking
    const existingHospital = await Hospital.findOne({ name: hospitalName.trim() });
    if (existingHospital) {
      return res.status(409).json({ error: "A hospital with this exact name is already registered." });
    }

    const hospital = await Hospital.create({
      name: hospitalName.trim(),
      address: hospitalAddress || "Hospital Address",
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const token = generateVerificationToken();
    const tokenExpires = new Date(Date.now() + 24 * 3600 * 1000); // 24 hours

    const user = await User.create({
      name: adminName,
      email: adminEmail,
      phone: adminPhone.trim(),
      passwordHash,
      role: "hospital_admin",
      hospitalId: hospital._id,
      isEmailVerified: false,
      isApproved: false,
      verificationToken: token,
      verificationTokenExpires: tokenExpires,
    });

    const emailResult = await sendVerificationEmail({
      toEmail: adminEmail,
      recipientName: adminName,
      role: "hospital_admin",
      hospitalName: hospital.name,
      token,
    });

    // Notify system_admin of new hospital in-charge registration
    try {
      const notif = await Notification.create({
        targetRole: "system_admin",
        hospitalId: hospital._id,
        type: "new_hospital_admin",
        title: "New Hospital In-Charge Registration",
        message: `${adminName} has registered as Hospital In-Charge for "${hospital.name}" and is awaiting approval.`,
        triggeredBy: user._id,
        metadata: {
          role: "hospital_admin",
          userName: adminName,
          userId: user._id,
          hospitalName: hospital.name,
        },
      });
      emitNotification(notif.toObject());
    } catch (e) {
      console.warn("[notification] Could not create notification:", e.message);
    }

    res.status(201).json({
      message: emailResult.emailSent
        ? "Hospital In-Charge registered. Verification email sent."
        : `Hospital In-Charge registered. Email delivery note: ${emailResult.error || "Email not sent; use direct verify URL."}`,
      userId: user._id,
      hospitalId: hospital._id,
      hospitalName: hospital.name,
      emailSent: emailResult.emailSent,
      emailError: emailResult.error || null,
      // #11 FIX: Do not leak verifyUrl to client
    });
  } catch (err) {
    console.error("[registerHospitalAdmin]", err);
    res.status(500).json({ error: "Failed to register hospital in-charge", message: err.message });
  }
}

// 2. Register Doctor or Nurse under a Hospital
async function registerStaff(req, res) {
  try {
    const { name, email, phone, password, role, hospitalId, wardId, licenseNumber } = req.body;

    if (!name || !email || !phone || !role || !licenseNumber) {
      return res.status(400).json({ error: "All required fields (including License Number) must be provided" });
    }

    if (!["doctor", "nurse"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'doctor' or 'nurse'" });
    }

    // Detect whether an already-logged-in admin is creating this account
    // directly (Authorization header present, from axiosClient) versus a
    // public self-signup with no token yet. This lets a Hospital In-Charge
    // register doctors/nurses straight from their own profile — auto-approved,
    // since the admin creating the account already vouches for them — while
    // system_admin is blocked entirely: NICU/incubator/doctor/nurse
    // registration is the Hospital In-Charge's job only, never the platform
    // admin's.
    //
    // We re-read role/hospitalId fresh from the database (same as
    // verifyToken) rather than trusting the JWT payload directly — a token
    // can be up to 7 days old, and trusting a stale hospitalId here would
    // silently pin a newly-created doctor/nurse to the wrong hospital.
    let actingAdmin = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
        const freshUser = await User.findById(decoded.id).select("role hospitalId isApproved isEmailVerified");
        // #11 FIX: Verify the acting admin is actively approved and verified
        if (freshUser && freshUser.isApproved && freshUser.isEmailVerified) {
          actingAdmin = { role: freshUser.role, hospitalId: freshUser.hospitalId };
        }
      } catch {
        actingAdmin = null; // invalid/expired token — fall back to public self-signup behavior
      }
    }

    if (actingAdmin && actingAdmin.role === "system_admin") {
      return res.status(403).json({
        error: "System Admin cannot register doctors or nurses directly. This is handled by the respective Hospital In-Charge.",
      });
    }

    const isAdminCreated = actingAdmin && actingAdmin.role === "hospital_admin";
    // Admin-created accounts are always pinned to the creating admin's own
    // hospital — never trust a hospitalId passed in the body for that case.
    const targetHospitalId = isAdminCreated ? actingAdmin.hospitalId : hospitalId;

    if (!targetHospitalId) {
      return res.status(400).json({ error: "Hospital is required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone ? phone.trim() : "";

    const existingEmailUser = await User.findOne({ email: cleanEmail });
    if (existingEmailUser) {
      return res.status(409).json({ error: "Email address is already registered to another account." });
    }

    if (cleanPhone) {
      const existingPhoneUser = await User.findOne({ phone: cleanPhone });
      if (existingPhoneUser) {
        return res.status(409).json({ error: "Phone number is already registered to another account." });
      }
    }

    const hospital = await Hospital.findById(targetHospitalId);
    if (!hospital) {
      return res.status(404).json({ error: "Selected hospital does not exist" });
    }

    if (isAdminCreated && wardId) {
      const { wardBelongsToHospital } = require("../utils/wardGuard");
      if (!(await wardBelongsToHospital(wardId, hospital._id))) {
        return res.status(400).json({ error: "Selected NICU does not belong to your hospital" });
      }
    }

    const initialPassword = (licenseNumber && licenseNumber.trim())
      ? licenseNumber.trim()
      : ((password && password.trim()) ? password.trim() : "NeoCare@2026");

    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const token = generateVerificationToken();
    const tokenExpires = new Date(Date.now() + 24 * 3600 * 1000);

    const isStaff = ["doctor", "nurse"].includes(role);

    const user = await User.create({
      name,
      email,
      phone: phone.trim(),
      licenseNumber: licenseNumber.trim(),
      passwordHash,
      role,
      hospitalId: hospital._id,
      wardId: isAdminCreated ? (wardId || null) : null,
      // Admin-created accounts skip the verification/approval queue entirely —
      // the Hospital In-Charge creating the account already vouches for it.
      isEmailVerified: isAdminCreated ? true : false,
      isApproved: isAdminCreated ? true : false,
      verificationToken: isAdminCreated ? undefined : token,
      verificationTokenExpires: isAdminCreated ? undefined : tokenExpires,
      mustChangePassword: isStaff ? true : false,
    });

    if (isAdminCreated) {
      emitDataChange("user", "create", user);

      // Send initial credentials email to newly registered staff member
      sendStaffWelcomeEmail({
        toEmail: email,
        recipientName: name,
        role,
        hospitalName: hospital.name,
        temporaryPassword: initialPassword,
      }).catch((mailErr) => {
        console.warn("[registerStaff] Could not send welcome email:", mailErr.message);
      });

      return res.status(201).json({
        message: `${role === "doctor" ? "Doctor" : "Nurse"} ${name} registered and approved. Initial password set to license number.`,
        userId: user._id,
        role: user.role,
        email: user.email,
        temporaryPassword: initialPassword,
        hospitalName: hospital.name,
        mustChangePassword: isStaff ? true : false,
      });
    }

    const emailResult = await sendVerificationEmail({
      toEmail: email,
      recipientName: name,
      role,
      hospitalName: hospital.name,
      token,
    });

    // Notify the hospital's in-charge of new staff registration
    try {
      const roleLabel = role === "doctor" ? "Doctor" : "Nurse";
      const notif = await Notification.create({
        targetRole: "hospital_admin",
        hospitalId: hospital._id,
        type: "new_staff",
        title: `New ${roleLabel} Registration`,
        message: `${name} has registered as a ${roleLabel} at "${hospital.name}" and is awaiting your approval.`,
        triggeredBy: user._id,
        metadata: {
          role,
          userName: name,
          userId: user._id,
          hospitalName: hospital.name,
        },
      });
      emitNotification(notif.toObject());
    } catch (e) {
      console.warn("[notification] Could not create notification:", e.message);
    }

    res.status(201).json({
      message: emailResult.emailSent
        ? `Registered as ${role}. Verification email sent. Requires Hospital In-Charge approval.`
        : `Registered as ${role}. Email delivery note: ${emailResult.error || "Email not sent; use direct verify URL."}`,
      userId: user._id,
      role: user.role,
      hospitalName: hospital.name,
      emailSent: emailResult.emailSent,
      emailError: emailResult.error || null,
      // #11 FIX: Do not leak verifyUrl to client
    });
  } catch (err) {
    console.error("[registerStaff]", err);
    res.status(500).json({ error: "Failed to register staff account", message: err.message });
  }
}

// 3. Verify Email Endpoint
async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gte: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }

    user.isEmailVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;

    // Auto-approve if system admin or if setting allows, otherwise flag for admin review
    if (user.role === "system_admin") {
      user.isApproved = true;
    }

    await user.save();

    res.json({
      message: "Email address successfully verified!",
      role: user.role,
      isApproved: user.isApproved,
    });
  } catch (err) {
    console.error("[verifyEmail]", err);
    res.status(500).json({ error: "Email verification failed" });
  }
}

// 4. Enhanced Login with Role, Email Verification & Approval Checks
async function login(req, res) {
  try {
    const { email, password, portal } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Identifier and password / access key are required" });
    }

    // ── Patient / Guardian Portal Authentication ───────────────────────────
    if (portal === "patient") {
      const cleanInput = (email || "").trim();
      const cleanPassword = (password || "").trim();
      const Patient = require("../models/Patient");

      // Check if there is an explicit User account with role === "patient"
      const patientUser = await User.findOne({
        $or: [{ email: cleanInput.toLowerCase() }, { phone: cleanInput }],
        role: "patient",
      }).populate("hospitalId", "name");

      if (patientUser) {
        const valid = await bcrypt.compare(cleanPassword, patientUser.passwordHash);
        if (valid) {
          const linkedPatient = patientUser.patientId
            ? await Patient.findById(patientUser.patientId).populate("hospitalId", "name")
            : null;

          const token = jwt.sign(
            {
              id: patientUser._id,
              role: "patient",
              name: patientUser.name,
              patientId: linkedPatient?._id || patientUser.patientId || null,
              hospitalId: patientUser.hospitalId?._id || linkedPatient?.hospitalId?._id || null,
            },
            process.env.JWT_SECRET || "neocare_jwt_secret_dev_key",
            { expiresIn: "7d" }
          );

          return res.json({
            token,
            user: {
              id: patientUser._id,
              name: patientUser.name,
              email: patientUser.email,
              role: "patient",
              patientId: linkedPatient?._id || patientUser.patientId || null,
              patientName: linkedPatient?.name || "Patient",
              hospitalId: patientUser.hospitalId?._id || null,
              hospitalName: patientUser.hospitalId?.name || null,
              isApproved: true,
              isEmailVerified: true,
            },
          });
        }
      }

      // Check Patient registry directly:
      // Phone number OR Guardian National ID OR Access Code as identifier
      const matchingPatients = await Patient.find({
        $or: [
          { guardianPhone: cleanInput },
          { accessCode: cleanInput.toUpperCase() },
          { guardianNationalId: cleanInput },
          { _id: require("mongoose").isValidObjectId(cleanInput) ? cleanInput : null },
        ].filter(Boolean),
      }).populate("hospitalId", "name").populate("incubatorId", "label deviceTopicId");

      if (matchingPatients.length === 0) {
        return res.status(401).json({
          error: "No patient registry found with this phone number or access code.",
        });
      }

      // Verify credentials against accessCode (primary) or guardianNationalId (fallback)
      const matched = matchingPatients.find((p) => {
        const pCode = (p.accessCode || "").trim().toUpperCase();
        const pNid = (p.guardianNationalId || "").trim().toLowerCase();
        const inputPass = cleanPassword.trim().toUpperCase();
        return (pCode && pCode === inputPass) || (pNid && pNid === cleanPassword.trim().toLowerCase());
      });

      if (!matched) {
        return res.status(401).json({
          error: "Invalid Access Code. Please enter the unique Access Code sent to your phone via SMS.",
        });
      }

      // Issue authentication token for the guardian
      const token = jwt.sign(
        {
          id: matched._id,
          role: "patient",
          name: matched.guardianName || matched.name,
          patientId: matched._id,
          hospitalId: matched.hospitalId?._id || matched.hospitalId || null,
        },
        process.env.JWT_SECRET || "neocare_jwt_secret_dev_key",
        { expiresIn: "7d" }
      );

      return res.json({
        token,
        user: {
          id: matched._id,
          name: matched.guardianName || "Guardian",
          patientName: matched.name,
          role: "patient",
          patientId: matched._id,
          hospitalId: matched.hospitalId?._id || null,
          hospitalName: matched.hospitalId?.name || null,
          isApproved: true,
          isEmailVerified: true,
        },
      });
    }

    const cleanEmail = (email || "").trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).populate("hospitalId", "name");
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    let valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid && ["doctor", "nurse"].includes(user.role) && user.licenseNumber) {
      const inputPass = (password || "").trim();
      const lic = user.licenseNumber.trim();
      if (inputPass === lic || inputPass.toLowerCase() === lic.toLowerCase()) {
        valid = true;
        user.mustChangePassword = true;
        user.passwordHash = await bcrypt.hash(lic, 10);
        await user.save();
      }
    }

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Enforce strict Portal Scoping
    if (portal) {
      if (portal === "system_admin" && user.role !== "system_admin") {
        return res.status(403).json({ error: "Access denied. This portal is strictly for System Administrators." });
      }
      if (user.role === "system_admin" && portal !== "system_admin") {
        return res.status(403).json({ error: "System Administrators must log in through the System Admin portal." });
      }
      if (portal === "hospital_admin" && user.role !== "hospital_admin") {
        return res.status(403).json({ error: "Access denied. Hospital Admin portal is for Hospital Administrators only." });
      }
      if (portal === "staff" && !["doctor", "nurse"].includes(user.role)) {
        return res.status(403).json({ error: "Access denied. Staff portal is for Doctors and Nurses only." });
      }
    }

    // Enforce Email Verification check (System Admin bypasses email verification)
    if (!user.isEmailVerified && user.role !== "system_admin" && process.env.REQUIRE_EMAIL_VERIFICATION !== "false") {
      return res.status(403).json({
        error: "Your email address has not been verified yet. Please check your inbox or verification link.",
        code: "EMAIL_NOT_VERIFIED",
        userId: user._id,
      });
    }

    // Enforce Admin Approval check
    if (!user.isApproved && user.role !== "system_admin" && process.env.REQUIRE_ADMIN_APPROVAL !== "false") {
      const approverTitle = user.role === "hospital_admin" ? "System Administrator" : "Hospital Administrator";
      return res.status(403).json({
        error: `Your account is pending verification & approval by the ${approverTitle}.`,
        code: "AWAITING_APPROVAL",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name,
        hospitalId: user.hospitalId ? user.hospitalId._id : null,
        wardId: user.wardId,
      },
      process.env.JWT_SECRET || "neocare_jwt_secret_dev_key",
      { expiresIn: "7d" }
    );

    const needsPasswordChange = ["doctor", "nurse"].includes(user.role) && Boolean(user.mustChangePassword);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId ? user.hospitalId._id : null,
        hospitalName: user.hospitalId ? user.hospitalId.name : null,
        wardId: user.wardId,
        isEmailVerified: user.isEmailVerified,
        isApproved: user.isApproved,
        mustChangePassword: needsPasswordChange,
      },
      mustChangePassword: needsPasswordChange,
    });
  } catch (err) {
    console.error("[login]", err);
    res.status(500).json({ error: "Login failed" });
  }
}

// 5. Get Pending Approvals (for System Admin or Hospital Admin)
async function getPendingApprovals(req, res) {
  try {
    const userRole = req.user.role;
    let query = {};

    if (userRole === "system_admin") {
      // System admin sees pending hospital admins
      query = { role: "hospital_admin", isApproved: false };
    } else if (userRole === "hospital_admin") {
      // Hospital admin sees doctors and nurses for their hospital
      query = {
        hospitalId: req.user.hospitalId,
        role: { $in: ["doctor", "nurse"] },
        isApproved: false,
      };
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const pendingUsers = await User.find(query)
      .select("-passwordHash")
      .populate("hospitalId", "name")
      .sort({ createdAt: -1 });

    res.json(pendingUsers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pending approvals" });
  }
}

// 6. Approve User Account
async function approveUser(req, res) {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Permission check
    if (req.user.role === "system_admin") {
      // #16 FIX: system_admin can only approve hospital_admin accounts.
      // Doctors/nurses belong to a hospital and should be approved by that hospital's admin.
      if (targetUser.role !== "hospital_admin") {
        return res.status(403).json({ error: "System Admin can only approve Hospital In-Charge accounts. Doctors and nurses must be approved by their Hospital In-Charge." });
      }
    } else if (req.user.role === "hospital_admin") {
      if (String(targetUser.hospitalId) !== String(req.user.hospitalId)) {
        return res.status(403).json({ error: "You can only approve staff in your hospital" });
      }
    }

    targetUser.isApproved = true;
    // Auto verify email if approved directly by admin
    targetUser.isEmailVerified = true;
    await targetUser.save();

    emitDataChange("user", "approve", targetUser);

    res.json({
      message: `Account for ${targetUser.name} (${targetUser.role}) successfully verified and approved!`,
      user: targetUser,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve user" });
  }
}

// 7. Reject / Delete a Pending User Account
async function rejectUser(req, res) {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.isApproved) {
      return res.status(400).json({ error: "User is already approved. Use the staff management page to remove active accounts." });
    }

    // Permission check
    if (req.user.role === "system_admin") {
      if (targetUser.role !== "hospital_admin") {
        return res.status(403).json({ error: "System Admin can only reject pending Hospital In-Charge accounts." });
      }
    } else if (req.user.role === "hospital_admin") {
      if (targetUser.role === "hospital_admin" || targetUser.role === "system_admin") {
        return res.status(403).json({ error: "You cannot reject admin accounts." });
      }
      if (String(targetUser.hospitalId) !== String(req.user.hospitalId)) {
        return res.status(403).json({ error: "You can only reject staff in your hospital" });
      }
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    const name = targetUser.name;
    const role = targetUser.role;
    
    // If we reject a pending hospital_admin, we must also clean up the hospital they created
    // during registration to prevent orphaned hospitals and name squatting.
    // Only remove the hospital if it is genuinely an empty shell: no other
    // users, wards or incubators. A system admin can move a pending admin into
    // an existing hospital, and rejecting that admin must never delete it.
    if (role === "hospital_admin" && targetUser.hospitalId) {
      const Hospital = require("../models/Hospital");
      const Ward = require("../models/Ward");
      const Incubator = require("../models/Incubator");
      const [otherUsers, wardCount, incubatorCount] = await Promise.all([
        User.countDocuments({ hospitalId: targetUser.hospitalId, _id: { $ne: targetUser._id } }),
        Ward.countDocuments({ hospitalId: targetUser.hospitalId }),
        Incubator.countDocuments({ hospitalId: targetUser.hospitalId }),
      ]);
      if (otherUsers === 0 && wardCount === 0 && incubatorCount === 0) {
        await Hospital.findByIdAndDelete(targetUser.hospitalId);
        emitDataChange("hospital", "delete", { id: targetUser.hospitalId }, targetUser.hospitalId);
      }
    }

    await User.findByIdAndDelete(userId);

    emitDataChange("user", "reject", { id: userId }, targetUser.hospitalId);

    res.json({ message: `Account for ${name} (${role}) has been rejected and removed.` });
  } catch (err) {
    console.error("[rejectUser]", err);
    res.status(500).json({ error: "Failed to reject user" });
  }
}

// 8. One-Click Magic Link Authentication for Patient Guardians
async function magicAccess(req, res) {
  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ error: "Access code is required" });
    }

    const cleanCode = code.trim().toUpperCase();
    const Patient = require("../models/Patient");
    const patient = await Patient.findOne({
      accessCode: cleanCode,
    }).populate("hospitalId", "name").populate("incubatorId", "label deviceTopicId");

    if (!patient) {
      return res.status(401).json({
        error: "Invalid or expired access code. Please check the SMS sent to your phone or contact the NICU staff.",
      });
    }

    const token = jwt.sign(
      {
        id: patient._id,
        role: "patient",
        name: patient.guardianName || patient.name,
        patientId: patient._id,
        hospitalId: patient.hospitalId?._id || patient.hospitalId || null,
      },
      process.env.JWT_SECRET || "neocare_jwt_secret_dev_key",
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: patient._id,
        name: patient.guardianName || "Guardian",
        patientName: patient.name,
        role: "patient",
        patientId: patient._id,
        hospitalId: patient.hospitalId?._id || null,
        hospitalName: patient.hospitalId?.name || null,
        isApproved: true,
        isEmailVerified: true,
      },
    });
  } catch (err) {
    console.error("[magicAccess]", err);
    res.status(500).json({ error: "Failed to authenticate via magic link" });
  }
}

// 8. Mandatory First-Time Password Setup for Doctors and Nurses
async function firstTimeChangePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ error: "Permanent password must be at least 6 characters long." });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    if (!["doctor", "nurse"].includes(user.role)) {
      return res.status(403).json({ error: "First-time password setup is only applicable for clinical staff." });
    }

    // Verify currentPassword against DB if provided
    if (currentPassword && currentPassword.trim()) {
      const isMatch = await bcrypt.compare(currentPassword.trim(), user.passwordHash);
      if (!isMatch) {
        return res.status(400).json({ error: "Current password (medical license number) does not match." });
      }
    }

    user.passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    user.mustChangePassword = false;
    await user.save();

    emitDataChange("user", "update", user);

    res.json({
      message: "Permanent password set successfully. Welcome to NeoCare.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        wardId: user.wardId,
        mustChangePassword: false,
      },
    });
  } catch (err) {
    console.error("[firstTimeChangePassword]", err);
    res.status(500).json({ error: "Failed to update permanent password." });
  }
}

module.exports = {
  registerHospitalAdmin,
  registerStaff,
  verifyEmail,
  login,
  magicAccess,
  getPendingApprovals,
  approveUser,
  rejectUser,
  firstTimeChangePassword,
};
