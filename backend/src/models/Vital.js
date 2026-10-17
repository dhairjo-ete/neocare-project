const mongoose = require("mongoose");

const vitalSchema = new mongoose.Schema({
  device_id: { type: String, required: true, index: true },
  heart_rate: { type: Number, required: true },
  spo2: { type: Number, required: true },
  temperature: { type: Number, required: true },
  heater_power: { type: Number, default: 50 },
  oxygen_flow: { type: Number, default: 2.0 },
  fan_speed: { type: Number, default: 1200 },
  anomaly_injected: { type: Boolean, default: false },
  condition: { type: String, default: "Normal" },
  timestamp: { type: Date, required: true },

  // Populated automatically by the MQTT ingest handler if device_id matches
  // a registered Incubator and active patient.
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", default: null, index: true },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", default: null },
  incubatorId: { type: mongoose.Schema.Types.ObjectId, ref: "Incubator", default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null, index: true },
}, { timestamps: true });

vitalSchema.index({ device_id: 1, timestamp: -1 });

module.exports = mongoose.model("Vital", vitalSchema);
