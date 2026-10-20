import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";
import InfoTooltip from "./ui/InfoTooltip";

export default function UserProfileModal({ isOpen, onClose }) {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (isOpen && user) {
      setError("");
      setSuccess("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setName(user.name || "");
      setPhone(user.phone || "");
      setLicenseNumber(user.licenseNumber || "");

      // Fetch fresh profile data from backend
      setLoading(true);
      axiosClient
        .get("/users/me")
        .then(({ data }) => {
          setProfileData(data);
          if (data.name) setName(data.name);
          if (data.phone) setPhone(data.phone);
          if (data.licenseNumber) setLicenseNumber(data.licenseNumber);
        })
        .catch(() => {
          // Fallback to context user if fetch fails
          setProfileData(user);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        phone,
        licenseNumber,
      };

      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }

      const { data } = await axiosClient.patch("/users/me", payload);

      // Update AuthContext user state
      updateProfile({
        name: data.name,
        phone: data.phone,
        licenseNumber: data.licenseNumber,
        hospitalName: data.hospitalId?.name || user.hospitalName,
      });

      setProfileData(data);
      setSuccess("Profile updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    onClose();
    logout();
    navigate("/login");
  };

  const getRoleBadgeLabel = (role) => {
    switch (role) {
      case "system_admin":
        return "System Administrator";
      case "hospital_admin":
        return "Hospital In-Charge";
      case "doctor":
        return "Medical Doctor";
      case "nurse":
        return "Clinical Nurse";
      default:
        return role || "User";
    }
  };

  const formattedDate = profileData?.createdAt
    ? new Date(profileData.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Registered Member";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel user-profile-modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close profile modal">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body user-profile-modal-body">
          {loading ? (
            <div className="profile-loading-spinner">Loading account profile...</div>
          ) : (
            <form onSubmit={handleSave}>
              {/* Profile Card Header */}
              <div className="profile-card-header">
                <div className="profile-card-avatar">
                  <span>{(name || user.name || "U").charAt(0).toUpperCase()}</span>
                  <span className="profile-card-online" title="Active Session"></span>
                </div>
                <div className="profile-card-meta">
                  <h4 className="profile-card-name">{name || user.name}</h4>
                  <div className="profile-card-badges">
                    <span className="badge badge-brand">{getRoleBadgeLabel(user.role)}</span>
                    {user.isApproved && <span className="badge badge-ok">Verified Account</span>}
                  </div>
                  <div className="profile-card-hospital">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 7v14M21 7v14M6 11h12M6 15h12M9 7h6M12 3v4"/></svg>
                    <span>{profileData?.hospitalId?.name || user.hospitalName || (user.role === "system_admin" ? "All Hospitals System Scope" : "NeoCare System")}</span>
                    {profileData?.wardId?.name && (
                      <span className="profile-ward-tag">· {profileData.wardId.name}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="profile-card-logout-btn"
                  onClick={handleLogout}
                  title="Log out of session"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span>Log Out</span>
                </button>
              </div>

              {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}
              {success && <div className="success-text" style={{ marginBottom: 16 }}>{success}</div>}

              {/* Personal Information Section */}
              <div className="profile-section-heading">Personal Information</div>
              <div className="profile-form-grid">
                <div className="field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    className="input-text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="input-text"
                    value={user.email}
                    disabled
                    style={{ opacity: 0.7, cursor: "not-allowed", background: "var(--panel-raised)" }}
                  />
                </div>

                <div className="field">
                  <label>
                    Phone Number
                    <InfoTooltip text="Active WhatsApp number required for receiving automated clinical advisories and alerts." />
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="+880 1700 000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                {["doctor", "nurse"].includes(user.role) && (
                  <div className="field">
                    <label>License Number</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="e.g. BMDC-10928"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                    />
                  </div>
                )}

                <div className="field">
                  <label>Role</label>
                  <input
                    type="text"
                    className="input-text"
                    value={getRoleBadgeLabel(user.role)}
                    disabled
                    style={{ opacity: 0.7, cursor: "not-allowed", background: "var(--panel-raised)" }}
                  />
                </div>

                <div className="field">
                  <label>Joined Date</label>
                  <input
                    type="text"
                    className="input-text"
                    value={formattedDate}
                    disabled
                    style={{ opacity: 0.7, cursor: "not-allowed", background: "var(--panel-raised)" }}
                  />
                </div>
              </div>

              {/* Password & Security Section */}
              <div className="profile-section-heading" style={{ marginTop: 20 }}>
                Security &amp; Change Password
              </div>
              <div className="profile-form-grid">
                <div className="field profile-field-full">
                  <label>
                    Current Password <span className="label-subtext">(required for password change)</span>
                  </label>
                  <input
                    type="password"
                    className="input-text"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>New Password</label>
                  <input
                    type="password"
                    className="input-text"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Confirm New Password</label>
                  <input
                    type="password"
                    className="input-text"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="profile-modal-footer">
                <button
                  type="button"
                  className="profile-footer-logout-btn"
                  onClick={handleLogout}
                  title="Sign out of your NeoCare session"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  <span>Log Out</span>
                </button>

                <div className="profile-modal-footer-actions">
                  <button type="button" className="btn-small-outline" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-small" disabled={saving}>
                    {saving ? "Saving Changes..." : "Save Profile Changes"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
