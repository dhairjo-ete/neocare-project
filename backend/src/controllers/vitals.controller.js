const Vital = require("../models/Vital");
const Incubator = require("../models/Incubator");

// Resolve the incubator that owns a deviceTopicId and verify the caller's hospital access.
// Returns the incubator doc (or null for system_admin who bypasses scoping).
async function resolveAndAuthorize(deviceId, user) {
  if (user.role === "system_admin") return { ok: true };
  const incubator = await Incubator.findOne({ deviceTopicId: deviceId }).select("hospitalId");
  if (!incubator) return { ok: false, status: 404, error: "Device not found" };
  if (String(incubator.hospitalId) !== String(user.hospitalId)) {
    return { ok: false, status: 403, error: "Access denied to this device" };
  }
  return { ok: true };
}

async function getLatest(req, res) {
  const { deviceId } = req.params;
  const auth = await resolveAndAuthorize(deviceId, req.user);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const latest = await Vital.findOne({ device_id: deviceId }).sort({ timestamp: -1 });
  if (!latest) return res.status(404).json({ error: "No readings found for this device" });
  res.json(latest);
}

async function getHistory(req, res) {
  const { deviceId } = req.params;
  const auth = await resolveAndAuthorize(deviceId, req.user);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { from, to } = req.query;
  const MAX_LIMIT = 5000;
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : 200;

  const query = { device_id: deviceId };
  if (from || to) {
    query.timestamp = {};
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
      query.timestamp.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
      query.timestamp.$lte = d;
    }
  }

  const history = await Vital.find(query).sort({ timestamp: -1 }).limit(limit);
  res.json(history);
}

async function getDevices(req, res) {
  try {
    // Return only devices (incubators) belonging to the user's hospital
    let incubatorQuery = {};
    if (req.user.role !== "system_admin") {
      incubatorQuery.hospitalId = req.user.hospitalId;
    }
    const incubators = await Incubator.find(incubatorQuery).select("deviceTopicId");
    const deviceIds = incubators.map((i) => i.deviceTopicId);
    res.json(deviceIds);
  } catch (err) {
    res.json([]);
  }
}

async function getStats(req, res) {
  const { deviceId } = req.params;
  const auth = await resolveAndAuthorize(deviceId, req.user);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const parsedHours = parseFloat(req.query.hours);
  const hours = Number.isFinite(parsedHours) ? Math.min(Math.max(parsedHours, 1), 24 * 30) : 24;
  const since = new Date(Date.now() - hours * 3600 * 1000);

  try {
    const stats = await Vital.aggregate([
      { $match: { device_id: deviceId, timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            year: { $year: "$timestamp" },
            month: { $month: "$timestamp" },
            day: { $dayOfMonth: "$timestamp" },
            hour: { $hour: "$timestamp" },
            minute: { $minute: "$timestamp" },
          },
          avgHR: { $avg: "$heart_rate" },
          minHR: { $min: "$heart_rate" },
          maxHR: { $max: "$heart_rate" },
          avgSpO2: { $avg: "$spo2" },
          minSpO2: { $min: "$spo2" },
          maxSpO2: { $max: "$spo2" },
          avgTemp: { $avg: "$temperature" },
          minTemp: { $min: "$temperature" },
          maxTemp: { $max: "$temperature" },
          count: { $sum: 1 },
          lastTimestamp: { $max: "$timestamp" },
        },
      },
      { $sort: { lastTimestamp: 1 } },
    ]);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to compute vitals analytics", message: err.message });
  }
}

// Fetch telemetry history specifically for a patient
async function getPatientVitals(req, res) {
  const { patientId } = req.params;
  const mongoose = require("mongoose");
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID format" });
  }

  const Patient = require("../models/Patient");
  const patient = await Patient.findById(patientId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);

  // Permissions check
  if (req.user.role === "patient") {
    if (String(req.user.patientId) !== String(patient._id)) {
      return res.status(403).json({ error: "Access denied" });
    }
  } else if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Access denied to this patient's records" });
  }

  const { from, to } = req.query;
  const MAX_LIMIT = 5000;
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : 500;

  let query = { patientId: patient._id };
  if (from || to) {
    query.timestamp = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) query.timestamp.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) query.timestamp.$lte = d;
    }
  }

  let history = await Vital.find(query).sort({ timestamp: -1 }).limit(limit);

  // If no readings are tagged directly with patientId, fallback to incubator readings during admission
  if (history.length === 0 && patient.incubatorId) {
    const inc = await Incubator.findById(patient.incubatorId);
    if (inc) {
      const fallbackQuery = {
        device_id: inc.deviceTopicId,
        timestamp: {
          $gte: patient.admittedAt || new Date(Date.now() - 7 * 86400000),
          $lte: patient.dischargedAt || new Date(),
        },
      };
      if (from) {
        const d = new Date(from);
        if (!Number.isNaN(d.getTime()) && d > fallbackQuery.timestamp.$gte) fallbackQuery.timestamp.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!Number.isNaN(d.getTime()) && d < fallbackQuery.timestamp.$lte) fallbackQuery.timestamp.$lte = d;
      }
      history = await Vital.find(fallbackQuery).sort({ timestamp: -1 }).limit(limit);
    }
  }

  res.json(history);
}

// Compute statistics (min, max, avg, count) for a patient's vital telemetry
async function getPatientVitalsStats(req, res) {
  const { patientId } = req.params;
  const mongoose = require("mongoose");
  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID format" });
  }

  const Patient = require("../models/Patient");
  const patient = await Patient.findById(patientId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const patientHospitalId = patient.hospitalId?._id ? String(patient.hospitalId._id) : String(patient.hospitalId);

  if (req.user.role === "patient") {
    if (String(req.user.patientId) !== String(patient._id)) {
      return res.status(403).json({ error: "Access denied" });
    }
  } else if (req.user.role !== "system_admin" && patientHospitalId !== String(req.user.hospitalId)) {
    return res.status(403).json({ error: "Access denied to this patient's records" });
  }

  try {
    let matchQuery = { patientId: patient._id };
    let count = await Vital.countDocuments(matchQuery);
    if (count === 0 && patient.incubatorId) {
      const inc = await Incubator.findById(patient.incubatorId);
      if (inc) {
        matchQuery = {
          device_id: inc.deviceTopicId,
          timestamp: {
            $gte: patient.admittedAt || new Date(Date.now() - 7 * 86400000),
            $lte: patient.dischargedAt || new Date(),
          },
        };
      }
    }

    const stats = await Vital.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          avgHR: { $avg: "$heart_rate" },
          minHR: { $min: "$heart_rate" },
          maxHR: { $max: "$heart_rate" },
          avgSpO2: { $avg: "$spo2" },
          minSpO2: { $min: "$spo2" },
          maxSpO2: { $max: "$spo2" },
          avgTemp: { $avg: "$temperature" },
          minTemp: { $min: "$temperature" },
          maxTemp: { $max: "$temperature" },
          totalReadings: { $sum: 1 },
          firstTimestamp: { $min: "$timestamp" },
          lastTimestamp: { $max: "$timestamp" },
        },
      },
    ]);

    const latest = await Vital.findOne(matchQuery).sort({ timestamp: -1 });

    res.json({
      summary: stats[0] || null,
      latest: latest || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to compute patient vitals stats", message: err.message });
  }
}

module.exports = {
  getLatest,
  getHistory,
  getDevices,
  getStats,
  getPatientVitals,
  getPatientVitalsStats,
};

