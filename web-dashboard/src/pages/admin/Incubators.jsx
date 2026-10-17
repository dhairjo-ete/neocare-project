import { useEffect, useState, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";
import CustomSelect from "../../components/ui/CustomSelect";

export default function Incubators() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "system_admin";
  const [incubators, setIncubators] = useState([]);
  const [wards, setWards] = useState([]);
  const [wardId, setWardId] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmModal, setConfirmModal] = useState({ open: false, incubatorId: null, incubatorName: "", loading: false, error: "" });

  const load = useCallback(async () => {
    try {
      const [incRes, wardRes] = await Promise.all([
        axiosClient.get("/incubators"),
        axiosClient.get("/wards"),
      ]);
      setIncubators(incRes.data);
      setWards(wardRes.data);
    } catch {
      setError("Failed to load incubator fleet data");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss page-level messages after 5s
  useEffect(() => {
    if (!error && !success) return;
    const t = setTimeout(() => { setError(""); setSuccess(""); }, 5000);
    return () => clearTimeout(t);
  }, [error, success]);

  useDataSync(useCallback(() => { load(); }, [load]));

  async function handleCreate(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    try {
      await axiosClient.post("/incubators", { wardId, name });
      setWardId(""); setName("");
      setSuccess("Incubator provisioned successfully");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create incubator");
    }
  }

  function startEdit(i) {
    setEditingId(i._id);
    setEditName(i.label || i.deviceTopicId || "");
    setEditStatus(i.status || "active");
    setError(""); setSuccess("");
  }

  function cancelEdit() { setEditingId(null); setEditName(""); }

  async function handleUpdate(id) {
    setError(""); setSuccess("");
    try {
      await axiosClient.patch(`/incubators/${id}`, { name: editName, status: editStatus });
      setSuccess("Incubator updated successfully");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update incubator");
    }
  }

  function openDeleteConfirm(id, incubatorName) {
    setConfirmModal({ open: true, incubatorId: id, incubatorName, loading: false, error: "" });
  }

  function closeDeleteConfirm() {
    setConfirmModal({ open: false, incubatorId: null, incubatorName: "", loading: false, error: "" });
  }

  async function handleConfirmDelete() {
    setConfirmModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await axiosClient.delete(`/incubators/${confirmModal.incubatorId}`);
      setSuccess(`Incubator "${confirmModal.incubatorName}" deleted.`);
      closeDeleteConfirm();
      load();
    } catch (err) {
      // Show error INSIDE the modal - impossible to miss
      const msg = err?.response?.data?.error || "Could not delete incubator";
      setConfirmModal((prev) => ({ ...prev, loading: false, error: msg }));
    }
  }

  return (
    <Layout>
      <h1 className="page-title">Incubators</h1>

      {!isSystemAdmin ? (
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="field">
            <label>Assigned NICU</label>
            <CustomSelect value={wardId} onChange={(e) => setWardId(e.target.value)} required>
              <option value="">Select NICU</option>
              {wards.map((w) => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </CustomSelect>
          </div>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Incubator Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bay 3 - South"
              required
            />
          </div>
          <button className="btn-small" type="submit">+ Add Incubator</button>
        </form>
      ) : (
        <div className="banner" style={{ marginBottom: 16 }}>
          <strong>System Admin Note:</strong> Incubators are provisioned directly by each respective Hospital In-Charge. You have administrative rights to update device status or delete records below.
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Incubator Name</th>
              <th style={{ textAlign: "center" }}>Device ID (MQTT)</th>
              <th style={{ textAlign: "left" }}>NICU</th>
              <th style={{ textAlign: "left" }}>Hospital</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incubators.map((i) => {
              const isEditing = editingId === i._id;
              return (
                <tr key={i._id}>
                  <td style={{ textAlign: "left" }}>
                    {isEditing ? (
                      <input
                        className="input-text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%", minWidth: 120 }}
                      />
                    ) : (
                      <strong>{i.label || i.deviceTopicId}</strong>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "center" }}>{i.deviceTopicId}</td>
                  <td style={{ textAlign: "left" }}>{i.wardId?.name || "-"}</td>
                  <td style={{ textAlign: "left" }}>{i.hospitalId?.name || "-"}</td>
                  <td style={{ textAlign: "center" }}>
                    {isEditing ? (
                      <CustomSelect value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ minWidth: 140 }}>
                        <option value="active">Active</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="offline">Offline</option>
                      </CustomSelect>
                    ) : (
                      <span className={`badge badge-${i.status === "active" ? "ok" : i.status === "maintenance" ? "warning" : "unassigned"}`}>
                        {i.status}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-small" onClick={() => handleUpdate(i._id)}>Save</button>
                        <button className="btn-small-outline" onClick={cancelEdit}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-small-outline" onClick={() => startEdit(i)}>Edit</button>
                        <button
                          className="btn-reject"
                          onClick={() => openDeleteConfirm(i._id, i.label || i.deviceTopicId)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!incubators.length && (
              <tr><td colSpan={6} className="empty-state">No incubators registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Inline Delete Confirmation Modal ===== */}
      {confirmModal.open && (
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-panel modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Delete Incubator
                </div>
                <div className="modal-subtitle">This will detach the device and cannot be undone.</div>
              </div>
              <button className="modal-close" onClick={closeDeleteConfirm} disabled={confirmModal.loading}>x</button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "12px 0" }}>
              Are you sure you want to delete <strong>"{confirmModal.incubatorName}"</strong>?
            </p>

            {/* Backend error shown INSIDE the modal - impossible to miss */}
            {confirmModal.error && (
              <div style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 14,
                color: "#dc2626",
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {confirmModal.error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button className="btn-small-outline" onClick={closeDeleteConfirm} disabled={confirmModal.loading}>
                {confirmModal.error ? "Close" : "Cancel"}
              </button>
              {!confirmModal.error && (
                <button
                  className="btn-small"
                  style={{ background: "#e11d48", color: "#fff" }}
                  onClick={handleConfirmDelete}
                  disabled={confirmModal.loading}
                >
                  {confirmModal.loading ? "Deleting..." : "Yes, Delete"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
