import { useState, useEffect, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";
import CustomSelect from "../../components/ui/CustomSelect";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value)
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

export default function Announcements() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "system_admin";

  const [announcements, setAnnouncements] = useState([]);
  const [hospitals, setHospitals] = useState([]);

  // Form State
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [priority, setPriority] = useState(1);
  const [hospitalId, setHospitalId] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filtering & Sorting State
  const [statusTab, setStatusTab] = useState("all"); // "all" | "active" | "inactive"
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD string
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" | "desc"

  const loadData = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/announcements");
      setAnnouncements(data || []);
    } catch (err) {
      setError("Failed to load announcements");
    }

    if (isSystemAdmin) {
      try {
        const { data: hospData } = await axiosClient.get("/hospitals");
        setHospitals(hospData || []);
      } catch {}
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization
  useDataSync(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("info");
    setPriority(1);
    setHospitalId("");
    setActionUrl("");
    setExpiresAt("");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const payload = {
        title,
        message,
        type,
        priority: Number(priority),
        hospitalId: isSystemAdmin ? hospitalId || null : undefined,
        actionUrl,
        expiresAt: expiresAt || null,
      };

      if (editingId) {
        await axiosClient.put(`/announcements/${editingId}`, payload);
        setSuccess("Announcement updated successfully.");
      } else {
        await axiosClient.post("/announcements", payload);
        setSuccess("Broadcast posted successfully.");
      }

      resetForm();
      loadData();
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ann) => {
    setEditingId(ann._id);
    setTitle(ann.title);
    setMessage(ann.message);
    setType(ann.type);
    setPriority(ann.priority || 1);
    setHospitalId(ann.hospitalId?._id || ann.hospitalId || "");
    setActionUrl(ann.actionUrl || "");
    setExpiresAt(ann.expiresAt ? new Date(ann.expiresAt).toISOString().slice(0, 16) : "");
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggle = async (id) => {
    setError("");
    setSuccess("");
    try {
      await axiosClient.patch(`/announcements/${id}/toggle`);
      setSuccess("Status updated.");
      loadData();
    } catch (err) {
      setError("Failed to toggle status");
    }
  };

  const handleDelete = async (id, annTitle) => {
    if (!window.confirm(`Delete announcement "${annTitle}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await axiosClient.delete(`/announcements/${id}`);
      setSuccess(`Announcement removed.`);
      loadData();
    } catch (err) {
      setError("Failed to delete announcement");
    }
  };

  const handleQuickEmergency = () => {
    setTitle("URGENT CLINICAL ADVISORY");
    setMessage("Clinical priority advisory initiated. Attending physicians and nursing staff, please verify patient telemetry and station readiness.");
    setType("emergency");
    setPriority(10);
  };

  // Filter & Sort Announcements
  const filteredAnnouncements = announcements
    .filter((ann) => {
      if (statusTab === "active" && !ann.isActive) return false;
      if (statusTab === "inactive" && ann.isActive) return false;
      if (dateFilter) {
        const createdDate = new Date(ann.createdAt).toISOString().slice(0, 10);
        if (createdDate !== dateFilter) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortOrder === "asc" ? tA - tB : tB - tA;
    });

  return (
    <Layout>
      <div className="announcements-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Broadcasts &amp; Alerts</h1>
        </div>
        <button
          type="button"
          className="btn-small-outline"
          onClick={handleQuickEmergency}
          style={{ display: "flex", alignItems: "center", gap: 6, borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Clinical Advisory Template
        </button>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 16 }}>{success}</div>}

      {/* Form Panel */}
      <div className="panel form-panel" style={{ marginBottom: 24 }}>
        <h3 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {editingId ? "Edit Broadcast Announcement" : "Create Broadcast / Alert"}
        </h3>

        <form onSubmit={handleSubmit} className="announcement-form" style={{ marginTop: 14 }}>
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div className="field">
              <label>Headline / Title *</label>
              <input
                type="text"
                className="input-text"
                placeholder="e.g. Clinical Priority Advisory or Maintenance Notice"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label>Severity Level *</label>
              <CustomSelect
                className="input-select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="info">Info / Notice</option>
                <option value="warning">System Warning</option>
                <option value="critical">Clinical Priority</option>
                <option value="emergency">Urgent Clinical Advisory</option>
              </CustomSelect>
            </div>

            <div className="field">
              <label>Display Priority (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                className="input-text"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>

            {isSystemAdmin && (
              <div className="field">
                <label>Target Scope</label>
                <CustomSelect
                  className="input-select"
                  value={hospitalId}
                  onChange={(e) => setHospitalId(e.target.value)}
                >
                  <option value="">Global (All Hospitals)</option>
                  {hospitals.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.name}
                    </option>
                  ))}
                </CustomSelect>
              </div>
            )}

            <div className="field">
              <label>Action URL (Optional Link)</label>
              <input
                type="url"
                className="input-text"
                placeholder="https://..."
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Auto-Expiration (Optional)</label>
              <input
                type="datetime-local"
                className="input-text"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Detailed Message *</label>
            <textarea
              className="input-textarea"
              rows="3"
              placeholder="Enter announcement details..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div className="form-actions-row" style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button type="submit" className="btn-small" disabled={loading} style={{ background: "var(--brand)" }}>
              {loading ? "Processing..." : editingId ? "Save Changes" : "Post Broadcast"}
            </button>
            {editingId && (
              <button type="button" className="btn-small-outline" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Broadcasts List & Filter Controls */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Broadcast Records ({filteredAnnouncements.length})
          </h3>

          {/* Filter Bar: Status Tab, Date Filter, Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Status Filter Pills */}
            <div style={{ display: "flex", gap: 4, background: "var(--panel-raised)", padding: 3, borderRadius: "var(--radius)" }}>
              <button
                type="button"
                className={`btn-small ${statusTab === "all" ? "" : "btn-small-outline"}`}
                style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                onClick={() => setStatusTab("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`btn-small ${statusTab === "active" ? "" : "btn-small-outline"}`}
                style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                onClick={() => setStatusTab("active")}
              >
                Active
              </button>
              <button
                type="button"
                className={`btn-small ${statusTab === "inactive" ? "" : "btn-small-outline"}`}
                style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                onClick={() => setStatusTab("inactive")}
              >
                Paused
              </button>
            </div>

            {/* Created Date Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label htmlFor="ann-date-filter" style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                Created Date:
              </label>
              <input
                id="ann-date-filter"
                type="date"
                className="input-text"
                style={{ height: 32, padding: "0 8px", fontSize: 12, width: 145 }}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {dateFilter && (
                <button
                  type="button"
                  className="btn-small-outline"
                  style={{ padding: "2px 8px", fontSize: 12 }}
                  onClick={() => setDateFilter("")}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Ascending / Descending */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                className={sortOrder === "desc" ? "btn-small" : "btn-small-outline"}
                style={{ fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => setSortOrder("desc")}
                title="Newest first"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
                Newest
              </button>
              <button
                type="button"
                className={sortOrder === "asc" ? "btn-small" : "btn-small-outline"}
                style={{ fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => setSortOrder("asc")}
                title="Oldest first"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Oldest
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Table View */}
        <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Status</th>
                <th style={{ textAlign: "left" }}>Title &amp; Summary</th>
                <th style={{ textAlign: "left" }}>Scope</th>
                <th style={{ textAlign: "center" }}>Priority</th>
                <th style={{ textAlign: "center" }}>Created Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnnouncements.map((ann) => (
                <tr key={ann._id} className={!ann.isActive ? "row-inactive" : ""}>
                  <td style={{ textAlign: "center" }}>
                    <span className={`status-pill-badge ${ann.isActive ? "status-active" : "status-disabled"}`}>
                      {ann.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600 }}>
                      <span className={`type-tag type-${ann.type}`}>
                        {ann.type.toUpperCase()}
                      </span>{" "}
                      {ann.title}
                    </div>
                    <div className="text-subtle" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                      {ann.message.length > 80 ? ann.message.substring(0, 80) + "..." : ann.message}
                    </div>
                  </td>
                  <td style={{ textAlign: "left" }}>
                    {ann.hospitalId ? ann.hospitalId.name : "Global"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span className="priority-badge">P{ann.priority || 1}</span>
                  </td>
                  <td className="mono" style={{ textAlign: "center", fontSize: "0.82rem" }}>
                    {formatDate(ann.createdAt)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn-small-outline"
                        onClick={() => handleToggle(ann._id)}
                        style={{ fontSize: 12, padding: "3px 8px" }}
                      >
                        {ann.isActive ? "Pause" : "Activate"}
                      </button>
                      <button
                        className="btn-small-outline"
                        onClick={() => handleEdit(ann)}
                        style={{ fontSize: 12, padding: "3px 8px" }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-reject"
                        onClick={() => handleDelete(ann._id, ann.title)}
                        style={{ fontSize: 12, padding: "3px 8px" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredAnnouncements.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No broadcast records match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
