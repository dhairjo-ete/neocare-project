import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PublicHeader from "../components/PublicHeader";

export default function MagicAccess() {
  const [searchParams] = useSearchParams();
  const codeParam = searchParams.get("code") || searchParams.get("key") || "";
  const [manualCode, setManualCode] = useState(codeParam);
  const [loading, setLoading] = useState(Boolean(codeParam));
  const [error, setError] = useState("");
  const { loginWithMagicCode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!codeParam) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function authenticate() {
      try {
        setLoading(true);
        setError("");
        await loginWithMagicCode(codeParam);
        if (isMounted) {
          navigate("/patient/dashboard", { replace: true });
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err?.response?.data?.error ||
              "Invalid or expired magic link. Please enter your patient access code below."
          );
          setLoading(false);
        }
      }
    }

    authenticate();
    return () => {
      isMounted = false;
    };
  }, [codeParam, loginWithMagicCode, navigate]);

  async function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualCode.trim()) return;
    try {
      setLoading(true);
      setError("");
      await loginWithMagicCode(manualCode.trim());
      navigate("/patient/dashboard", { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          "Invalid access code. Please verify the code sent to your phone upon admission."
      );
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-main)" }}>
      <PublicHeader />

      <div className="login-shell">
        <div className="login-panel" style={{ maxWidth: 440, textAlign: "center" }}>
          {loading ? (
            <div style={{ padding: "30px 10px" }}>
              <div className="pulse-dot" style={{ margin: "0 auto 16px" }}></div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Verifying One-Click Magic Link...
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
                Connecting to secure patient telemetry records...
              </p>
            </div>
          ) : (
            <div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: error ? "rgba(239, 68, 68, 0.12)" : "rgba(15, 76, 129, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  color: error ? "var(--red, #ef4444)" : "var(--brand, #0f4c81)",
                }}
              >
                {error ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </div>

              <div className="login-brand" style={{ fontSize: 20, marginBottom: 6 }}>
                Patient Magic Access
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
                {error || "Enter your unique patient access code from the admission SMS"}
              </p>

              {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

              <form onSubmit={handleManualSubmit} style={{ textAlign: "left" }}>
                <div className="field">
                  <label htmlFor="manualCode">Patient Access Code (from SMS)</label>
                  <input
                    id="manualCode"
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="e.g. RAH-7492"
                    required
                    style={{ textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: "100%", marginTop: 8 }}>
                  Access Baby Records
                </button>
              </form>

              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
                <Link
                  to="/login"
                  style={{
                    fontSize: 12.5,
                    color: "var(--brand)",
                    textDecoration: "none",
                    fontWeight: 600,
                  }}
                >
                  Return to Main Portal Login &#8594;
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
