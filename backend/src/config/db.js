const mongoose = require("mongoose");
const dns = require("dns");

// Fix for querySrv ECONNREFUSED when switching Wi-Fi networks or using mobile data hotspot.
// Mobile ISPs and certain Wi-Fi routers block/fail Node's default DNS SRV queries.
// Setting public DNS servers (Google 8.8.8.8 & Cloudflare 1.1.1.1) ensures SRV lookup always succeeds.
try {
  dns.setDefaultResultOrder("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (err) {
  console.warn("[dns] Could not set custom DNS servers:", err.message);
}

// Auto-retry connection if Wi-Fi network interface is still initializing
async function connectDB(retries = 5, delayMs = 2500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("[mongodb] connected");
      return;
    } catch (err) {
      if (attempt < retries) {
        console.warn(`[mongodb] Connection attempt ${attempt}/${retries} failed (network initializing...). Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error("[mongodb] Connection failed after retries:", err.message);
        process.exit(1);
      }
    }
  }
}

module.exports = connectDB;
