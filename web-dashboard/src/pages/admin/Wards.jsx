import { useEffect, useState, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";

export default function Wards() {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "system_admin";
  const [wards, setWards] = useState([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmModal, setConfirmModal] = useState({ open: false, wardId: null, wardName: "", loading: false, error: "" });

  const load = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/wards");
      setWards(data);
    } catch {
      setError("Failed to load NICUs");
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
      await axiosClient.post("/wards", { name });
      setName("");
      setSuccess("NICU created successfully");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create NICU");
    }
  }

  function startEdit(w) {
    setEditingId(w._id);
    setEditName(w.name);
    setError(""); setSuccess("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function handleUpdate(id) {
    setError(""); setSuccess("");
    try {
      await axiosClient.patch(`/wards/${id}`, { name: editName });
      setSuccess("NICU updated successfully");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not update NICU");
    }
  }

  function openDeleteConfirm(id, wardName) {
    setConfirmModal({ open: true, wardId: id, wardName, loading: false, error: "" });
  }

  function closeDeleteConfirm() {
    setConfirmModal({ open: false, wardId: null, wardName: "", loading: false, error: "" });
  }

  async function handleConfirmDelete() {
    setConfirmModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await axiosClient.delete(`/wards/${confirmModal.wardId}`);
      setSuccess(`NICU "${confirmModal.wardName}" deleted.`);
      closeDeleteConfirm();
      load();
    } catch (err) {
      // Show error INSIDE the modal - user can't miss it
      const msg = err?.response?.data?.error || "Could not delete NICU";
      setConfirmModal((prev) => ({ ...prev, loading: false, error: msg }));
    }
  }

  return (
    <Layout>
      <h1 className="page-title">NICUs</h1>

      {!isSystemAdmin ? (
        <form className="inline-form" onSubmit={handleCreate}>
          <div className="field">
            <label>NICU Unit Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Level-3 NICU South"
              required
            />
          </div>
          <button className="btn-small" type="submit">+ Add NICU</button>
        </form>
      ) : (
        <div className="banner" style={{ marginBottom: 16 }}>
          <strong>System Admin Note:</strong> NICUs are created directly by each respective Hospital In-Charge. You have full administrative rights to review, update, or delete NICU records below.
        </div>
      )}

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>NICU Name</th>
              <th style={{ textAlign: "left" }}>Hospital</th>
              <th style={{ textAlign: "center" }}>NICU ID</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {wards.map((w) => {
              const isEditing = editingId === w._id;
              return (
                <tr key={w._id}>
                  <td style={{ textAlign: "left" }}>
                    {isEditing ? (
                      <input
                        className="input-text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%", minWidth: 160 }}
                      />
                    ) : (
                      <strong>{w.name}</strong>
                    )}
                  </td>
                  <td style={{ textAlign: "left" }}>{w.hospitalId?.name || "-"}</td>
                  <td className="mono" style={{ textAlign: "center", fontSize: 12 }}>{w._id}</td>
                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button className="btn-small" onClick={() => handleUpdate(w._id)}>Save</button>
                        <button className="btn-small-outline" onClick={cancelEdit}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button className="btn-small-outline" onClick={() => startEdit(w)}>Edit</button>
                        <button className="btn-reject" onClick={() => openDeleteConfirm(w._id, w.name)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!wards.length && (
              <tr><td colSpan={4} className="empty-state">No NICUs found.</td></tr>
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
                  Delete NICU
                </div>
                <div className="modal-subtitle">This action cannot be undone.</div>
              </div>
              <button className="modal-close" onClick={closeDeleteConfirm} disabled={confirmModal.loading}>x</button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "12px 0" }}>
              Are you sure you want to delete <strong>"{confirmModal.wardName}"</strong>?
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
