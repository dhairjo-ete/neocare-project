const mongoose = require("mongoose");

const wardSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: "Hospital", required: true, index: true },
  name: { type: String, required: true }, // e.g. "NICU-1"
  status: { type: String, enum: ["online", "maintenance", "offline"], default: "online" },
}, { timestamps: true });

module.exports = mongoose.model("Ward", wardSchema);
