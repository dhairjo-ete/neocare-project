const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },

  phone: { type: String, trim: true, default: "" },

  // Medical or Nursing License Number for Doctors and Nurses
  licenseNumber: { type: String, trim: true, default: "" },

  // Role hierarchy:
  // system_admin: Main platform administrator (approves hospitals/hospital admins).
  // hospital_admin: Manages a specific hospital, wards, incubators, doctors, nurses.
  // doctor: Medical practitioner scoped to a hospital, adds clinical notes & monitors vitals.
  // nurse: Healthcare caregiver scoped to a hospital, handles live alarms & incubator monitoring.
  role: {
    type: String,
    enum: ["system_admin", "hospital_admin", "doctor", "nurse", "patient"],
    default: "nurse",
  },

  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", default: null },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },

  isEmailVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  verificationTokenExpires: { type: Date, default: null },

  // For doctors and nurses: forces them to set permanent password after first login
  mustChangePassword: { type: Boolean, default: false },

  fcmToken: { type: String },
}, { timestamps: true });

// #2 FIX: Strip sensitive fields when converting to JSON (prevents API/socket leaks)
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.verificationToken;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
