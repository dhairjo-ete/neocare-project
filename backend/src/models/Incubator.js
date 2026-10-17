const mongoose = require("mongoose");

const incubatorSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", required: true, index: true },

  // This is the string used in the MQTT topic (neocare/<deviceTopicId>/vitals).
  // It's what ties real-time sensor data back to a hospital/ward/patient.
  deviceTopicId: { type: String, required: true, unique: true },

  label: { type: String }, // e.g. "Bay 3"
  status: { type: String, enum: ["active", "maintenance", "offline"], default: "active" },

  // Hardware-in-the-Loop (HIL) bidirectional actuator setpoints
  controlSettings: {
    targetTemperature: { type: Number, default: 37.0 },
    oxygenFlow: { type: Number, default: 2.0 },
    phototherapy: { type: Boolean, default: false },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastUpdatedAt: { type: Date, default: null },
  },
}, { timestamps: true });

module.exports = mongoose.model("Incubator", incubatorSchema);
