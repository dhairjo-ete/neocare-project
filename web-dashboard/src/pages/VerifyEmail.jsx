import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import PublicHeader from "../components/PublicHeader";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the URL.");
      return;
    }

    axiosClient
      .get(`/auth/verify-email?token=${token}`)
      .then(({ data }) => {
        setStatus("success");
        setMessage(data.message || "Email verified successfully!");
        setRole(data.role || "");
        setIsApproved(data.isApproved || false);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err?.response?.data?.error || "Verification failed. The link may have expired.");
      });
  }, [token]);

  const approvalNote = !isApproved && role !== "system_admin"
    ? role === "hospital_admin"
      ? "A System Administrator will review and approve your hospital registration."
      : "Your Hospital Administrator will review and approve your account."
    : null;

  return (
    <div>
      <PublicHeader />

      <div className="login-shell">
        <div className="login-panel" style={{ maxWidth: 440, textAlign: "center" }}>
          {status === "verifying" && (
            <>
              <div className="verify-icon">⏳</div>
              <div className="login-brand">Verifying your email...</div>
              <div className="login-caption">Please wait while we confirm your email address.</div>
            </>
          )}

          {status === "success" && (
            <>
              <div className="verify-icon verify-success">✓</div>
              <div className="login-brand">Email Verified!</div>
              <div className="login-caption" style={{ color: "var(--hr)" }}>{message}</div>
              {approvalNote && (
                <div className="status-text" style={{ marginTop: 16 }}>
                  {approvalNote}
                </div>
              )}
              <Link to="/login" className="btn-primary" style={{ display: "inline-block", marginTop: 24, textDecoration: "none", padding: "10px 32px" }}>
                Go to Login
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="verify-icon verify-error">✕</div>
              <div className="login-brand">Verification Failed</div>
              <div className="error-text" style={{ textAlign: "center" }}>{message}</div>
              <Link to="/login" className="btn-primary" style={{ display: "inline-block", marginTop: 24, textDecoration: "none", padding: "10px 32px" }}>
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
