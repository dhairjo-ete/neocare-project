import { useState, useEffect } from "react";
import axiosClient from "../api/axiosClient";

export default function EditHospitalModal({ hospital, isOpen, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hospital) {
      setName(hospital.name || "");
      setAddress(hospital.address || "");
      setError("");
    }
  }, [hospital, isOpen]);

  if (!isOpen || !hospital) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanAddress = address.trim();

    if (!cleanName) {
      setError("Hospital name cannot be empty.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await axiosClient.patch(`/hospitals/${hospital._id}`, {
        name: cleanName,
        address: cleanAddress,
      });

      if (onSaved) {
        onSaved(res.data);
      }
      onClose();
    } catch (err) {
      console.error("[EditHospitalModal] update error:", err);
      setError(err?.response?.data?.error || "Failed to update hospital information.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="panel"
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-panel, #ffffff)",
          color: "var(--text-primary, #0f172a)",
          border: "1px solid var(--border-color, #e2e8f0)",
          borderRadius: "12px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
          padding: "24px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                background: "rgba(168, 32, 104, 0.12)",
                color: "var(--brand-primary, #a82068)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
                Edit Hospital & Location
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted, #64748b)" }}>
                Update institutional identity and physical branch location
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted, #64748b)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.3)",
              color: "#dc2626",
              borderRadius: "6px",
              padding: "8px 12px",
              fontSize: "0.82rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label
              htmlFor="editHospitalName"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 5, color: "var(--text-primary, #0f172a)" }}
            >
              Hospital Name *
            </label>
            <input
              id="editHospitalName"
              type="text"
              className="input-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dinajpur Medical College"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "var(--bg-input, #f8fafc)",
                color: "var(--text-primary, #0f172a)",
                fontSize: "0.9rem",
              }}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="editHospitalAddress"
              style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 5, color: "var(--text-primary, #0f172a)" }}
            >
              Location / Address *
            </label>
            <input
              id="editHospitalAddress"
              type="text"
              className="input-text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Dinajpur, Bangladesh"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                background: "var(--bg-input, #f8fafc)",
                color: "var(--text-primary, #0f172a)",
                fontSize: "0.9rem",
              }}
            />
            <div style={{ fontSize: "0.74rem", color: "var(--text-muted, #64748b)", marginTop: 4 }}>
              Changes update real-time telemetry headers, NICU cards, and generated clinical reports.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={loading}
              style={{ padding: "8px 16px", fontSize: "0.85rem", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                padding: "8px 18px",
                fontSize: "0.85rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
