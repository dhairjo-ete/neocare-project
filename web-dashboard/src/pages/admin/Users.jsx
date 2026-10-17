import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import Layout from "../../components/Layout";
import { useAuth } from "../../context/AuthContext";
import { useDataSync } from "../../hooks/useDataSync";

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

export default function Users() {
  const { user: currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [searchParams] = useSearchParams();
  const urlRole = searchParams.get("role");
  const urlSearch = searchParams.get("search");

  const [pendingUsers, setPendingUsers] = useState([]);
  const [error, setError] = useState("");
  const [approveSuccess, setApproveSuccess] = useState("");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(urlSearch || "");
  const [roleFilter, setRoleFilter] = useState(
    ["doctor", "nurse", "all"].includes(urlRole) ? urlRole : "all"
  ); // "all" | "doctor" | "nurse"
  const [dateFilter, setDateFilter] = useState(""); // YYYY-MM-DD string
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" | "desc"

  useEffect(() => {
    const r = searchParams.get("role");
    if (r && ["doctor", "nurse", "all"].includes(r)) {
      setRoleFilter(r);
    }
    const q = searchParams.get("search");
    if (q) setSearchQuery(q);
  }, [searchParams]);

  const loadPending = useCallback(async () => {
    try {
      const { data } = await axiosClient.get("/auth/pending-approvals");
      setPendingUsers(data || []);
    } catch {
      setPendingUsers([]);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  // Real-time synchronization
  useDataSync(
    useCallback(() => {
      loadPending();
    }, [loadPending])
  );

  async function handleApprove(userId) {
    setError("");
    setApproveSuccess("");
    try {
      const { data } = await axiosClient.post(`/auth/approve-user/${userId}`);
      setApproveSuccess(data.message);
      loadPending();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not approve user");
    }
  }

  async function handleReject(userId, name) {
    if (!window.confirm(`Reject and delete ${name}'s registration request?`)) return;
    setError("");
    setApproveSuccess("");
    try {
      const { data } = await axiosClient.delete(`/auth/reject-user/${userId}`);
      setApproveSuccess(data.message);
      loadPending();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not reject user");
    }
  }



  // Filter & Sort Pending Users
  const filteredUsers = pendingUsers
    .filter((u) => {
      // Role scoping safety
      if (isSystemAdmin && u.role !== "hospital_admin") return false;
      if (!isSystemAdmin && !["doctor", "nurse"].includes(u.role)) return false;

      // Role filter pill (for Hospital In-Charge)
      if (!isSystemAdmin && roleFilter !== "all" && u.role !== roleFilter) return false;

      // Search query filter (Name, Email, Phone, License No.)
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const nameMatch = (u.name || "").toLowerCase().includes(q);
        const emailMatch = (u.email || "").toLowerCase().includes(q);
        const phoneMatch = (u.phone || "").toLowerCase().includes(q);
        const licenseMatch = (u.licenseNumber || "").toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch && !licenseMatch) return false;
      }

      // Date filter
      if (dateFilter) {
        const regDate = new Date(u.createdAt).toISOString().slice(0, 10);
        if (regDate !== dateFilter) return false;
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
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title">Staff Approvals</h1>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}
      {approveSuccess && <div className="success-text" style={{ marginBottom: 16 }}>{approveSuccess}</div>}

      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header & Filter Toolbar Row (Matches exact design spec) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 className="panel-title" style={{ margin: 0 }}>
            Pending Requests ({filteredUsers.length})
          </h3>

          {/* Controls Bar: Search, Role Pills, Date Filter, Sort */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Search Input */}
            <div style={{ position: "relative", minWidth: 240 }}>
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

            {/* Role Filter Pills (Hospital In-Charge view only) */}
            {!isSystemAdmin && (
              <div style={{ display: "flex", gap: 4, background: "var(--panel-raised)", padding: 3, borderRadius: "var(--radius)" }}>
                <button
                  type="button"
                  className={`btn-small ${roleFilter === "all" ? "" : "btn-small-outline"}`}
                  style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                  onClick={() => setRoleFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`btn-small ${roleFilter === "doctor" ? "" : "btn-small-outline"}`}
                  style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                  onClick={() => setRoleFilter("doctor")}
                >
                  Doctors
                </button>
                <button
                  type="button"
                  className={`btn-small ${roleFilter === "nurse" ? "" : "btn-small-outline"}`}
                  style={{ fontSize: 12, padding: "3px 10px", border: "none" }}
                  onClick={() => setRoleFilter("nurse")}
                >
                  Nurses
                </button>
              </div>
            )}

            {/* Registration Date Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label htmlFor="reg-date-filter" style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                Registration Date:
              </label>
              <input
                id="reg-date-filter"
                type="date"
                className="input-text"
                style={{ height: 34, padding: "0 8px", fontSize: 12, width: 140 }}
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {dateFilter && (
                <button
                  type="button"
                  className="btn-small-outline"
                  style={{ padding: "3px 8px", fontSize: 12 }}
                  onClick={() => setDateFilter("")}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Buttons (Newest / Oldest) */}
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
        <div style={{ maxHeight: 560, overflowY: "auto", overflowX: "auto", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Name</th>
                <th style={{ textAlign: "left" }}>Email</th>
                <th style={{ textAlign: "left" }}>Phone</th>
                <th style={{ textAlign: "center" }}>License No.</th>
                <th style={{ textAlign: "center" }}>Role</th>
                <th style={{ textAlign: "left" }}>Hospital</th>
                <th style={{ textAlign: "center" }}>Registered Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u._id}>
                  <td style={{ textAlign: "left" }}><strong>{u.name}</strong></td>
                  <td className="mono" style={{ textAlign: "left" }}>{u.email}</td>
                  <td className="mono" style={{ textAlign: "left" }}>{u.phone || "-"}</td>
                  <td className="mono" style={{ textAlign: "center" }}>{u.licenseNumber || "N/A"}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge badge-${u.role}`}>
                      {u.role === "hospital_admin"
                        ? "Hospital In-Charge"
                        : u.role === "doctor"
                        ? "Doctor"
                        : "Nurse"}
                    </span>
                  </td>
                  <td style={{ textAlign: "left" }}>{u.hospitalId?.name || "-"}</td>
                  <td className="mono" style={{ textAlign: "center", fontSize: 12 }}>
                    {formatDate(u.createdAt)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        className="btn-approve"
                        onClick={() => handleApprove(u._id)}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Approve
                      </button>
                      <button
                        className="btn-reject"
                        onClick={() => handleReject(u._id, u.name)}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredUsers.length && (
                <tr>
                  <td colSpan={8} className="empty-state">
                    {searchQuery || dateFilter || roleFilter !== "all"
                      ? "No pending approvals match your search or filter."
                      : "No pending staff approvals at this time."}
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
