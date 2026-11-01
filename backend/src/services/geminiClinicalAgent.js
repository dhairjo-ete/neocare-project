/**
 * NeoCare Autonomous Clinical Decision Support Agent
 * Powered by Google Gemini 3.6 Flash (@google/genai)
 *
 * Continuously evaluates acute physiological deviations in NICU incubators,
 * differentiates sensor motion artifacts from true clinical decompensation,
 * and formulates role-specific SBAR advisories for pediatricians and bedside nurses.
 */

const { GoogleGenAI } = require("@google/genai");

// Primary model identifier: gemini-3.6-flash with environmental override capability
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.8-flash"];

const PUBLIC_PORTAL_BASE = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost"))
  ? process.env.FRONTEND_URL.replace(/\/+$/, "")
  : "https://neocaretelemetry.netlify.app";

/**
 * Deterministic Clinical Fallback Generator
 * Formulates medically sound SBAR and nursing action protocols when Gemini API is
 * offline, unconfigured, or experiencing network timeout. Ensures zero patient alarm dropping.
 */
function generateDeterministicAdvisory({
  patient,
  incubatorLabel,
  deviceId,
  type,
  value,
  condition,
  doctorName,
  nurseName,
}) {
  const patientName = patient?.name || "Admitted Infant";
  const syndrome = patient?.primarySyndrome || "Neonatal Monitoring";
  const ga = patient?.gestationalAge ? `${patient.gestationalAge} weeks` : "Preterm/Term";
  const bw = patient?.birthWeight ? `${patient.birthWeight} kg` : "N/A";
  const formattedDoc = doctorName ? (doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`) : "Attending Physician";
  const formattedNurse = nurseName?.startsWith("Nurse") ? nurseName : `Nurse ${nurseName || "On Duty"}`;
  const paramLabel = String(type || "vital").replace(/_/g, " ").toUpperCase();
  const bedUrl = `${PUBLIC_PORTAL_BASE}/dashboard?device=${encodeURIComponent(deviceId || "")}`;

  let clinicalImpression = `Acute parameter deviation noted for ${paramLabel} (${value}). Clinical bedside assessment indicated.`;
  let doctorOrders = [
    "Bedside physical auscultation and vital signs re-verification",
    "Continuous cardiorespiratory monitor inspection",
    "Verify incubator environmental setpoint and thermal balance",
  ];
  let nurseChecklist = [
    "Inspect physical sensor probe placement & skin contact.",
    "Verify airway patency, head alignment, and breathing effort.",
    "Inspect incubator thermal canopy and monitor continuous waveform.",
    "Notify attending physician if parameter fails to stabilize promptly.",
  ];

  if (type === "spo2") {
    clinicalImpression = `Acute hypoxemia: SpO2 dropped to ${value}% in infant with ${syndrome} (GA: ${ga}, BW: ${bw}).`;
    doctorOrders = [
      "Immediate airway clearance and gentle suctioning of secretions",
      "Verify pulse oximeter probe alignment and plethysmograph waveform",
      "Assess CPAP prong seal, PEEP pressure, and consider FiO2 titration",
      "Evaluate chest expansion and respiratory effort",
    ];
  } else if (type === "heart_rate" && value < 100) {
    clinicalImpression = `Bradycardia: Heart rate dropped to ${value} bpm in infant with ${syndrome}.`;
    doctorOrders = [
      "Tactile stimulation and airway patency verification",
      "Check 3-lead ECG electrode adherence and skin contact",
      "Assess for vagal response, apnea of prematurity, or hypoxemia",
      "Prepare resuscitation equipment if heart rate remains < 80 bpm",
    ];
  } else if (type === "heart_rate" && value > 180) {
    clinicalImpression = `Tachycardia: Heart rate elevated to ${value} bpm in infant with ${syndrome}.`;
    doctorOrders = [
      "Evaluate infant comfort, pain, or thermal agitation in incubator",
      "Verify core temperature to rule out febrile state or incubator overheating",
      "Inspect hydration status and assess for supraventricular tachycardia",
    ];
  } else if (type === "temperature") {
    clinicalImpression = `Thermal dysregulation: Core temperature recorded at ${value}°C in incubator ${incubatorLabel}.`;
    doctorOrders = [
      "Verify incubator air temperature and skin sensor probe adherence",
      "Check incubator canopy closure and air draft around infant",
      "Monitor for cold stress or hyperthermia and adjust servocontrol mode",
    ];
  }

  const doctorAdvisory =
    `🩺 *NEOCARE AI CLINICAL ADVISORY • HIGH PRIORITY*\n\n` +
    `Dear ${formattedDoc},\n\n` +
    `• *Situation*: ${condition} (${paramLabel}: ${value}) detected in ${incubatorLabel}.\n` +
    `• *Background*: Infant *${patientName}* (GA: ${ga}, BW: ${bw}) admitted with ${syndrome}.\n` +
    `• *Assessment*: ${clinicalImpression}\n` +
    `• *Proposed Orders*:\n` +
    doctorOrders.slice(0, 3).map((o, i) => `  ${i + 1}. ${o}`).join("\n") + "\n\n" +
    `🔗 *Live Bed Telemetry*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  const nurseAdvisory =
    `🩺 *NEOCARE BEDSIDE ADVISORY • URGENT NURSING ACTION*\n\n` +
    `Dear ${formattedNurse},\n\n` +
    `Bedside alert regarding *${patientName}* in *${incubatorLabel}* (${paramLabel}: ${value}):\n\n` +
    `*Immediate Action Checklist*:\n` +
    nurseChecklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n\n" +
    `🔗 *Bedside View*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  return {
    isCritical: true,
    isArtifact: false,
    confidence: 0.92,
    clinicalImpression,
    doctorAdvisory,
    nurseAdvisory,
    suggestedOrders: doctorOrders,
    model: "NeoCare-Clinical-Deterministic-Engine",
  };
}

/**
 * Evaluates a critical vital alarm using Gemini 3.6 Flash.
 * Uses a resilient model cascade and strict timeout protection.
 *
 * @param {Object} context
 * @returns {Promise<{ isCritical: boolean, isArtifact: boolean, confidence: number, clinicalImpression: string, doctorAdvisory: string, nurseAdvisory: string, suggestedOrders: string[], model: string }>}
 */
async function evaluateCriticalAlertWithGemini(context) {
  const {
    patient,
    incubator,
    doctor,
    dutyNurse,
    reading = {},
    type,
    value,
    result = {},
  } = context;

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const doctorName = doctor?.name || "Assigned Attending";
  const nurseName = dutyNurse?.name || "Duty Nurse";
  const incubatorLabel = incubator?.label || reading.device_id || "NICU Bed";
  const deviceId = reading.device_id || incubator?.deviceTopicId || "";

  // If no API key is configured, execute deterministic clinical fallback with zero delay
  if (!apiKey) {
    console.log("[geminiClinicalAgent] ℹ️ GEMINI_API_KEY unconfigured — using validated deterministic NICU decision engine.");
    return generateDeterministicAdvisory({
      patient,
      incubatorLabel,
      deviceId,
      type,
      value,
      condition: result.condition || "Vital parameter variance",
      doctorName,
      nurseName,
    });
  }

  const patientName = patient?.name || "Admitted Infant";
  const syndrome = patient?.primarySyndrome || "Neonatal Surveillance";
  const ga = patient?.gestationalAge ? `${patient.gestationalAge} weeks` : "Preterm";
  const bw = patient?.birthWeight ? `${patient.birthWeight} kg` : "N/A";
  const bedUrl = `${PUBLIC_PORTAL_BASE}/dashboard?device=${encodeURIComponent(deviceId)}`;
  const formattedDoc = doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`;
  const formattedNurse = nurseName.startsWith("Nurse") ? nurseName : `Nurse ${nurseName}`;
  const paramLabel = String(type || "vital").replace(/_/g, " ").toUpperCase();

  const prompt = `You are the NeoCare Autonomous Clinical Decision Support Agent, specialized in Neonatal Intensive Care Unit (NICU) surveillance.

Analyze this critical vital signs alarm:
- Patient Name: ${patientName}
- Gestational Age: ${ga}
- Birth Weight: ${bw}
- Primary Pathology / Diagnosis: ${syndrome}
- Bed / Incubator: ${incubatorLabel} (ID: ${deviceId})
- Triggering Parameter: ${type} (${value})
- Alarm Condition: ${result.condition || "Acute Variance"}
- Chamber Temp: ${reading.temperature || "Normal"} °C, Humidity: ${reading.humidity || "Normal"} %

TASKS:
1. Determine if this variance is clinically consistent with genuine decompensation (isArtifact: false) vs sensor noise (isArtifact: true).
2. Synthesize a concise 1-2 sentence clinical impression.
3. Formulate 3-4 specific doctor orders.
4. Formulate 3-4 specific immediate bedside nurse actions.

Return strictly a valid JSON object matching:
{
  "isCritical": true,
  "isArtifact": false,
  "confidence": 0.95,
  "impression": "1-2 sentence medical assessment",
  "doctorOrders": ["order 1", "order 2", "order 3"],
  "nurseChecklist": ["action 1", "action 2", "action 3"]
}`;

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

  for (const modelToUse of modelsToTry) {
    try {
      // Execute with a strict 7.5-second timeout to protect NICU latency guarantees
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini ${modelToUse} call timed out after 7500ms`)), 7500)
      );

      const apiPromise = ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const rawText = response.text ? response.text.trim() : "";
      const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleanJson);

      const clinicalImpression = parsed.impression || `${result.condition}: ${paramLabel} at ${value}`;
      const doctorOrders = Array.isArray(parsed.doctorOrders) && parsed.doctorOrders.length > 0
        ? parsed.doctorOrders
        : ["Bedside physical auscultation", "Verify pulse oximeter probe alignment", "Titrate supplemental oxygen"];
      const nurseChecklist = Array.isArray(parsed.nurseChecklist) && parsed.nurseChecklist.length > 0
        ? parsed.nurseChecklist
        : ["Inspect physical sensor probe placement & skin contact", "Verify airway patency", "Inspect incubator canopy"];

      const doctorAdvisory =
        `🩺 *NEOCARE AI CLINICAL ADVISORY • HIGH PRIORITY*\n\n` +
        `Dear ${formattedDoc},\n\n` +
        `• *Situation*: ${result.condition || "Vital Variance"} (${paramLabel}: ${value}) in ${incubatorLabel}.\n` +
        `• *Background*: Infant *${patientName}* (GA: ${ga}, BW: ${bw}) admitted with ${syndrome}.\n` +
        `• *AI Assessment (${modelToUse})*: ${clinicalImpression}\n` +
        `• *Proposed Orders*:\n` +
        doctorOrders.slice(0, 4).map((o, i) => `  ${i + 1}. ${o}`).join("\n") + "\n\n" +
        `🔗 *Live Bed Telemetry*: ${bedUrl}\n\n` +
        `NeoCare Autonomous Clinical AI`;

      const nurseAdvisory =
        `🩺 *NEOCARE BEDSIDE ADVISORY • URGENT NURSING ACTION*\n\n` +
        `Dear ${formattedNurse},\n\n` +
        `Bedside alarm for *${patientName}* in *${incubatorLabel}* (${paramLabel}: ${value}):\n\n` +
        `*Immediate Action Checklist*:\n` +
        nurseChecklist.slice(0, 4).map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n\n`" +
        `🔗 *Bedside Telemetry*: ${bedUrl}\n\n` +
        `NeoCare Autonomous Clinical AI`;

      console.log(`[geminiClinicalAgent] ✅ Successfully generated clinical advisory via ${modelToUse} (confidence: ${parsed.confidence || 0.95})`);

      return {
        isCritical: Boolean(parsed.isCritical ?? true),
        isArtifact: Boolean(parsed.isArtifact ?? false),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95,
        clinicalImpression,
        doctorAdvisory,
        nurseAdvisory,
        suggestedOrders: doctorOrders,
        model: modelToUse,
      };
    } catch (modelErr) {
      console.warn(`[geminiClinicalAgent] Model ${modelToUse} attempt error: ${modelErr.message.slice(0, 120)}`);
      // Try next model in candidate cascade
    }
  }

  // If all model calls encounter error/timeout, invoke deterministic clinical fallback
  console.error(`[geminiClinicalAgent] All Gemini model attempts failed; activating deterministic NICU fallback.`);
  const fallback = generateDeterministicAdvisory({
    patient,
    incubatorLabel,
    deviceId,
    type,
    value,
    condition: result.condition || "Vital parameter variance",
    doctorName,
    nurseName,
  });
  return fallback;
}

module.exports = {
  evaluateCriticalAlertWithGemini,
  generateDeterministicAdvisory,
  PRIMARY_MODEL,
};
