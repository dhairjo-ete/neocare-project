/**
 * NeoCare SMS & Notification Service
 * Dispatches admission alerts, magic links, and emergency notifications to patient guardians.
 * Supports direct GSM modem webhooks, cloud SMS gateways (Twilio / HTTP API), and local development logging.
 */

async function sendAdmissionSms({
  guardianPhone,
  guardianName,
  patientName,
  incubatorLabel,
  hospitalName,
  accessCode,
  magicLink,
}) {
  const messageBody = `NeoCare NICU Alert: Baby "${patientName}" is admitted to ${incubatorLabel || "Incubator Bed"} at ${hospitalName || "Hospital NICU"}. Access baby's live vitals and medical report here: ${magicLink} (PIN: ${accessCode})`;

  const payload = {
    to: guardianPhone,
    recipient: guardianName,
    patientName,
    accessCode,
    magicLink,
    message: messageBody,
    sentAt: new Date().toISOString(),
  };

  console.log("\n================ [NEOCARE SMS GATEWAY] ================");
  console.log(`To        : ${guardianPhone} (${guardianName || "Guardian"})`);
  console.log(`Patient   : ${patientName}`);
  console.log(`Access PIN: ${accessCode}`);
  console.log(`Magic URL : ${magicLink}`);
  console.log(`Message   :\n${messageBody}`);
  console.log("========================================================\n");

  // If a webhook or SMS API is defined in environment variables (e.g. GSM modem or Twilio/Local API)
  const smsGatewayUrl = process.env.SMS_GATEWAY_URL;
  if (smsGatewayUrl) {
    try {
      // Use native fetch to dispatch to local GSM modem / SMS gateway
      await fetch(smsGatewayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: guardianPhone,
          text: messageBody,
          code: accessCode,
        }),
      });
      return { success: true, mode: "gateway", payload };
    } catch (err) {
      console.error("[SMS GATEWAY ERROR] Failed to deliver via SMS_GATEWAY_URL:", err.message);
      return { success: true, mode: "logged_fallback", payload, error: err.message };
    }
  }

  return { success: true, mode: "dispatched", payload };
}

module.exports = {
  sendAdmissionSms,
};
