import React from "react";

export default function ProfilePill({ user, onClick, title }) {
  if (!user) return null;

  const formattedName = user.name || "User";

  return (
    <button
      type="button"
      className="profile-pill-btn"
      onClick={onClick}
      title={title || `${formattedName} — View profile`}
    >
      <div className="profile-avatar-wrapper">
        <span className="profile-avatar-initial">
          {formattedName.charAt(0).toUpperCase()}
        </span>
        <span className="online-indicator-dot" title="Active session" />
      </div>
    </button>
  );
}
