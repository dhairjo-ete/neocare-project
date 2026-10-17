import { useState } from "react";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";

export default function FirstTimePasswordModal() {
  const { user, updateProfile, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Only render if logged-in user is a doctor or nurse AND has mustChangePassword === true
  const isDoctorOrNurse = user && (user.role === "doctor" || user.role === "nurse");
  if (!isDoctorOrNurse || !user.mustChangePassword) {
    return null;
  }

  const roleTitle = user.role === "doctor" ? "Doctor" : "Nurse";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!newPassword || newPassword.trim().length < 6) {
      setError("Permanent password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await axiosClient.post("/auth/first-time-password", {
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });

      setSuccess(data.message || "Permanent password set successfully.");
      setTimeout(() => {
        updateProfile({ mustChangePassword: false });
      }, 900);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to update permanent password. Please verify your current license number.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(15, 23, 42, 0.8)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-time-pwd-title"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--panel, #ffffff)",
          border: "1px solid var(--border, #cbd5e1)",
          borderRadius: 12,
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.35)",
          overflow: "hidden",
        }}
      >
        {/* Header Ribbon */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle, #e2e8f0)",
            background: "var(--panel-raised, #f8fafc)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: "rgba(2, 132, 199, 0.12)",
              color: "var(--primary-color, #0284c7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h3
              id="first-time-pwd-title"
              style={{
                margin: 0,
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--text-primary, #0f172a)",
              }}
            >
              First-Time Security Setup
            </h3>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary, #64748b)", marginTop: 2 }}>
              Clinical Credential Activation for {roleTitle}s
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "0.88rem",
              lineHeight: 1.55,
              color: "var(--text-secondary, #475569)",
            }}
          >
            Welcome to NeoCare, <strong>{user.name}</strong>. Because this is your first time signing in, you must replace your temporary license number with a private, permanent password to access live neonatal vitals.
          </p>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background: "rgba(225, 29, 72, 0.08)",
                border: "1px solid rgba(225, 29, 72, 0.25)",
                color: "var(--critical, #e11d48)",
                fontSize: "0.84rem",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {success && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "var(--success, #059669)",
                fontSize: "0.84rem",
                marginBottom: 16,
              }}
            >
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Current Password / License No */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #0f172a)",
                  marginBottom: 6,
                }}
              >
                Current Initial Password (License No.) *
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  className="input-text"
                  placeholder="Enter your medical/nursing license no."
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted, #94a3b8)",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                  }}
                  title={showCurrentPassword ? "Hide password" : "Show password"}
                >
                  {showCurrentPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* New Permanent Password */}
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #0f172a)",
                  marginBottom: 6,
                }}
              >
                New Permanent Password (min. 6 characters) *
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  className="input-text"
                  placeholder="Create your new permanent password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted, #94a3b8)",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                  }}
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-primary, #0f172a)",
                  marginBottom: 6,
                }}
              >
                Confirm New Password *
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  className="input-text"
                  placeholder="Re-enter your new permanent password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                  style={{ width: "100%", paddingRight: 38 }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted, #94a3b8)",
                    display: "flex",
                    alignItems: "center",
                    padding: 4,
                  }}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginTop: 22,
                borderTop: "1px solid var(--border-subtle, #e2e8f0)",
                paddingTop: 16,
              }}
            >
              <button
                type="button"
                onClick={logout}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary, #64748b)",
                  fontSize: "0.85rem",
                  padding: "6px 10px",
                }}
              >
                Sign Out
              </button>

              <button
                type="submit"
                disabled={loading}
                className="btn-small"
                style={{
                  padding: "8px 20px",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  opacity: loading ? 0.7 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Saving..." : "Save Password & Enter NICU"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
