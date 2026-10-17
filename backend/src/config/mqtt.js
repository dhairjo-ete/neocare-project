const mqtt = require("mqtt");
const Vital = require("../models/Vital");
const Incubator = require("../models/Incubator");
const Patient = require("../models/Patient");
const { checkThresholds, resetAlertDebounce } = require("../services/alertEngine");

// Cache deviceTopicId -> { incubator scope + active patient } for a short while
// so we don't hit MongoDB on every single MQTT message.
const incubatorCache = new Map();
const CACHE_TTL_MS = 15_000; // 15 seconds — stays responsive to patient admissions

async function resolveIncubatorScope(deviceId) {
  const cached = incubatorCache.get(deviceId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.scope;
  }

  const incubator = await Incubator.findOne({ deviceTopicId: deviceId });

  if (!incubator) {
    const scope = { hospitalId: null, wardId: null, incubatorId: null, patientId: null, hasActivePatient: false };
    incubatorCache.set(deviceId, { scope, cachedAt: Date.now() });
    return scope;
  }

  // Only stream vitals when incubator is active AND has an admitted patient
  const activePatient = incubator.status === "active"
    ? await Patient.findOne({ incubatorId: incubator._id, dischargedAt: null })
    : null;

  const scope = {
    hospitalId: incubator.hospitalId,
    wardId: incubator.wardId,
    incubatorId: incubator._id,
    patientId: activePatient?._id || null,
    incubatorStatus: incubator.status,
    hasActivePatient: !!activePatient,
  };

  incubatorCache.set(deviceId, { scope, cachedAt: Date.now() });
  return scope;
}

// Call this whenever a patient is admitted or discharged so we re-check immediately
function invalidateIncubatorCache(deviceTopicId) {
  if (deviceTopicId) {
    incubatorCache.delete(deviceTopicId);
    resetAlertDebounce(deviceTopicId); // #7 FIX: Reset alert counters
  } else {
    // Invalidate entire cache (e.g., bulk changes)
    incubatorCache.clear();
  }
}

let mqttClientInstance = null;

function connectMQTT(io) {
  const host = process.env.HIVEMQ_HOST;
  const port = process.env.HIVEMQ_PORT || 8883;

  const client = mqtt.connect(`mqtts://${host}:${port}`, {
    username: process.env.HIVEMQ_USERNAME,
    password: process.env.HIVEMQ_PASSWORD,
    clientId: `neocare-backend-${Math.random().toString(16).slice(2)}`,
  });

  mqttClientInstance = client;

  client.on("connect", () => {
    console.log("[mqtt] connected to HiveMQ Cloud");
    client.subscribe("neocare/+/vitals", { qos: 1 });
    client.subscribe("neocare/+/status", { qos: 1 });
  });

  client.on("error", (err) => {
    console.error("[mqtt] connection error:", err.message);
  });

  client.on("message", async (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());

      if (topic.endsWith("/vitals")) {
        const scope = await resolveIncubatorScope(data.device_id);

        // ── GUARD: Block phantom vitals when no patient is admitted ────────────
        if (!scope.hasActivePatient) {
          // Broadcast a standby signal so the frontend can show the bed as empty
          if (scope.hospitalId) {
            io.to(`room:hospital:${scope.hospitalId}`).to("room:system_admin").emit("incubator:standby", {
              device_id: data.device_id,
              incubatorStatus: scope.incubatorStatus || "active",
              reason: scope.incubatorStatus !== "active"
                ? `Incubator is ${scope.incubatorStatus}`
                : "No patient admitted to this incubator",
            });
          } else {
            io.emit("incubator:standby", {
              device_id: data.device_id,
              incubatorStatus: scope.incubatorStatus || "active",
              reason: scope.incubatorStatus !== "active"
                ? `Incubator is ${scope.incubatorStatus}`
                : "No patient admitted to this incubator",
            });
          }
          // Do NOT persist the reading or trigger any clinical alerts
          return;
        }
        // ─────────────────────────────────────────────────────────────────────

        // 1. Persist vital to MongoDB, tagged with patient + hospital/ward/incubator
        const vital = await Vital.create({ ...data, ...scope });

        // 2. Broadcast live to specific hospital, patient room, and system admin
        let broadcaster = io.to("room:system_admin");
        if (scope.hospitalId) broadcaster = broadcaster.to(`room:hospital:${scope.hospitalId}`);
        if (scope.patientId) broadcaster = broadcaster.to(`room:patient:${scope.patientId}`);
        broadcaster.emit("vitals:update", vital);

        // 3. Check thresholds -> may trigger an alert (saved + emitted inside)
        await checkThresholds({ ...data, ...scope }, io);
      }

      if (topic.endsWith("/status")) {
        const scope = await resolveIncubatorScope(data.device_id);
        if (scope.hospitalId) {
          io.to(`room:hospital:${scope.hospitalId}`).to("room:system_admin").emit("device:status", data);
        } else {
          io.emit("device:status", data);
        }
      }
    } catch (err) {
      console.error("[mqtt] failed to process message:", err.message);
    }
  });

  return client;
}

/**
 * Dispatch an actuator control packet to a physical or simulated incubator.
 * Topic: neocare/{deviceTopicId}/control
 */
function publishControlCommand(deviceTopicId, payload) {
  if (!mqttClientInstance || !mqttClientInstance.connected) {
    console.warn(`[mqtt] Cannot publish control command to ${deviceTopicId} - MQTT client not connected`);
    return false;
  }
  const topic = `neocare/${deviceTopicId}/control`;
  mqttClientInstance.publish(topic, JSON.stringify(payload), { qos: 1 });
  return true;
}

module.exports = connectMQTT;
module.exports.invalidateIncubatorCache = invalidateIncubatorCache;
module.exports.publishControlCommand = publishControlCommand;
