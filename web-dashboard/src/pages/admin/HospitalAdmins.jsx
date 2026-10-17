import { useEffect, useState, useCallback } from "react";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";
import CustomSelect from "../../components/ui/CustomSelect";

export default function HospitalAdmins() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [selections, setSelections] = useState({}); // userId -> { hospitalId }
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/users");
      setUsers(data.filter((u) => u.role === "hospital_admin"));
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    if (currentUser.role === "system_admin") {
      axiosClient.get("/hospitals").then((res) => setHospitals(res.data)).catch(() => {});
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
      if (!sel.hospitalId) {
        setError("Please select a hospital before saving.");
        return;
      }
      await axiosClient.patch(`/users/${userId}/assign`, {
        hospitalId: sel.hospitalId,
        role: "hospital_admin",
      });
      setSuccess("Assignment saved successfully.");
      loadUsers();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not assign hospital in-charge");
    }
  }

  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = (u.name || "").toLowerCase().includes(q);
    const emailMatch = (u.email || "").toLowerCase().includes(q);
    const phoneMatch = (u.phone || "").toLowerCase().includes(q);
    const hospMatch = (u.hospitalId?.name || "").toLowerCase().includes(q);
    return nameMatch || emailMatch || phoneMatch || hospMatch;
  });

  return (
    <Layout>
      <h1 className="page-title">Hospital In-Charges</h1>

      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      {success && <div className="success-text" style={{ marginBottom: 14 }}>{success}</div>}

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Hospital Administrators ({filteredUsers.length})
          </h3>
          <div style={{ position: "relative", minWidth: 260 }}>
            <input
              type="text"
              className="input-text"
              style={{ height: 34, paddingLeft: 30, fontSize: 13 }}
              placeholder="Search name, email, phone, or hospital..."
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
              <th style={{ textAlign: "left" }}>Assigned Hospital</th>
              <th style={{ textAlign: "center" }}>Status</th>
              <th style={{ textAlign: "center" }}>Assign Hospital</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u._id}>
                <td style={{ textAlign: "left" }}><strong>{u.name}</strong></td>
                <td className="mono" style={{ textAlign: "left" }}>{u.email}</td>
                <td className="mono" style={{ textAlign: "left" }}>{u.phone || "-"}</td>
                <td style={{ textAlign: "left" }}>{u.hospitalId?.name || <span style={{ color: "var(--text-tertiary)" }}>Unassigned</span>}</td>
                <td style={{ textAlign: "center" }}>
                  {u.isApproved ? (
                    <span className="badge badge-ok">Active</span>
                  ) : u.isEmailVerified ? (
                    <span className="badge badge-warning">Awaiting Approval</span>
                  ) : (
                    <span className="badge badge-unassigned">Unverified</span>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  <CustomSelect
                    onChange={(e) => updateSelection(u._id, "hospitalId", e.target.value)}
                    value={selections[u._id]?.hospitalId ?? (u.hospitalId?._id || "")}
                  >
                    <option value="">Select hospital...</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                  </CustomSelect>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn-small-outline" onClick={() => handleAssign(u._id)}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
            {!filteredUsers.length && (
              <tr>
                <td colSpan={7} className="empty-state">
                  {searchQuery ? "No hospital in-charges match your search query." : "No hospital in-charges found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
