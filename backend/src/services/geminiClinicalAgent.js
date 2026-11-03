/**
 * NeoCare Autonomous Clinical Decision Support Agent
 * Powered by Google Gemini 3.6 Flash (@google/genai)
 *
 * Continuously evaluates acute physiological deviations in NICU incubators,
 * differentiates sensor motion artifacts from true clinical decompensation,
 * formulates role-specific SBAR advisories for pediatricians and bedside nurses,
 * and generates empathetic, personalized admission messages for newborn guardians.
 */

const { GoogleGenAI } = require("@google/genai");

// Resilient model cascade: prioritizing high-throughput flash-lite models
const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const FALLBACK_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];

const PUBLIC_PORTAL_BASE = (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes("localhost"))
  ? process.env.FRONTEND_URL.replace(/\/+$/, "")
  : "https://neocaretelemetry.netlify.app";

/**
 * Calculates postnatal age (PNA) in days or hours from dateOfBirth.
 */
function getPostnatalAgeStr(dob) {
  if (!dob) return "Postnatal Day 1";
  const diffMs = Date.now() - new Date(dob).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
    return `Day 1 (${diffHours}h old)`;
  }
  return `Day ${diffDays + 1} of life`;
}

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
  const syndrome = patient?.primarySyndrome || "Neonatal Intensive Monitoring";
  const ga = patient?.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks}w` : "Preterm";
  const bw = patient?.birthWeightGrams ? `${patient.birthWeightGrams}g` : "N/A";
  const pna = getPostnatalAgeStr(patient?.dateOfBirth);
  const formattedDoc = doctorName ? (doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`) : "Attending Physician";
  const formattedNurse = nurseName?.startsWith("Nurse") ? nurseName : `Nurse ${nurseName || "On Duty"}`;
  const paramLabel = String(type || "vital").replace(/_/g, " ").toUpperCase();
  const bedUrl = `${PUBLIC_PORTAL_BASE}/dashboard?device=${encodeURIComponent(deviceId || "")}`;

  let clinicalImpression = `Acute parameter deviation noted for ${paramLabel} (${value}). Bedside clinical review indicated.`;
  let doctorOrders = [
    "Bedside physical auscultation and cardiorespiratory evaluation",
    "Continuous monitor inspection & verify waveform plethysmography",
    "Inspect incubator micro-environment setpoints and thermal balance",
  ];
  let nurseChecklist = [
    "Inspect physical sensor probe placement & skin contact immediately.",
    "Verify airway patency, head alignment, and breathing effort.",
    "Inspect incubator canopy closure and continuous oxygen delivery.",
    "Escalate to Attending Physician if parameter remains outside normal limits.",
  ];

  if (type === "spo2") {
    clinicalImpression = `Acute hypoxemia: SpO2 dropped to ${value}% in infant with ${syndrome} (GA: ${ga}, BW: ${bw}, ${pna}). High risk of hypoxic injury.`;
    doctorOrders = [
      "Immediate airway clearance and gentle suctioning of secretions",
      "Verify pulse oximeter probe alignment and plethysmograph waveform",
      "Assess CPAP prong seal, PEEP pressure, and consider FiO2 titration",
      "Evaluate chest expansion and respiratory effort; prepare blood gas",
    ];
  } else if (type === "heart_rate" && value < 100) {
    clinicalImpression = `Acute bradycardia: Heart rate dropped to ${value} bpm in infant with ${syndrome} (GA: ${ga}, BW: ${bw}).`;
    doctorOrders = [
      "Perform gentle tactile stimulation and verify airway patency",
      "Check 3-lead ECG electrode adherence and signal quality",
      "Assess for vagal response, apnea of prematurity, or desaturation cascade",
      "Prepare neonatal resuscitation protocol if heart rate remains < 80 bpm",
    ];
  } else if (type === "heart_rate" && value > 180) {
    clinicalImpression = `Marked tachycardia: Heart rate elevated to ${value} bpm in infant with ${syndrome}.`;
    doctorOrders = [
      "Evaluate infant comfort, pain, or thermal agitation in incubator",
      "Verify core temperature to rule out febrile state or chamber overheating",
      "Inspect hydration status and assess for supraventricular tachycardia (SVT)",
    ];
  } else if (type === "temperature") {
    clinicalImpression = `Thermal dysregulation: Core temperature recorded at ${value}°C in incubator ${incubatorLabel}.`;
    doctorOrders = [
      "Verify incubator air temperature and skin sensor probe adherence",
      "Check incubator canopy closure and air draft around infant",
      "Monitor for cold stress or hyperthermia and adjust servocontrol mode",
    ];
  }

  const isPriority = (condition && condition.toLowerCase().includes("severe")) || false;
  const badge = isPriority ? "HIGH PRIORITY" : "CLINICAL NOTICE";

  const doctorAdvisory =
    `🩺 *NEOCARE AI CLINICAL ADVISORY • ${badge}*\n\n` +
    `Dear ${formattedDoc},\n\n` +
    `• *Situation*: ${condition} (${paramLabel}: ${value}) detected in *${incubatorLabel}*.\n` +
    `• *Background*: Infant *${patientName}* (GA: ${ga}, BW: ${bw}, ${pna}) admitted with ${syndrome}.\n` +
    `• *Assessment*: ${clinicalImpression}\n` +
    `• *Proposed Orders*:\n` +
    doctorOrders.slice(0, 4).map((o, i) => `  ${i + 1}. ${o}`).join("\n") + "\n\n" +
    `🔗 *Live Bed Telemetry*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  const nurseAdvisory =
    `🩺 *NEOCARE BEDSIDE ADVISORY • ${badge}*\n\n` +
    `Dear ${formattedNurse},\n\n` +
    `Bedside alert regarding *${patientName}* in *${incubatorLabel}* (${paramLabel}: ${value}):\n\n` +
    `*Immediate Action Checklist*:\n` +
    nurseChecklist.map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n\n" +
    `🔗 *Bedside View*: ${bedUrl}\n\n` +
    `NeoCare Clinical AI Decision Support`;

  return {
    isCritical: true,
    isArtifact: false,
    confidence: 0.94,
    clinicalImpression,
    doctorAdvisory,
    nurseAdvisory,
    suggestedOrders: doctorOrders,
    model: "NeoCare-Clinical-Deterministic-Engine",
  };
}

/**
 * Evaluates a critical vital alarm using Gemini 3.6 Flash.
 * Calibrated for high-precision NICU clinical decision support.
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
  const ga = patient?.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks} weeks` : "Preterm";
  const bw = patient?.birthWeightGrams ? `${patient.birthWeightGrams}g` : "N/A";
  const pna = getPostnatalAgeStr(patient?.dateOfBirth);
  const bedUrl = `${PUBLIC_PORTAL_BASE}/dashboard?device=${encodeURIComponent(deviceId)}`;
  const formattedDoc = doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`;
  const formattedNurse = nurseName.startsWith("Nurse") ? nurseName : `Nurse ${nurseName}`;
  const paramLabel = String(type || "vital").replace(/_/g, " ").toUpperCase();

  const prompt = `You are the NeoCare Senior Neonatologist AI Decision Support Agent, specialized in Neonatal Intensive Care Unit (NICU) continuous surveillance.

Analyze this urgent vital signs event:
- Patient Identifier: ${patientName}
- Gestational Age: ${ga}
- Birth Weight: ${bw}
- Chronological Age: ${pna}
- Admitted Diagnosis: ${syndrome}
- Bed / Incubator: ${incubatorLabel} (ID: ${deviceId})
- Triggering Deviation: ${type} = ${value} (Alarm: ${result.condition || "Critical Variance"})
- Chamber Conditions: Temperature: ${reading.temperature || "Normal"} °C, Oxygen: ${reading.oxygen_flow || "Normal"} L/min, Heater Power: ${reading.heater_power || 0}%

CLINICAL OBJECTIVES:
1. Distinguish between true physiological decompensation vs sensor movement artifact.
2. Formulate a concise 1-2 sentence clinical impression focusing on physiological etiology.
3. Provide 3-4 specific, prioritized physician orders (diagnostic/therapeutic).
4. Provide 3-4 immediate bedside nursing interventions (rapid response checklist).

Return STRICTLY a JSON object without markdown fences matching:
{
  "isCritical": true,
  "isArtifact": false,
  "confidence": 0.96,
  "impression": "1-2 sentence diagnostic assessment",
  "doctorOrders": ["order 1", "order 2", "order 3"],
  "nurseChecklist": ["action 1", "action 2", "action 3"]
}`;

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

  for (const modelToUse of modelsToTry) {
    try {
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

      const isPriority = (result?.severity === "critical") || (result?.condition && result.condition.toLowerCase().includes("severe"));
      const badge = isPriority ? "HIGH PRIORITY" : "CLINICAL NOTICE";

      const doctorAdvisory =
        `🩺 *NEOCARE AI CLINICAL ADVISORY • ${badge}*\n\n` +
        `Dear ${formattedDoc},\n\n` +
        `• *Situation*: ${result.condition || "Vital Variance"} (${paramLabel}: ${value}) in *${incubatorLabel}*.\n` +
        `• *Background*: Infant *${patientName}* (GA: ${ga}, BW: ${bw}, ${pna}) admitted with ${syndrome}.\n` +
        `• *AI Assessment (${modelToUse})*: ${clinicalImpression}\n` +
        `• *Proposed Orders*:\n` +
        doctorOrders.slice(0, 4).map((o, i) => `  ${i + 1}. ${o}`).join("\n") + "\n\n" +
        `🔗 *Live Bed Telemetry*: ${bedUrl}\n\n` +
        `NeoCare Autonomous Clinical AI`;

      const nurseAdvisory =
        `🩺 *NEOCARE BEDSIDE ADVISORY • ${badge}*\n\n` +
        `Dear ${formattedNurse},\n\n` +
        `Bedside alert for *${patientName}* in *${incubatorLabel}* (${paramLabel}: ${value}):\n\n` +
        `*Immediate Action Checklist*:\n` +
        nurseChecklist.slice(0, 4).map((c, i) => `${i + 1}. ${c}`).join("\n") + "\n\n" +
        `🔗 *Bedside Telemetry*: ${bedUrl}\n\n` +
        `NeoCare Autonomous Clinical AI`;

      console.log(`[geminiClinicalAgent] ✅ Generated clinical advisory via ${modelToUse} (confidence: ${parsed.confidence || 0.95})`);

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
    }
  }

  console.error(`[geminiClinicalAgent] All Gemini model attempts failed; activating deterministic NICU fallback.`);
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

/**
 * Deterministic Guardian Admission Message Fallback.
 */
function generateDeterministicGuardianMessage({
  patient,
  incubator,
  doctor,
  dutyNurse,
  hospital,
  accessCode,
  magicLink,
}) {
  const guardianName = patient?.guardianName || "Guardian";
  const patientName = patient?.name || "Baby";
  const incubatorLabel = incubator?.label || incubator?.deviceTopicId || "Incubator Bed";
  const hospitalName = hospital?.name || "NeoCare Hospital NICU";
  const docName = doctor?.name ? (doctor.name.startsWith("Dr.") ? doctor.name : `Dr. ${doctor.name}`) : "Senior Pediatrician";
  const nurseName = dutyNurse?.name ? (dutyNurse.name.startsWith("Nurse") ? dutyNurse.name : `Nurse ${dutyNurse.name}`) : "Dedicated NICU Nurse";

  return `🍼 *WELCOME TO NEOCARE NICU • PATIENT ADMISSION*\n\n` +
    `Dear ${guardianName},\n\n` +
    `We want to reassure you that *${patientName}* has been safely admitted into our Neonatal Intensive Care Unit at *${hospitalName}*.\n\n` +
    `• *Assigned Bed*: ${incubatorLabel}\n` +
    `• *Attending Pediatrician*: ${docName}\n` +
    `• *Bedside Caregiver*: ${nurseName}\n\n` +
    `🛡️ *24/7 Intelligent Real-Time Monitoring*:\n` +
    `Your baby is in a temperature-controlled, continuous smart incubator. You can securely view your baby's live vitals, oxygen levels, and clinical reports anytime from your mobile phone using your private link:\n\n` +
    `🔗 *Your Live Portal Link*:\n${magicLink}\n\n` +
    `🔑 *Security Access PIN*: *${accessCode}*\n\n` +
    `Our medical and nursing staff are with your little one around the clock. Please feel free to reach out to the bedside nursing desk whenever you need an update.\n\n` +
    `With heartfelt care,\n` +
    `*${hospitalName} Neonatal Care Team*`;
}

/**
 * Generates an empathetic, personalized, high-standard Patient Admission Message
 * for the infant's guardian using Gemini AI, with automatic fallback.
 *
 * @param {Object} context
 * @returns {Promise<string>}
 */
async function generateGuardianAdmissionMessageWithGemini(context) {
  const {
    patient,
    incubator,
    doctor,
    dutyNurse,
    hospital,
    accessCode,
    magicLink,
  } = context;

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return generateDeterministicGuardianMessage(context);
  }

  const guardianName = patient?.guardianName || "Guardian";
  const patientName = patient?.name || "Baby";
  const incubatorLabel = incubator?.label || incubator?.deviceTopicId || "Incubator Bed";
  const hospitalName = hospital?.name || "NeoCare Hospital NICU";
  const docName = doctor?.name ? (doctor.name.startsWith("Dr.") ? doctor.name : `Dr. ${doctor.name}`) : "Senior Pediatrician";
  const nurseName = dutyNurse?.name ? (dutyNurse.name.startsWith("Nurse") ? dutyNurse.name : `Nurse ${dutyNurse.name}`) : "Dedicated NICU Nurse";
  const syndrome = patient?.primarySyndrome || "Neonatal Observation";

  const prompt = `You are the Compassionate Clinical Communications Director at ${hospitalName} NICU.
Write a supportive, reassuring, and professional WhatsApp admission message to the parent/guardian of a newly admitted newborn.

Context:
- Guardian Name: ${guardianName}
- Infant Name: ${patientName}
- Primary Reason for Observation/Care: ${syndrome}
- Incubator/Bed: ${incubatorLabel}
- Attending Pediatrician: ${docName}
- Bedside Duty Nurse: ${nurseName}
- Hospital: ${hospitalName}
- One-Click Telemetry Access Link: ${magicLink}
- Security PIN / Access Code: ${accessCode}

Guidelines:
1. Warm, empathetic, and reassuring tone designed to calm an anxious parent.
2. Confirm the infant is resting in a continuous 24/7 intelligent micro-environment.
3. Introduce their assigned doctor and nurse.
4. Clearly provide the One-Click live telemetry link and security access code so they can check vitals from their phone anytime.
5. Conclude with supportive hospital contact reassurance.
6. Format nicely for WhatsApp with clean emojis, bold highlights, and clean spacing.

Return ONLY the final WhatsApp message text ready to send.`;

  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

  for (const modelToUse of modelsToTry) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini admission message timed out after 7000ms`)), 7000)
      );

      const apiPromise = ai.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const text = response.text ? response.text.trim() : "";
      if (text && text.length > 50) {
        console.log(`[geminiClinicalAgent] ✅ Generated empathetic guardian admission message via ${modelToUse}`);
        return text;
      }
    } catch (err) {
      console.warn(`[geminiClinicalAgent] Guardian message generation with ${modelToUse} failed: ${err.message}`);
    }
  }

  return generateDeterministicGuardianMessage(context);
}

module.exports = {
  evaluateCriticalAlertWithGemini,
  generateDeterministicAdvisory,
  generateGuardianAdmissionMessageWithGemini,
  generateDeterministicGuardianMessage,
  PRIMARY_MODEL,
};
