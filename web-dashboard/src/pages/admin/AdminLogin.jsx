import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import PublicHeader from "../../components/PublicHeader";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, "system_admin");
      navigate("/admin/overview");
    } catch (err) {
      setError(err?.response?.data?.error || "Access denied. Valid System Administrator credentials required.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PublicHeader />

      <div className="login-shell">
        <div className="login-panel" style={{ maxWidth: 440, borderTop: "4px solid var(--brand, #0f4c81)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(15, 76, 129, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--brand, #0f4c81)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <div className="login-brand" style={{ fontSize: 20, margin: 0 }}>Platform Administration</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.5px", textTransform: "uppercase", fontWeight: 600 }}>
                High-Security Central Directorate
              </div>
            </div>
          </div>
  <div className="login-caption" style={{ margin: "14px 0 20px" }}>
            This portal is restricted to authorized system administrators only. Please enter your credentials to proceed.
          </div>

          {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="admin-email">Administrator Email</label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@neocare.org"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="admin-password">Secure Password / Passkey</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Authenticating..." : "Authenticate as System Admin"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            Need hospital staff or guardian portal?{" "}
            <Link to="/login" style={{ fontWeight: 600, color: "var(--brand)" }}>
              General Portal Login &#8594;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
