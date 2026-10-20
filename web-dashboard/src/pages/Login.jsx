import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PublicHeader from "../components/PublicHeader";

const PORTALS = [
  { key: "patient", label: "Parent / Guardian" },
  { key: "staff", label: "Doctor / Nurse" },
  { key: "hospital_admin", label: "Hospital In-Charge" },
];

export default function Login() {
  const [portal, setPortal] = useState("patient");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = location.state?.justRegistered;
  const registrationMsg = location.state?.message;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setStatusMsg("");
    try {
      const loggedUser = await login(email, password, portal);
      if (portal === "patient" || loggedUser?.role === "patient") {
        navigate("/patient/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.code === "EMAIL_NOT_VERIFIED") {
        setStatusMsg("Your email is not verified yet. Please check your inbox for the verification link.");
      } else if (resp?.code === "AWAITING_APPROVAL") {
        setStatusMsg(resp.error);
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        setError("Cannot connect to NeoCare server. Please check your network connection.");
      } else {
        setError(resp?.error || "Invalid credentials. Please verify your details.");
      }
    }
  }

  const portalDescriptions = {
    patient: "Enter your registered Guardian Phone and unique Patient Access Code from your admission SMS",
    staff: "Sign in as a Doctor or Nurse to access live vitals & telemetry",
    hospital_admin: "Hospital In-Charge portal — manage staff, wards & resources",
  };

  return (
    <div>
      <PublicHeader />

      <div className="login-shell">
        <div className="login-panel" style={{ maxWidth: 440 }}>
          <div className="login-brand">Portal Login</div>

          {/* Portal selector tabs */}
          <div className="portal-tabs">
            {PORTALS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`portal-tab ${portal === p.key ? "active" : ""}`}
                onClick={() => { setPortal(p.key); setError(""); setStatusMsg(""); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="login-caption">{portalDescriptions[portal]}</div>

          {justRegistered && !error && !statusMsg && (
            <div className="success-text">{registrationMsg || "Account created! Please verify your email and wait for admin approval."}</div>
          )}
          {statusMsg && <div className="status-text">{statusMsg}</div>}
          {error && <div className="error-text">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">
                {portal === "patient" ? "Guardian Phone Number" : "Email Address"}
              </label>
              <input
                id="email"
                type={portal === "patient" ? "text" : "email"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={portal === "patient" ? "e.g. 017XXXXXXXX" : "name@hospital.org"}
                autoComplete={portal === "patient" ? "tel" : "email"}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">
                {portal === "patient" ? "Patient Access Code (from SMS)" : "Password"}
              </label>
              <input
                id="password"
                type={portal === "patient" ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(portal === "patient" ? e.target.value.toUpperCase() : e.target.value)}
                placeholder={portal === "patient" ? "e.g. RAH-7492" : "••••••••"}
                autoComplete={portal === "patient" ? "off" : "current-password"}
                required
                style={portal === "patient" ? { textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 } : {}}
              />
            </div>

            {portal === "patient" && (
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: -6, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Note: Check your phone for the SMS with your unique PIN and one-click magic link.
              </p>
            )}

            {portal === "staff" && (
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: -6, marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" cy="16" x2="12" y2="12" />
                  <line x1="12" cy="8" x2="12.01" y2="8" />
                </svg>
                First-time login? Use your Medical / Nursing License Number as your initial password.
              </p>
            )}

            <button type="submit" className="btn-primary">
              {portal === "patient" ? "Access Baby Records" : "Log in"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            {portal === "patient" ? (
              <span>Having trouble accessing your baby's record? Please contact the NICU on-duty desk.</span>
            ) : (
              <span>Don't have a staff account? <Link to="/signup">Register as Hospital Staff</Link></span>
            )}
          </div>

          {/* Discreet, secure footer link for Platform Administrators */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--border-subtle)", textAlign: "center" }}>
            <Link
              to="/admin/login"
              style={{
                fontSize: 11.5,
                color: "var(--text-tertiary)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
              title="Restricted gateway for platform administrators"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Platform Administration Portal &#8594;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
