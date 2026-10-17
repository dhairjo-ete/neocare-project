require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const connectMQTT = require("./src/config/mqtt");
const initSocket = require("./src/sockets/socket");
const { startEscalationMonitor } = require("./src/services/alertEngine");

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  app.set("io", io);

  initSocket(io);
  connectMQTT(io); // MQTT ingest pushes into Socket.io + MongoDB
  startEscalationMonitor(io); // Tier 4: Background Escalation Daemon

  // Start autonomous continuous neonatal digital twin simulator
  const { startTelemetrySimulator } = require("./src/services/telemetrySimulator");
  startTelemetrySimulator(io);

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[server] Port ${PORT} is already in use. Please ensure only one backend instance is running.`);
    } else {
      console.error("[server] Server startup error:", err.message);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`[server] NeoCare backend running on port ${PORT}`);
  });
}

process.on("unhandledRejection", (err) => {
  console.error("[fatal] Unhandled Rejection:", err);
  // Do not crash the server on unexpected promise rejections
});

start().catch((err) => {
  console.error("[fatal] failed to start server:", err);
  process.exit(1);
});
