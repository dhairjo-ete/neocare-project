const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (err) {
  // Ignore
}

// Auto-retry connection if Wi-Fi network interface is still initializing
async function connectDB(retries = 5, delayMs = 2500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        tls: true,
        retryWrites: true,
      });
      console.log("[mongodb] connected");
      return;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[mongodb] Connection attempt ${attempt}/${retries} failed. Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error("[mongodb] Connection failed after retries:", err.message);
        process.exit(1);
      }
    }
  }
}

module.exports = connectDB;
