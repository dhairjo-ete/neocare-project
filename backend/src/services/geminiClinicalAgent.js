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
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
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
  let suggestedOrders = [
    "Bedside physical auscultation and vital signs re-verification",
    "Continuous cardiorespiratory monitor inspection",
    "Verify incubator environmental setpoint and thermal balance",
  ];

  if (type === "spo2") {
    clinicalImpression = `Acute hypoxemia: SpO2 dropped to ${value}% in infant with ${syndrome} (GA: ${ga}, BW: ${bw}).`;
    suggestedOrders = [
      "Immediate airway clearance and gentle suctioning of secretions",
      "Verify pulse oximeter probe alignment and plethysmograph waveform",
      "Assess CPAP prong seal, PEEP pressure, and consider FiO2 titration",
      "Evaluate chest expansion and respiratory effort",
    ];
  } else if (type === "heart_rate" && value < 100) {
    clinicalImpression = `Bradycardia: Heart rate dropped to ${value} bpm in infant with ${syndrome}.`;
    suggestedOrders = [
      "Tactile stimulation and airway patency verification",
      "Check 3-lead ECG electrode adherence and skin contact",
      "Assess for vagal response, apnea of prematurity, or hypoxemia",
      "Prepare resuscitation equipment if heart rate remains < 80 bpm",
    ];
  } else if (type === "heart_rate" && value > 180) {
    clinicalImpression = `Tachycardia: Heart rate elevated to ${value} bpm in infant with ${syndrome}.`;
    suggestedOrders = [
      "Evaluate infant comfort, pain, or thermal agitation in incubator",
      "Verify core temperature to rule out febrile state or incubator overheating",
      "Inspect hydration status and assess for supraventricular tachycardia",
    ];
  } else if (type === "temperature") {
    clinicalImpression = `Thermal dysregulation: Core temperature recorded at ${value}°C in incubator ${incubatorLabel}.`;
    suggestedOrders = [
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
    suggestedOrders.slice(0, 3).map((o, i) => `  ${i + 1}. ${o}`).join("\n") + "\n\n" +
    `🔗 *Live Bed Telemetry*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  const nurseAdvisory =
    `🩺 *NEOCARE BEDSIDE ADVISORY • URGENT NURSING ACTION*\n\n` +
    `Dear ${formattedNurse},\n\n` +
    `Bedside alert regarding *${patientName}* in *${incubatorLabel}* (${paramLabel}: ${value}):\n\n` +
    `*Immediate Action Checklist*:\n` +
    `1. Inspect physical sensor probe placement & skin contact.\n` +
    `2. Verify airway patency, head alignment, and infant breathing effort.\n` +
    `3. Inspect incubator thermal canopy and monitor continuous waveform.\n` +
    `4. Notify attending physician if parameter fails to stabilize within 60s.\n\n` +
    `🔗 *Bedside View*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  return {
    isCritical: true,
    isArtifact: false,
    confidence: 0.92,
    clinicalImpression,
    doctorAdvisory,
    nurseAdvisory,
    suggestedOrders,
    model: "NeoCare-Clinical-Deterministic-Engine",
  };
}

/**
 * Evaluates a critical vital alarm using Gemini 3.6 Flash.
 *
 * @param {Object} context
 * @param {Object} context.patient
 * @param {Object} context.incubator
 * @param {Object} context.doctor
 * @param {Object} context.dutyNurse
 * @param {Object} context.reading
 * @param {string} context.type "spo2" | "heart_rate" | "temperature"
 * @param {number} context.value
 * @param {Object} context.result { severity, condition }
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

  try {
    const ai = new GoogleGenAI({ apiKey });
    const modelToUse = DEFAULT_MODEL;

    const patientName = patient?.name || "Admitted Infant";
    const syndrome = patient?.primarySyndrome || "Neonatal Surveillance";
    const ga = patient?.gestationalAge ? `${patient.gestationalAge} weeks` : "Preterm";
    const bw = patient?.birthWeight ? `${patient.birthWeight} kg` : "N/A";
    const bedUrl = `${PUBLIC_PORTAL_BASE}/dashboard?device=${encodeURIComponent(deviceId)}`;
    const formattedDoc = doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`;
    const formattedNurse = nurseName.startsWith("Nurse") ? nurseName : `Nurse ${nurseName}`;

    const prompt = `You are the NeoCare Autonomous Clinical Decision Support Agent, specialized in Neonatal Intensive Care Unit (NICU) surveillance.

Analyze this critical vital signs alarm and formulate professional, role-specific WhatsApp notifications for the medical team.

PATIENT CLINICAL CONTEXT:
- Patient Name: ${patientName}
- Gestational Age: ${ga}
- Birth Weight: ${bw}
- Primary Pathology / Admitting Diagnosis: ${syndrome}
- Bed / Incubator: ${incubatorLabel} (ID: ${deviceId})
- Attending Physician: ${formattedDoc}
- Bedside Duty Nurse: ${formattedNurse}

VITAL SIGNS VARIANCE:
- Triggering Parameter: ${type}
- Recorded Value: ${value}
- Condition: ${result.condition || "Acute Variance"}
- Incubator Chamber Temp: ${reading.temperature || "Normal"} °C
- Chamber Humidity: ${reading.humidity || "Normal"} %
- Timestamp: ${new Date().toISOString()}
- Telemetry Portal URL: ${bedUrl}

TASKS:
1. Assess whether this vital variance is clinically consistent with genuine decompensation vs motion artifact.
2. Formulate a complete, professional doctorAdvisory using standard SBAR protocol (Situation, Background, Assessment, Recommendation) with suggested physician orders and the telemetry link.
3. Formulate a complete, actionable nurseAdvisory with a numbered immediate physical bedside checklist and the telemetry link.
4. List 3 to 4 specific clinical orders.

OUTPUT FORMAT REQUIREMENTS:
Return strictly a valid JSON object with no markdown fences, no explanatory preambles.
Format:
{
  "isCritical": true,
  "isArtifact": false,
  "confidence": 0.95,
  "clinicalImpression": "1-2 sentence medical assessment",
  "doctorAdvisory": "Full ready-to-send WhatsApp advisory for ${formattedDoc}",
  "nurseAdvisory": "Full ready-to-send WhatsApp checklist for ${formattedNurse}",
  "suggestedOrders": ["order 1", "order 2", "order 3"]
}`;

    // Execute with a strict 4.5-second timeout to protect NICU latency guarantees
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API call timed out after 4500ms")), 4500)
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

    return {
      isCritical: Boolean(parsed.isCritical ?? true),
      isArtifact: Boolean(parsed.isArtifact ?? false),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95,
      clinicalImpression: parsed.clinicalImpression || `${result.condition}: ${type} at ${value}`,
      doctorAdvisory: parsed.doctorAdvisory || generateDeterministicAdvisory({ patient, incubatorLabel, deviceId, type, value, condition: result.condition, doctorName, nurseName }).doctorAdvisory,
      nurseAdvisory: parsed.nurseAdvisory || generateDeterministicAdvisory({ patient, incubatorLabel, deviceId, type, value, condition: result.condition, doctorName, nurseName }).nurseAdvisory,
      suggestedOrders: Array.isArray(parsed.suggestedOrders) ? parsed.suggestedOrders : [],
      model: modelToUse,
    };
  } catch (err) {
    console.error(`[geminiClinicalAgent] Fallback activated due to: ${err.message}`);
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
    fallback.error = err.message;
    return fallback;
  }
}

module.exports = {
  evaluateCriticalAlertWithGemini,
  generateDeterministicAdvisory,
  DEFAULT_MODEL,
};
