/**
 * NeoCare Built-In Telemetry Engine & Continuous Neonatal Digital Twin
 * 
 * Provides automated, authentic physiological vitals streaming for active
 * incubators without requiring an external terminal or manual Python script.
 * 
 * Features:
 * - Continuous Autoregressive Momentum (AR-1) with Gaussian micro-variability.
 * - Admitted diagnosis / syndrome profiles (RDS, Sepsis, Preterm, Jaundice, etc.).
 * - Circadian sleep/wake cycles (Deep sleep, Active sleep, Awake calm, Agitated crying).
 * - Multi-stage Apnea-Bradycardia-Desaturation (ABD) cascades.
 * - Hardware-in-the-Loop: Dynamic response to clinician setpoints (target temp, O2 flow).
 * - Automatic handoff: Steps aside if external physical hardware or MQTT script connects.
 */

const Vital = require("../models/Vital");
const Incubator = require("../models/Incubator");
const Patient = require("../models/Patient");
const { checkThresholds } = require("./alertEngine");

// Syndrome physiological profiles
const SYNDROME_PROFILES = {
  respiratory_distress: {
    name: "Respiratory Distress Syndrome",
    base_hr: 145.0,
    base_spo2: 95.5,
    base_temp: 37.0,
    hr_sigma: 1.2,
    spo2_sigma: 0.35,
    spontaneous_risk: 0.005,
    primary_risk: "bradycardia",
  },
  meconium_aspiration: {
    name: "Meconium Aspiration Syndrome",
    base_hr: 148.0,
    base_spo2: 95.2,
    base_temp: 37.1,
    hr_sigma: 1.2,
    spo2_sigma: 0.35,
    spontaneous_risk: 0.005,
    primary_risk: "hypoxia",
  },
  suspected_sepsis: {
    name: "Suspected Sepsis",
    base_hr: 160.0,
    base_spo2: 96.0,
    base_temp: 37.5,
    hr_sigma: 0.75,
    spo2_sigma: 0.35,
    spontaneous_risk: 0.006,
    primary_risk: "hyperthermia",
  },
  prematurity: {
    name: "Prematurity / Low Birth Weight",
    base_hr: 150.0,
    base_spo2: 96.5,
    base_temp: 36.8,
    hr_sigma: 1.2,
    spo2_sigma: 0.35,
    spontaneous_risk: 0.006,
    primary_risk: "bradycardia",
  },
  birth_asphyxia: {
    name: "Birth Asphyxia",
    base_hr: 134.0,
    base_spo2: 95.8,
    base_temp: 36.6,
    hr_sigma: 1.1,
    spo2_sigma: 0.35,
    spontaneous_risk: 0.005,
    primary_risk: "hypoxia",
  },
  congenital_heart_defect: {
    name: "Congenital Heart Defect",
    base_hr: 154.0,
    base_spo2: 95.0,
    base_temp: 36.9,
    hr_sigma: 1.2,
    spo2_sigma: 0.4,
    spontaneous_risk: 0.004,
    primary_risk: "hypoxia",
  },
  jaundice: {
    name: "Jaundice (Hyperbilirubinemia)",
    base_hr: 138.0,
    base_spo2: 98.0,
    base_temp: 37.0,
    hr_sigma: 1.4,
    spo2_sigma: 0.25,
    spontaneous_risk: 0.003,
    primary_risk: "bradycardia",
  },
  default: {
    name: "General NICU Observation",
    base_hr: 140.0,
    base_spo2: 97.5,
    base_temp: 37.0,
    hr_sigma: 1.3,
    spo2_sigma: 0.25,
    spontaneous_risk: 0.003,
    primary_risk: "bradycardia",
  },
};

function getSyndromeProfile(syndromeStr) {
  if (!syndromeStr) return SYNDROME_PROFILES.default;
  const s = String(syndromeStr).toLowerCase();
  if (s.includes("respiratory") || s.includes("rds") || s.includes("hyaline")) return SYNDROME_PROFILES.respiratory_distress;
  if (s.includes("meconium")) return SYNDROME_PROFILES.meconium_aspiration;
  if (s.includes("sepsis") || s.includes("infect")) return SYNDROME_PROFILES.suspected_sepsis;
  if (s.includes("prematur") || s.includes("low birth") || s.includes("lbw") || s.includes("vlbw")) return SYNDROME_PROFILES.prematurity;
  if (s.includes("asphyxia") || s.includes("hypoxic") || s.includes("hie")) return SYNDROME_PROFILES.birth_asphyxia;
  if (s.includes("heart") || s.includes("cardiac") || s.includes("chd")) return SYNDROME_PROFILES.congenital_heart_defect;
  if (s.includes("jaundice") || s.includes("hyperbilirubin") || s.includes("phototherapy")) return SYNDROME_PROFILES.jaundice;
  return SYNDROME_PROFILES.default;
}

// Gaussian random generator (Box-Muller transform)
function randomGaussian(mean = 0, stdev = 1) {
  const u1 = 1 - Math.random();
  const u2 = 1 - Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdev * randStdNormal;
}

function randomUniform(min, max) {
  return min + Math.random() * (max - min);
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

class NeonatePhysiology {
  constructor(deviceId, patientInfo = {}) {
    this.deviceId = deviceId;
    this.patientInfo = patientInfo;
    this.profile = getSyndromeProfile(patientInfo?.primarySyndrome);

    // Initial physiological continuous states
    this.hr = Number(this.profile.base_hr);
    this.spo2 = Number(this.profile.base_spo2);
    this.skinTemp = Number(this.profile.base_temp);
    this.heaterPower = 50;
    this.fanSpeed = 1200;
    this.oxygenFlow = 2.0;

    // Clinician setpoints
    this.targetSkinTemp = Number(this.profile.base_temp);
    this.targetOxygenFlow = 2.0;
    this.phototherapy = false;

    // Behavioral state machine
    this.behavior = "deep_sleep";
    this.behaviorTicksLeft = randomInt(40, 80);

    // Anomaly cascade
    this.activeAnomaly = null;
    this.anomalyStep = 0;
    this.anomalyTotalSteps = 0;
  }

  applyControl(targetTemp, oxygenFlow, phototherapy) {
    if (targetTemp != null) this.targetSkinTemp = parseFloat(targetTemp);
    if (oxygenFlow != null) this.targetOxygenFlow = Math.max(1.0, Math.min(10.0, parseFloat(oxygenFlow)));
    if (phototherapy != null) this.phototherapy = Boolean(phototherapy);
  }

  updatePatient(patientInfo) {
    if (!patientInfo) return;
    const oldSyn = this.patientInfo?.primarySyndrome || "";
    const newSyn = patientInfo?.primarySyndrome || "";
    if (oldSyn !== newSyn) {
      this.patientInfo = patientInfo;
      this.profile = getSyndromeProfile(newSyn);
    }
  }

  updateBehavior() {
    this.behaviorTicksLeft -= 1;
    if (this.behaviorTicksLeft <= 0) {
      const current = this.behavior;
      const r = Math.random();
      if (current === "deep_sleep") {
        this.behavior = r < 0.85 ? "active_sleep" : "awake_calm";
        this.behaviorTicksLeft = randomInt(40, 80);
      } else if (current === "active_sleep") {
        if (r < 0.55) this.behavior = "deep_sleep";
        else if (r < 0.85) this.behavior = "awake_calm";
        else this.behavior = "agitated_crying";
        this.behaviorTicksLeft = randomInt(30, 60);
      } else if (current === "awake_calm") {
        if (r < 0.50) this.behavior = "active_sleep";
        else if (r < 0.80) this.behavior = "deep_sleep";
        else this.behavior = "agitated_crying";
        this.behaviorTicksLeft = randomInt(20, 40);
      } else {
        this.behavior = r < 0.75 ? "awake_calm" : "active_sleep";
        this.behaviorTicksLeft = randomInt(15, 30);
      }
    }
  }

  startAnomaly(anomalyType) {
    this.activeAnomaly = anomalyType;
    this.anomalyStep = 0;
    if (anomalyType === "bradycardia") this.anomalyTotalSteps = 16;
    else if (anomalyType === "tachycardia") this.anomalyTotalSteps = 18;
    else if (anomalyType === "hypoxia") this.anomalyTotalSteps = 16;
    else if (anomalyType === "hyperthermia") this.anomalyTotalSteps = 22;
    else if (anomalyType === "hypothermia") this.anomalyTotalSteps = 22;
    else {
      this.activeAnomaly = null;
      this.anomalyTotalSteps = 0;
    }
  }

  computeTargets() {
    const baseHr = this.profile.base_hr;
    const baseSpo2 = this.profile.base_spo2;
    const baseTemp = this.profile.base_temp;

    let behHrMod = 0.0;
    let behSpo2Mod = 0.0;
    let behSigmaMult = 1.0;

    if (this.behavior === "deep_sleep") {
      behHrMod = -9.0;
      behSpo2Mod = 0.8;
      behSigmaMult = 0.6;
    } else if (this.behavior === "active_sleep") {
      behHrMod = 0.0;
      behSpo2Mod = 0.0;
      behSigmaMult = 1.0;
    } else if (this.behavior === "awake_calm") {
      behHrMod = 8.0;
      behSpo2Mod = -0.3;
      behSigmaMult = 1.2;
    } else {
      behHrMod = 30.0;
      behSpo2Mod = -2.2;
      behSigmaMult = 2.0;
    }

    let targetHr = baseHr + behHrMod;
    const o2Delta = this.targetOxygenFlow - 2.0;
    const o2Boost = o2Delta * 1.3;
    let targetSpo2 = Math.min(100.0, baseSpo2 + behSpo2Mod + o2Boost);
    let targetTemp = this.targetSkinTemp;
    let condition = "Normal";
    let isAnomaly = false;

    if (this.activeAnomaly === "bradycardia") {
      const step = this.anomalyStep;
      if (step <= 3) {
        targetSpo2 = baseSpo2 - step * 1.5;
        targetHr = baseHr - step * 3.0;
        condition = "Normal";
      } else if (step <= 7) {
        targetSpo2 = Math.max(78.0, 89.0 - (step - 3) * 2.8);
        targetHr = Math.max(90.0, baseHr - 15.0 - (step - 3) * 10.0);
        condition = "Hypoxia";
        isAnomaly = true;
      } else if (step <= 11) {
        targetHr = 66.0 + randomUniform(-4.0, 4.0);
        targetSpo2 = 80.0 + randomUniform(-2.0, 3.0);
        condition = "Bradycardia";
        isAnomaly = true;
      } else {
        const recProgress = (step - 11) / 5.0;
        targetHr = 70.0 + recProgress * (baseHr - 70.0);
        targetSpo2 = 82.0 + recProgress * (baseSpo2 - 82.0);
        condition = recProgress < 0.7 ? "Recovering" : "Normal";
      }
    } else if (this.activeAnomaly === "tachycardia") {
      const step = this.anomalyStep;
      if (step <= 6) {
        targetHr = baseHr + step * 8.0;
      } else if (step <= 14) {
        targetHr = 192.0 + randomUniform(-4.0, 5.0);
        targetTemp = baseTemp + 0.3;
      } else {
        const recProgress = (step - 14) / 4.0;
        targetHr = 192.0 - recProgress * (192.0 - baseHr);
      }
      condition = targetHr > 178 ? "Tachycardia" : "Normal";
      isAnomaly = targetHr > 178;
    } else if (this.activeAnomaly === "hypoxia") {
      const step = this.anomalyStep;
      if (step <= 5) {
        targetSpo2 = baseSpo2 - step * 2.8;
        targetHr = baseHr + step * 4.0;
      } else if (step <= 12) {
        targetSpo2 = 82.0 + randomUniform(-2.5, 2.5);
        targetHr = baseHr + 20.0;
      } else {
        const recProgress = (step - 12) / 4.0;
        targetSpo2 = 82.0 + recProgress * (baseSpo2 - 82.0);
        targetHr = baseHr + 20.0 - recProgress * 20.0;
      }
      condition = targetSpo2 < 89 ? "Hypoxia" : "Normal";
      isAnomaly = targetSpo2 < 89;
    } else if (this.activeAnomaly === "hyperthermia") {
      const step = this.anomalyStep;
      if (step <= 8) {
        targetTemp = baseTemp + step * 0.22;
        targetHr = baseHr + step * 3.5;
      } else if (step <= 16) {
        targetTemp = 38.9 + randomUniform(-0.15, 0.2);
        targetHr = baseHr + 32.0;
      } else {
        const recProgress = (step - 16) / 6.0;
        targetTemp = 38.9 - recProgress * (38.9 - baseTemp);
        targetHr = baseHr + 32.0 - recProgress * 32.0;
      }
      condition = targetTemp > 38.3 ? "Hyperthermia" : "Normal";
      isAnomaly = targetTemp > 38.3;
    } else if (this.activeAnomaly === "hypothermia") {
      const step = this.anomalyStep;
      if (step <= 8) {
        targetTemp = baseTemp - step * 0.22;
        targetHr = baseHr - step * 4.0;
      } else if (step <= 16) {
        targetTemp = 35.1 + randomUniform(-0.2, 0.2);
        targetHr = 108.0 + randomUniform(-3.0, 3.0);
      } else {
        const recProgress = (step - 16) / 6.0;
        targetTemp = 35.1 + recProgress * (baseTemp - 35.1);
        targetHr = 108.0 + recProgress * (baseHr - 108.0);
      }
      condition = targetTemp < 35.7 ? "Hypothermia" : "Normal";
      isAnomaly = targetTemp < 35.7;
    }

    return { targetHr, targetSpo2, targetTemp, condition, isAnomaly, behSigmaMult };
  }

  step(forcedAnomaly = null) {
    this.updateBehavior();

    if (forcedAnomaly) {
      if (this.activeAnomaly !== forcedAnomaly) this.startAnomaly(forcedAnomaly);
    } else if (!this.activeAnomaly) {
      const spontaneousRisk = this.profile.spontaneous_risk || 0.003;
      if (Math.random() < spontaneousRisk) {
        this.startAnomaly(this.profile.primary_risk || "bradycardia");
      }
    }

    const { targetHr, targetSpo2, targetTemp, condition, isAnomaly, behSigmaMult } = this.computeTargets();

    // Autoregressive smoothing (AR-1)
    const alphaHr = 0.78;
    const alphaSpo2 = 0.82;
    const alphaTemp = 0.94;

    const hrNoise = randomGaussian(0, (this.profile.hr_sigma || 1.2) * behSigmaMult);
    const spo2Noise = randomGaussian(0, (this.profile.spo2_sigma || 0.35) * behSigmaMult);
    const tempNoise = randomGaussian(0, 0.02);

    this.hr = alphaHr * this.hr + (1.0 - alphaHr) * targetHr + hrNoise;
    this.spo2 = alphaSpo2 * this.spo2 + (1.0 - alphaSpo2) * targetSpo2 + spo2Noise;
    this.skinTemp = alphaTemp * this.skinTemp + (1.0 - alphaTemp) * targetTemp + tempNoise;

    // Physiological limits clamping
    this.hr = Math.max(35.0, Math.min(240.0, this.hr));
    this.spo2 = Math.max(55.0, Math.min(100.0, this.spo2));
    this.skinTemp = Math.max(32.0, Math.min(42.0, this.skinTemp));

    // Closed-loop heater & fan modulation
    const tempErr = this.targetSkinTemp - this.skinTemp;
    const targetHeater = Math.max(0, Math.min(100, Math.round(50 + tempErr * 60)));
    this.heaterPower = Math.round(0.7 * this.heaterPower + 0.3 * targetHeater);

    const desatDeficit = Math.max(0.0, 93.0 - this.spo2);
    const effectiveO2 = Math.max(this.targetOxygenFlow, 2.0 + desatDeficit * 0.45);
    this.oxygenFlow = Number((0.7 * this.oxygenFlow + 0.3 * effectiveO2).toFixed(1));

    if (this.skinTemp > 38.3) this.fanSpeed = 1800;
    else if (this.heaterPower > 65) this.fanSpeed = 1500;
    else this.fanSpeed = 1200;

    if (this.activeAnomaly) {
      this.anomalyStep += 1;
      if (this.anomalyStep >= this.anomalyTotalSteps) {
        this.activeAnomaly = null;
        this.anomalyStep = 0;
        this.anomalyTotalSteps = 0;
      }
    }

    return {
      device_id: this.deviceId,
      heart_rate: Math.round(this.hr),
      spo2: Number(this.spo2.toFixed(1)),
      temperature: Number(this.skinTemp.toFixed(1)),
      heater_power: this.heaterPower,
      oxygen_flow: this.oxygenFlow,
      fan_speed: this.fanSpeed,
      phototherapy: this.phototherapy,
      anomaly_injected: isAnomaly,
      condition,
      timestamp: new Date(),
    };
  }
}

// Global registry of neonatal physiology objects
const physioRegistry = new Map();
const deviceMqttActiveUntil = new Map(); // tracks external physical/Python MQTT feeds
const forcedAnomalies = new Map();

let simulatorInterval = null;
let ioInstance = null;
let isSimulatorRunning = false;

/**
 * Register that an external MQTT packet was received for this device.
 * When external MQTT packets are coming in, the internal engine steps aside.
 */
function recordExternalMqtt(deviceId) {
  if (deviceId) {
    deviceMqttActiveUntil.set(deviceId, Date.now() + 15_000); // 15 seconds grace period
  }
}

/**
 * Apply actuator settings from web dashboard to the physiological twin.
 */
function applyTwinActuators(deviceId, controlSettings) {
  if (!deviceId || !controlSettings) return;
  let twin = physioRegistry.get(deviceId);
  if (!twin) {
    twin = new NeonatePhysiology(deviceId);
    physioRegistry.set(deviceId, twin);
  }
  twin.applyControl(
    controlSettings.targetTemperature,
    controlSettings.oxygenFlow,
    controlSettings.phototherapy
  );
}

/**
 * Set a forced anomaly scenario (e.g. "bradycardia", "hypoxia", "normal")
 */
function setSimulationScenario(deviceId, scenario) {
  const normScenario = scenario ? String(scenario).toLowerCase().trim() : null;
  if (!deviceId || deviceId === "__all__") {
    forcedAnomalies.set("__all__", normScenario === "normal" ? null : normScenario);
    for (const twin of physioRegistry.values()) {
      twin.startAnomaly(normScenario === "normal" ? null : normScenario);
    }
  } else {
    forcedAnomalies.set(deviceId, normScenario === "normal" ? null : normScenario);
    const twin = physioRegistry.get(deviceId);
    if (twin) twin.startAnomaly(normScenario === "normal" ? null : normScenario);
  }
}

/**
 * Main simulation tick: generates vitals for every active incubator with an admitted patient.
 */
async function simulationTick() {
  if (!ioInstance) return;

  try {
    // Find all active incubators
    const incubators = await Incubator.find({ status: "active" });
    if (!incubators.length) return;

    // Find all currently admitted patients
    const activePatients = await Patient.find({ dischargedAt: null });
    const patientByIncubator = new Map();
    for (const p of activePatients) {
      if (p.incubatorId) {
        patientByIncubator.set(String(p.incubatorId), p);
      }
    }

    const now = Date.now();

    for (const inc of incubators) {
      const devKey = inc.deviceTopicId || `incubator_${String(inc._id).slice(-4)}`;
      const patient = patientByIncubator.get(String(inc._id));

      // Guard 1: Empty incubator -> broadcast standby signal so UI stays in sync
      if (!patient) {
        // Broadcast standby
        const standbyPayload = {
          device_id: devKey,
          incubatorStatus: inc.status || "active",
          reason: "No patient admitted to this incubator",
        };
        let broadcaster = ioInstance.to("room:system_admin");
        if (inc.hospitalId) broadcaster = broadcaster.to(`room:hospital:${inc.hospitalId}`);
        broadcaster.emit("incubator:standby", standbyPayload);
        continue;
      }

      // Guard 2: If external MQTT (hardware or local python) is actively publishing for this bed, step aside
      const mqttUntil = deviceMqttActiveUntil.get(devKey) || 0;
      if (now < mqttUntil) {
        continue; // external source has priority
      }

      // Generate next reading
      let twin = physioRegistry.get(devKey);
      if (!twin) {
        twin = new NeonatePhysiology(devKey, patient);
        // Apply current incubator control settings
        if (inc.controlSettings) {
          twin.applyControl(
            inc.controlSettings.targetTemperature,
            inc.controlSettings.oxygenFlow,
            inc.controlSettings.phototherapy
          );
        }
        physioRegistry.set(devKey, twin);
      } else {
        twin.updatePatient(patient);
      }

      const forced = forcedAnomalies.get(devKey) || forcedAnomalies.get("__all__") || null;
      const reading = twin.step(forced);

      const scope = {
        hospitalId: inc.hospitalId,
        wardId: inc.wardId,
        incubatorId: inc._id,
        patientId: patient._id,
      };

      // 1. Save vital to MongoDB
      const vitalDoc = await Vital.create({
        ...reading,
        ...scope,
      });

      // 2. Broadcast live over Socket.io
      let broadcaster = ioInstance.to("room:system_admin");
      if (scope.hospitalId) broadcaster = broadcaster.to(`room:hospital:${scope.hospitalId}`);
      if (scope.patientId) broadcaster = broadcaster.to(`room:patient:${scope.patientId}`);
      broadcaster.emit("vitals:update", vitalDoc);

      // 3. Check clinical thresholds -> triggers alerts
      await checkThresholds({ ...reading, ...scope }, ioInstance);
    }
  } catch (err) {
    console.error("[telemetrySimulator] tick error:", err.message);
  }
}

/**
 * Start the built-in telemetry engine.
 */
function startTelemetrySimulator(io, intervalMs = 2800) {
  ioInstance = io;
  if (simulatorInterval) clearInterval(simulatorInterval);

  isSimulatorRunning = true;
  simulatorInterval = setInterval(simulationTick, intervalMs);
  console.log(`[telemetrySimulator] Autonomous telemetry engine started (interval: ${intervalMs}ms)`);
}

/**
 * Stop the engine.
 */
function stopTelemetrySimulator() {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
    simulatorInterval = null;
  }
  isSimulatorRunning = false;
  console.log("[telemetrySimulator] Telemetry engine stopped");
}

function getSimulatorStatus() {
  return {
    running: isSimulatorRunning,
    activeTwinsCount: physioRegistry.size,
    forcedScenario: forcedAnomalies.get("__all__") || null,
  };
}

module.exports = {
  startTelemetrySimulator,
  stopTelemetrySimulator,
  getSimulatorStatus,
  recordExternalMqtt,
  applyTwinActuators,
  setSimulationScenario,
};
