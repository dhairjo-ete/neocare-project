const mongoose = require("mongoose");

// A medical staff note tagged to a point in time, meant to be plotted
// alongside a patient's vitals history (e.g. "Administered medication at 14:00").
const patientNoteSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
  incubatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Incubator", required: true, index: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("PatientNote", patientNoteSchema);
