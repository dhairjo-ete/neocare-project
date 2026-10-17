// Minimal Firebase Cloud Messaging sender using the legacy HTTP API.
// For production, migrate to the Firebase Admin SDK instead.
async function sendPushAlert(alert) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.warn("[fcm] FCM_SERVER_KEY not set, skipping push notification");
    return;
  }

  try {
    await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${serverKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: "/topics/neocare_alerts", // send to a topic all caregiver devices subscribe to
        notification: {
          title: `${alert.severity.toUpperCase()} alert - ${alert.device_id}`,
          body: `${alert.type.replace("_", " ")} reading: ${alert.value}`,
        },
        data: { alertId: alert._id.toString() },
      }),
    });
  } catch (err) {
    console.error("[fcm] failed to send push:", err.message);
  }
}

module.exports = { sendPushAlert };
