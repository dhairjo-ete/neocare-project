const Announcement = require("../models/Announcement");
const { emitDataChange } = require("../sockets/socket");
const { sanitizeActionUrl } = require("../utils/safeUrl");

// Get active announcements for ticker bar (authenticated users)
async function getActiveAnnouncements(req, res) {
  try {
    const userHospitalId = req.user?.hospitalId;
    const now = new Date();

    let hospitalQuery;
    if (req.user?.role === "system_admin") {
      hospitalQuery = null; // System admin sees all active announcements (or we could limit them too, but currently they see all)
    } else if (userHospitalId) {
      hospitalQuery = { $in: [null, userHospitalId] };
    } else {
      hospitalQuery = null; // Meaning hospitalId: null
    }

    const query = {
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    };

    if (hospitalQuery !== undefined && req.user?.role !== "system_admin") {
      query.hospitalId = hospitalQuery === null ? null : hospitalQuery;
    }

    // Only hospital_admin should see review requests (including discharge requests)
    if (req.user?.role !== "hospital_admin") {
      query.type = { $ne: "review_request" };
    }

    const announcements = await Announcement.find(query)
      .populate("createdBy", "name role")
      .populate("hospitalId", "name code")
      .sort({ priority: -1, createdAt: -1 })
      .limit(20);

    res.json(announcements);
  } catch (err) {
    console.error("[getActiveAnnouncements]", err);
    res.status(500).json({ error: "Failed to fetch active announcements" });
  }
}

// Get all announcements (for Admin Management Table)
async function getAllAnnouncements(req, res) {
  try {
    const { role, hospitalId } = req.user;
    let query = {};

    if (role === "hospital_admin") {
      query = { $or: [{ hospitalId: null }, { hospitalId }] };
    }

    const announcements = await Announcement.find(query)
      .populate("createdBy", "name role email")
      .populate("hospitalId", "name code")
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (err) {
    console.error("[getAllAnnouncements]", err);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
}

// Create a new announcement or emergency broadcast
async function createAnnouncement(req, res) {
  try {
    const { title, message, type, hospitalId, priority, expiresAt, actionUrl } = req.body;
    const { role, hospitalId: userHospitalId } = req.user;
    const userId = req.user.id || req.user._id;

    let targetHospitalId = null;
    if (role === "hospital_admin") {
      targetHospitalId = userHospitalId;
    } else if (role === "system_admin") {
      targetHospitalId = hospitalId || null;
    }

    const urlCheck = sanitizeActionUrl(actionUrl);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: `Invalid action URL: ${urlCheck.error}` });
    }

    const announcement = await Announcement.create({
      title,
      message,
      type: type || "info",
      hospitalId: targetHospitalId,
      priority: priority || 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      actionUrl: urlCheck.value,
      createdBy: userId,
      isActive: true,
    });

    const populated = await Announcement.findById(announcement._id)
      .populate("createdBy", "name role")
      .populate("hospitalId", "name code");

    // Emit socket event to notify all connected clients in real-time
    emitDataChange("announcement", "create", populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error("[createAnnouncement]", err);
    res.status(500).json({ error: "Failed to create announcement" });
  }
}

// Update an existing announcement
async function updateAnnouncement(req, res) {
  try {
    const { id } = req.params;
    const { title, message, type, hospitalId, priority, expiresAt, actionUrl, isActive } = req.body;
    const { role, hospitalId: userHospitalId } = req.user;

    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (role === "hospital_admin") {
      // Hospital admin can only edit announcements that are explicitly scoped to their hospital.
      // They must NOT edit global (hospitalId: null) announcements — those belong to system_admin only.
      if (!existing.hospitalId || String(existing.hospitalId) !== String(userHospitalId)) {
        return res.status(403).json({ error: "Access denied: only System Admin can modify platform-wide announcements" });
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (message !== undefined) updates.message = message;
    if (type !== undefined) updates.type = type;
    if (priority !== undefined) updates.priority = priority;
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (actionUrl !== undefined) {
      const urlCheck = sanitizeActionUrl(actionUrl);
      if (!urlCheck.ok) {
        return res.status(400).json({ error: `Invalid action URL: ${urlCheck.error}` });
      }
      updates.actionUrl = urlCheck.value;
    }
    if (isActive !== undefined) updates.isActive = isActive;
    if (role === "system_admin" && hospitalId !== undefined) {
      updates.hospitalId = hospitalId || null;
    }

    const updated = await Announcement.findByIdAndUpdate(id, updates, { new: true })
      .populate("createdBy", "name role")
      .populate("hospitalId", "name code");

    emitDataChange("announcement", "update", updated);

    res.json(updated);
  } catch (err) {
    console.error("[updateAnnouncement]", err);
    res.status(500).json({ error: "Failed to update announcement" });
  }
}

// Toggle active status
async function toggleActive(req, res) {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    const { role, hospitalId: userHospitalId } = req.user;
    if (role === "hospital_admin") {
      if (!announcement.hospitalId || String(announcement.hospitalId) !== String(userHospitalId)) {
        return res.status(403).json({ error: "Access denied: only System Admin can toggle platform-wide announcements" });
      }
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    const populated = await Announcement.findById(id)
      .populate("createdBy", "name role")
      .populate("hospitalId", "name code");

    emitDataChange("announcement", "update", populated);

    res.json(populated);
  } catch (err) {
    console.error("[toggleActive]", err);
    res.status(500).json({ error: "Failed to toggle status" });
  }
}

// Delete announcement
async function deleteAnnouncement(req, res) {
  try {
    const { id } = req.params;
    const { role, hospitalId: userHospitalId } = req.user;

    const existing = await Announcement.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    if (role === "hospital_admin") {
      // Hospital admin can only delete announcements scoped to their own hospital.
      if (!existing.hospitalId || String(existing.hospitalId) !== String(userHospitalId)) {
        return res.status(403).json({ error: "Access denied: only System Admin can delete platform-wide announcements" });
      }
    }

    await Announcement.findByIdAndDelete(id);

    emitDataChange("announcement", "delete", { id }, existing.hospitalId);

    res.json({ success: true, id });
  } catch (err) {
    console.error("[deleteAnnouncement]", err);
    res.status(500).json({ error: "Failed to delete announcement" });
  }
}

module.exports = {
  getActiveAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleActive,
  deleteAnnouncement,
};
