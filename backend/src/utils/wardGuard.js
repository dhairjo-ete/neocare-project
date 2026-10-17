const mongoose = require("mongoose");
const Ward = require("../models/Ward");

// Returns true when wardId is empty (clearing a ward is allowed) or when it
// points to a real ward that belongs to the given hospital.
async function wardBelongsToHospital(wardId, hospitalId) {
  if (wardId === undefined || wardId === null || wardId === "") return true;
  if (!mongoose.isValidObjectId(wardId) || !hospitalId) return false;
  const ward = await Ward.findOne({ _id: wardId, hospitalId }).select("_id");
  return !!ward;
}

module.exports = { wardBelongsToHospital };
