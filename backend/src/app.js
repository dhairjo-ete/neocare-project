const express = require("express");
require("express-async-errors"); // #4 FIX: Catch async unhandled rejections in express 4
const cors = require("cors");

const vitalsRoutes = require("./routes/vitals.routes");
const alertsRoutes = require("./routes/alerts.routes");
const authRoutes = require("./routes/auth.routes");
const hospitalsRoutes = require("./routes/hospitals.routes");
const wardsRoutes = require("./routes/wards.routes");
const incubatorsRoutes = require("./routes/incubators.routes");
const patientsRoutes = require("./routes/patients.routes");
const usersRoutes = require("./routes/users.routes");
const statsRoutes = require("./routes/stats.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const announcementsRoutes = require("./routes/announcements.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/vitals", vitalsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/hospitals", hospitalsRoutes);
app.use("/api/wards", wardsRoutes);
app.use("/api/incubators", incubatorsRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/announcements", announcementsRoutes);

// #4 FIX: Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error("[backend crash prevented] Error:", err.message || err);
  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate key violation: a conflicting active record with these details already exists.",
    });
  }
  res.status(500).json({ error: "Internal Server Error" });
});

module.exports = app;
