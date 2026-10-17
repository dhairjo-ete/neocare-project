const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  incubatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Incubator", required: true },

  name: { type: String, required: true }, // e.g. "Baby of Mrs. Rahman"
  gestationalAgeWeeks: { type: Number },
  birthWeightGrams: { type: Number },
  bloodType: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"],
    default: "unknown",
  },
  assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignedNurse: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Biological sex & date of birth — used for tracking biological development
  // and age-appropriate vital sign baselines.
  biologicalSex: { type: String, enum: ["male", "female", "other"], required: true },
  dateOfBirth: { type: Date, required: true },

  // Admission reason / primary clinical indication (e.g. Respiratory Distress
  // Syndrome, Low Birth Weight, Jaundice). Free text so it can capture cases
  // outside the common preset list.
  primarySyndrome: { type: String, required: true, trim: true },

  // Mother / Guardian details — required for emergency contact and the
  // SMS notification / magic-link pipeline.
  guardianName: { type: String, required: true, trim: true },
  guardianPhone: { type: String, required: true, trim: true },
  guardianNationalId: { type: String, required: false, trim: true, default: "" }, // national ID / passport number (optional)
  guardianAddress: { type: String, required: true, trim: true },

  // Unique patient access code (e.g. "RAH-7492") used for guardian portal login and one-click magic links
  accessCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },

  admittedAt: { type: Date, default: Date.now },
  dischargedAt: { type: Date, default: null }, // null = currently active patient
  dischargedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  dischargeSummary: { type: String, default: "" }, // e.g. "Stable, transferred to pediatric ward"
}, { timestamps: true });

// Strict DB-level enforcement: at most 1 active patient per incubator
patientSchema.index(
  { incubatorId: 1 },
  { unique: true, partialFilterExpression: { dischargedAt: null } }
);

module.exports = mongoose.model("Patient", patientSchema);

