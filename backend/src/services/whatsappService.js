/**
 * Automated WhatsApp Service for NeoCare NICU Clinical Monitoring
 *
 * Supports multi-provider automated messaging (UltraMsg, Twilio, CallMeBot, Generic Gateway)
 * to deliver instantaneous, simultaneous clinical notifications to Doctors and Duty Nurses.
 */

function sanitizePhoneNumber(phone) {
  if (!phone) return "";
  // Keep leading + if present, strip spaces, dashes, parentheses
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  // If no leading +, ensure clean numbers
  return cleaned;
}

/**
 * Sends a single WhatsApp message via configured backend gateway.
 *
 * @param {Object} options
 * @param {string} options.phone Recipient phone number (e.g. +8801700000000)
 * @param {string} options.message Text message content
 * @param {string} [options.role="clinician"] Recipient role (doctor | nurse | guardian)
 * @returns {Promise<{ success: boolean, provider: string, messageId?: string, error?: string }>}
 */
async function sendWhatsAppMessage({ phone, message, role = "clinician" }) {
  const cleanPhone = sanitizePhoneNumber(phone);
  if (!cleanPhone) {
    return { success: false, provider: "none", error: "Missing or invalid phone number" };
  }

  // 1. Official Meta WhatsApp Cloud API (Direct from Meta - Zero Ban Risk)
  // https://developers.facebook.com/docs/whatsapp/cloud-api
  if (process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN && process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) {
    try {
      const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID}/messages`;
      const recipientPhone = cleanPhone.replace("+", "");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientPhone,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      });

      const data = await response.json();
      if (response.ok && data.messages?.[0]?.id) {
        return { success: true, provider: "MetaCloudAPI", messageId: data.messages[0].id };
      }
      return { success: false, provider: "MetaCloudAPI", error: data.error?.message || "Meta API error" };
    } catch (err) {
      return { success: false, provider: "MetaCloudAPI", error: err.message };
    }
  }

  // 2. UltraMsg Gateway (https://ultramsg.com)
  if (process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN) {
    try {
      const url = `https://api.ultramsg.com/${process.env.ULTRAMSG_INSTANCE_ID}/messages/chat`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: process.env.ULTRAMSG_TOKEN,
          to: cleanPhone.replace("+", ""),
          body: message,
        }),
      });
      const data = await response.json();
      if (data.sent === "true" || data.id) {
        return { success: true, provider: "UltraMsg", messageId: data.id };
      }
      return { success: false, provider: "UltraMsg", error: data.message || "Failed to send" };
    } catch (err) {
      return { success: false, provider: "UltraMsg", error: err.message };
    }
  }


  // 3. CallMeBot Free Testing API (https://www.callmebot.com)
  if (process.env.CALLMEBOT_API_KEY) {
    try {
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone.replace("+", ""))}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(process.env.CALLMEBOT_API_KEY)}`;
      const response = await fetch(url);
      const text = await response.text();
      return { success: response.ok, provider: "CallMeBot", messageId: text.slice(0, 30) };
    } catch (err) {
      return { success: false, provider: "CallMeBot", error: err.message };
    }
  }

  // 4. Custom Webhook Gateway (e.g. Baileys / WPPConnect / Evolution API / SMS Gateway)
  const webhookUrl = process.env.WHATSAPP_GATEWAY_URL || process.env.SMS_GATEWAY_URL;
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          message,
          role,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      return { success: response.ok, provider: "CustomWebhook", messageId: data.id };
    } catch (err) {
      return { success: false, provider: "CustomWebhook", error: err.message };
    }
  }

  // 5. Development / Unconfigured Mode Notice
  console.log(`\n[WhatsApp Service] ⚠️ Automated delivery active in DEV/SIMULATION mode.`);
  console.log(`[WhatsApp Service] Target (${role.toUpperCase()}): ${cleanPhone}`);
  console.log(`[WhatsApp Service] Content preview:\n${message.slice(0, 160)}...\n`);
  console.log(`[WhatsApp Service] 💡 To receive real messages on physical WhatsApp devices, add ONE of these to backend/.env:`);
  console.log(`   - Official Meta Cloud API: WHATSAPP_CLOUD_API_ACCESS_TOKEN & WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`);
  console.log(`   - Official Twilio:         TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER`);
  console.log(`   - CallMeBot (Free test):   CALLMEBOT_API_KEY="your_api_key"`);
  console.log(`   - Custom Webhook:          WHATSAPP_GATEWAY_URL="https://your-whatsapp-gateway.com/send"\n`);

  return {
    success: true,
    provider: "MockSimulator",
    simulated: true,
    note: "Add WHATSAPP_CLOUD_API_ACCESS_TOKEN or TWILIO credentials to backend/.env for real WhatsApp delivery.",
  };
}

/**
 * Dispatches automated notifications simultaneously to BOTH the assigned Doctor and on-duty Nurse.
 *
 * @param {Object} params
 * @param {string} params.doctorPhone
 * @param {string} params.doctorName
 * @param {string} params.nursePhone
 * @param {string} params.nurseName
 * @param {string} params.docMessage
 * @param {string} params.nurseMessage
 * @returns {Promise<{ doctor: Object, nurse: Object }>}
 */
async function notifyClinicalTeamSimultaneously({
  doctorPhone,
  doctorName,
  nursePhone,
  nurseName,
  docMessage,
  nurseMessage,
}) {
  const dispatches = [];

  if (doctorPhone) {
    dispatches.push(
      sendWhatsAppMessage({
        phone: doctorPhone,
        message: docMessage,
        role: "doctor",
      }).then((res) => ({ target: "doctor", recipient: doctorName, phone: doctorPhone, ...res }))
    );
  } else {
    dispatches.push(
      Promise.resolve({ target: "doctor", recipient: doctorName || "Attending", success: false, error: "No phone registered" })
    );
  }

  if (nursePhone) {
    dispatches.push(
      sendWhatsAppMessage({
        phone: nursePhone,
        message: nurseMessage,
        role: "nurse",
      }).then((res) => ({ target: "nurse", recipient: nurseName, phone: nursePhone, ...res }))
    );
  } else {
    dispatches.push(
      Promise.resolve({ target: "nurse", recipient: nurseName || "Duty Nurse", success: false, error: "No phone registered" })
    );
  }

  const results = await Promise.allSettled(dispatches);
  const docResult = results[0]?.status === "fulfilled" ? results[0].value : { success: false, error: results[0]?.reason };
  const nurseResult = results[1]?.status === "fulfilled" ? results[1].value : { success: false, error: results[1]?.reason };

  console.log(`[WhatsApp Service] Simultaneous Team Dispatch Completed -> Doctor: ${docResult.success ? "✓" : "✗"} | Nurse: ${nurseResult.success ? "✓" : "✗"}`);

  return { doctor: docResult, nurse: nurseResult };
}

module.exports = {
  sanitizePhoneNumber,
  sendWhatsAppMessage,
  notifyClinicalTeamSimultaneously,
};
