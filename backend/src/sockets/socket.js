const jwt = require("jsonwebtoken");
const User = require("../models/User");

let _io = null;

function initSocket(io) {
  _io = io;

  // #1 FIX: Authenticate all socket connections using JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication error: No token provided"));
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.role === "patient") {
        const Patient = require("../models/Patient");
        const patient = await Patient.findById(decoded.patientId || decoded.id).select("hospitalId dischargedAt");
        if (!patient) return next(new Error("Authentication error: Patient not found"));
        socket.user = {
          id: patient._id,
          role: "patient",
          patientId: String(patient._id),
          hospitalId: patient.hospitalId ? String(patient.hospitalId) : null,
        };
        return next();
      }

      const user = await User.findById(decoded.id).select("role hospitalId isApproved");
      if (!user) return next(new Error("Authentication error: User not found"));
      // Suspended / unapproved accounts must not receive live clinical data
      if (!user.isApproved && user.role !== "system_admin") {
        return next(new Error("Authentication error: Account not approved"));
      }

      socket.user = {
        id: user._id,
        role: user.role,
        hospitalId: user.hospitalId ? String(user.hospitalId) : null,
      };
      next();
    } catch (err) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id} (Role: ${socket.user.role})`);

    // Automatically join the correct tenant room based on authenticated user
    if (socket.user.role === "system_admin") {
      socket.join("room:system_admin");
      console.log(`[socket] ${socket.id} joined room:system_admin`);
    } else if (socket.user.role === "patient") {
      socket.join(`room:patient:${socket.user.patientId}`);
      if (socket.user.hospitalId) {
        socket.join(`room:hospital:${socket.user.hospitalId}`);
      }
      console.log(`[socket] ${socket.id} joined rooms for patient: ${socket.user.patientId}`);
    } else if (socket.user.hospitalId) {
      // Only the Hospital In-Charge receives admin-only events (approval
      // queues, discharge requests). Doctors and nurses get the shared
      // hospital room for clinical data only.
      if (socket.user.role === "hospital_admin") {
        socket.join(`room:hospital_admin:${socket.user.hospitalId}`);
      }
      socket.join(`room:hospital:${socket.user.hospitalId}`);
      console.log(`[socket] ${socket.id} joined rooms for hospital: ${socket.user.hospitalId}`);
    }

    // Personal room so notifications addressed to one doctor/nurse reach only them
    socket.join(`room:user:${socket.user.id}`);

    // Ignore client-provided join requests to prevent unauthorized access
    socket.on("join:room", () => {
      // No-op. Rooms are strictly assigned by the server auth middleware.
    });

    socket.on("disconnect", () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });
}

// Emit a notification to the correct room
function emitNotification(notification) {
  if (!_io) return;

  if (notification.targetRole === "system_admin") {
    _io.to("room:system_admin").emit("notification:new", notification);
  } else if (notification.targetRole === "hospital_admin" && notification.hospitalId) {
    _io.to(`room:hospital_admin:${notification.hospitalId}`).emit("notification:new", notification);
  } else if (["doctor", "nurse"].includes(notification.targetRole) && notification.targetUserId) {
    const uid = notification.targetUserId._id || notification.targetUserId;
    _io.to(`room:user:${uid}`).emit("notification:new", notification);
  }
}

// Broadcast real-time entity data updates to the relevant rooms
//
// hospitalIdOverride lets callers scope events whose payload carries no
// hospitalId of its own (e.g. delete events that only send { id }). Without
// it such events used to fall through to a global broadcast.
function emitDataChange(entity, action, data, hospitalIdOverride) {
  if (!_io) return;
  console.log(`[socket] broadcasting data:change -> ${entity}:${action}`);

  // #1 FIX: Tenant isolation for socket emissions
  let hospitalId = hospitalIdOverride?._id || hospitalIdOverride || data.hospitalId?._id || data.hospitalId;
  if (entity === "hospital") {
    hospitalId = hospitalIdOverride?._id || hospitalIdOverride || data._id || data.id; // the hospital's own id
  }

  const payload = { entity, action, data, timestamp: new Date() };

  if (hospitalId) {
    // Emit only to users in that hospital, plus system admins
    _io.to(`room:hospital:${hospitalId}`).to("room:system_admin").emit("data:change", payload);
    _io.to(`room:hospital:${hospitalId}`).to("room:system_admin").emit(`${entity}:change`, { action, data, timestamp: new Date() });
  } else {
    // Fallback for global entities (like system-wide announcements)
    _io.emit("data:change", payload);
    _io.emit(`${entity}:change`, { action, data, timestamp: new Date() });
  }
}

module.exports = initSocket;
module.exports.emitNotification = emitNotification;
module.exports.emitDataChange = emitDataChange;

