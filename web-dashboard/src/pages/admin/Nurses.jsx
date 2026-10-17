import { useEffect, useState, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";
import CustomSelect from "../../components/ui/CustomSelect";

export default function Nurses() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [wards, setWards] = useState([]);
  const [selections, setSelections] = useState({}); // userId -> { hospitalId, wardId }
  const [error, setError] = useState("");
  const [deleteModal, setDeleteModal] = useState({ open: false, id: null, name: "", loading: false, error: "" });
  const [success, setSuccess] = useState("");

  // Add nurse state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addLicenseNo, setAddLicenseNo] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addWardId, setAddWardId] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit nurse state
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLicenseNo, setEditLicenseNo] = useState("");
  const [editWardId, setEditWardId] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/users");
      setUsers(data.filter((u) => u.role === "nurse"));
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    if (currentUser.role === "system_admin") {
      axiosClient.get("/hospitals").then((res) => setHospitals(res.data)).catch(() => {});
    } else {
      axiosClient.get("/wards").then((res) => setWards(res.data)).catch(() => {});
    }
  }, [currentUser.role, loadUsers]);

  // Real-time synchronization
  useDataSync(useCallback(() => {
    loadUsers();
  }, [loadUsers]));

  function updateSelection(userId, field, value) {
    setSelections((prev) => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }));
  }

  async function handleAssign(userId) {
    setError("");
    setSuccess("");
    const sel = selections[userId] || {};
    try {
      if (currentUser.role === "system_admin") {
        if (!sel.hospitalId) {
          setError("Please select a hospital before saving.");
          return;
        }
        await axiosClient.patch(`/users/${userId}/assign`, {
          hospitalId: sel.hospitalId,
          role: "nurse",
        });
      } else {
        await axiosClient.patch(`/users/${userId}/assign`, { wardId: sel.wardId || null });
      }
      setSuccess("Assignment saved successfully.");
      loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not assign nurse");
    }
  }

  async function handleCreateNurse(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!addLicenseNo.trim()) {
      setError("Nursing Council / License Number is required.");
      return;
    }

    setAddLoading(true);
    try {
      await axiosClient.post("/auth/register-staff", {
        name: addName.trim(),
        email: addEmail.trim(),
        phone: addPhone.trim(),
        licenseNumber: addLicenseNo.trim(),
        password: addLicenseNo.trim(),
        role: "nurse",
        wardId: addWardId || undefined,
      });

      setSuccess(`Nurse "${addName}" registered successfully.`);
      setAddName("");
      setAddEmail("");
      setAddPhone("");
      setAddLicenseNo("");
      setAddPassword("");
      setAddWardId("");
      setShowAddForm(false);
      loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to register nurse");
    } finally {
      setAddLoading(false);
    }
  }

  function startEditUser(u) {
    setEditingUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditPhone(u.phone || "");
    setEditLicenseNo(u.licenseNumber || "");
    setEditWardId(u.wardId?._id || u.wardId || "");
  }

  async function handleUpdateNurse(e) {
    e.preventDefault();
    if (!editingUser) return;
    setError("");
    setSuccess("");

    if (!editLicenseNo.trim()) {
      setError("Nursing Council / License Number is required.");
      return;
    }

    setEditLoading(true);
    try {
      await axiosClient.put(`/users/${editingUser._id}`, {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        licenseNumber: editLicenseNo.trim(),
        wardId: editWardId || null,
      });

      setSuccess(`Nurse "${editName}" updated successfully.`);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to update nurse");
    } finally {
      setEditLoading(false);
    }
  }

  function handleDelete(userId, userName) {
    setDeleteModal({ open: true, id: userId, name: userName, loading: false, error: "" });
  }

  async function handleConfirmDelete() {
    setDeleteModal((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      await axiosClient.delete(`/users/${deleteModal.id}`);
      setSuccess(`Nurse "${deleteModal.name}" deleted successfully.`);
      setDeleteModal({ open: false, id: null, name: "", loading: false, error: "" });
      loadUsers();
    } catch (err) {
      const msg = err?.response?.data?.error || "Could not delete nurse";
      setDeleteModal((prev) => ({ ...prev, loading: false, error: msg }));
    }
  }

  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = (u.name || "").toLowerCase().includes(q);
    const emailMatch = (u.email || "").toLowerCase().includes(q);
    const phoneMatch = (u.phone || "").toLowerCase().includes(q);
    const licenseMatch = (u.licenseNumber || "").toLowerCase().includes(q);
    const hospMatch = (u.hospitalId?.name || "").toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch || licenseMatch || hospMatch;
  });

  return (
    <Layout>
      <h1 className="page-title">Nurses</h1>

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 14 }}>{success}</div>}

      {/* Hospital In-Charge: Add Nurse Section */}
      {currentUser.role === "hospital_admin" && (
        <div className="panel form-panel" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="panel-title" style={{ margin: 0 }}>Nurse Management</h3>
            <button
              type="button"
              className="btn-small"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? "Cancel" : "+ Register New Nurse"}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleCreateNurse} style={{ marginTop: 16 }}>
              <div className="form-row-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div className="field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. Nurse Sarah Smith"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    className="input-text"
                    placeholder="nurse@hospital.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div className="field">
                  <label>Contact Phone *</label>
                  <input
                    type="tel"
                    className="input-text"
                    placeholder="+8801XXXXXXXXX"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Nursing Council / License No. *</label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. N-67890"
                    value={addLicenseNo}
                    onChange={(e) => setAddLicenseNo(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Assign to NICU Ward (Optional)</label>
                <CustomSelect
                  value={addWardId}
                  onChange={(e) => setAddWardId(e.target.value)}
                >
                  <option value="">Whole hospital (Unassigned ward)</option>
                  {wards.map((w) => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </CustomSelect>
              </div>

              <button type="submit" className="btn-small" disabled={addLoading}>
                {addLoading ? "Registering..." : "+ Register Nurse"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Main Table Panel */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Registered Nurses ({filteredUsers.length})
          </h3>
          <div style={{ position: "relative", minWidth: 260 }}>
            <input
              type="text"
              className="input-text"
              style={{ height: 34, paddingLeft: 30, fontSize: 13 }}
              placeholder="Search name, email, phone, or license no...."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ position: "absolute", left: 10, top: 10, color: "var(--text-tertiary)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                style={{
                  position: "absolute",
                  right: 8,
                  top: 6,
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  fontSize: 16,
                  cursor: "pointer",
                }}
                onClick={() => setSearchQuery("")}
              >
                x
              </button>
            )}
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>Email</th>
              <th style={{ textAlign: "left" }}>Phone</th>
              <th style={{ textAlign: "center" }}>License No.</th>
              <th style={{ textAlign: "left" }}>Hospital</th>
              <th style={{ textAlign: "left" }}>Assigned Ward</th>
              <th style={{ textAlign: "center" }}>Status</th>
              {currentUser.role === "system_admin" && <th style={{ textAlign: "center" }}>Assign</th>}
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u._id}>
                <td style={{ textAlign: "left" }}><strong>{u.name}</strong></td>
                <td className="mono" style={{ textAlign: "left" }}>{u.email}</td>
                <td className="mono" style={{ textAlign: "left" }}>{u.phone || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  <span className="badge badge-info" style={{ fontFamily: "monospace", fontWeight: 600 }}>
                    {u.licenseNumber || "N/A"}
                  </span>
                </td>
                <td style={{ textAlign: "left" }}>{u.hospitalId?.name || <span style={{ color: "var(--text-tertiary)" }}>Unassigned</span>}</td>
                <td style={{ textAlign: "left" }}>{u.wardId?.name || <span style={{ color: "var(--text-tertiary)" }}>Whole hospital</span>}</td>
                <td style={{ textAlign: "center" }}>
                  {u.isApproved ? (
                    <span className="badge badge-ok">Active</span>
                  ) : u.isEmailVerified ? (
                    <span className="badge badge-warning">Awaiting Approval</span>
                  ) : (
                    <span className="badge badge-unassigned">Unverified</span>
                  )}
                </td>
                {currentUser.role === "system_admin" && (
                  <td style={{ textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <CustomSelect
                        onChange={(e) => updateSelection(u._id, "hospitalId", e.target.value)}
                        value={selections[u._id]?.hospitalId ?? (u.hospitalId?._id || "")}
                      >
                        <option value="">Select hospital...</option>
                        {hospitals.map((h) => (
                          <option key={h._id} value={h._id}>{h.name}</option>
                        ))}
                      </CustomSelect>
                      <button className="btn-small-outline" onClick={() => handleAssign(u._id)}>
                        Save
                      </button>
                    </div>
                  </td>
                )}
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                    {currentUser.role === "hospital_admin" && (
                      <button className="btn-small-outline" onClick={() => startEditUser(u)}>
                        Edit
                      </button>
                    )}
                    <button className="btn-reject" onClick={() => handleDelete(u._id, u.name)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!filteredUsers.length && (
              <tr>
                <td colSpan={currentUser.role === "system_admin" ? 9 : 8} className="empty-state">
                  {searchQuery ? "No nurses match your search query." : "No nurses found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Nurse Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-panel modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit Nurse Details</div>
              <button className="modal-close" onClick={() => setEditingUser(null)}>x</button>
            </div>
            <form onSubmit={handleUpdateNurse}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Full Name *</label>
                <input
                  type="text"
                  className="input-text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Email Address *</label>
                <input
                  type="email"
                  className="input-text"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Contact Phone *</label>
                <input
                  type="tel"
                  className="input-text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  required
                />
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label>Nursing Council / License No. *</label>
                <input
                  type="text"
                  className="input-text"
                  value={editLicenseNo}
                  onChange={(e) => setEditLicenseNo(e.target.value)}
                  placeholder="e.g. N-67890"
                  required
                />
              </div>

              <div className="field" style={{ marginBottom: 18 }}>
                <label>Assigned NICU Ward</label>
                <CustomSelect
                  value={editWardId}
                  onChange={(e) => setEditWardId(e.target.value)}
                >
                  <option value="">Whole hospital (Unassigned ward)</option>
                  {wards.map((w) => (
                    <option key={w._id} value={w._id}>{w.name}</option>
                  ))}
                </CustomSelect>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-small-outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-small" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    
      {/* ===== Spacious Delete Confirmation Modal ===== */}
      {deleteModal.open && (
        <div className="modal-overlay" onClick={() => !deleteModal.loading && setDeleteModal({ open: false, id: null, name: "", loading: false, error: "" })}>
          <div className="modal-panel" style={{ maxWidth: 540, width: "95%", padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>Delete Nurse</span>
                </div>
                <div className="modal-subtitle">This action cannot be undone.</div>
              </div>
              <button className="modal-close" disabled={deleteModal.loading}
                onClick={() => setDeleteModal({ open: false, id: null, name: "", loading: false, error: "" })}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "14px 0" }}>
              Are you sure you want to delete nurse {" "}<strong>"{deleteModal.name}"</strong>?
            </p>

            {deleteModal.error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",
                borderRadius: 8, padding: "12px 16px", marginBottom: 16,
                color: "#dc2626", fontSize: 13, fontWeight: 500,
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div style={{ flex: 1, lineHeight: 1.4 }}>{deleteModal.error}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              <button className="btn-small-outline" disabled={deleteModal.loading}
                onClick={() => setDeleteModal({ open: false, id: null, name: "", loading: false, error: "" })}>
                {deleteModal.error ? "Close" : "Cancel"}
              </button>
              {!deleteModal.error && (
                <button className="btn-small" style={{ background: "#e11d48", color: "#fff" }}
                  onClick={handleConfirmDelete} disabled={deleteModal.loading}>
                  {deleteModal.loading ? "Deleting..." : "Yes, Delete"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
