import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axiosClient from "../api/axiosClient";
import PublicHeader from "../components/PublicHeader";
import CustomSelect from "../components/ui/CustomSelect";
import InfoTooltip from "../components/ui/InfoTooltip";

const SIGNUP_MODES = [
  { key: "hospital_admin", label: "Register Hospital & Admin" },
  { key: "staff", label: "Register as Doctor / Nurse" },
];

export default function Signup() {
  const [mode, setMode] = useState("hospital_admin");
  const { registerHospitalAdmin, registerStaff } = useAuth();
  const navigate = useNavigate();

  // Hospital Admin fields
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Staff fields
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffLicenseNumber, setStaffLicenseNumber] = useState("");
  const [staffRole, setStaffRole] = useState("doctor");
  const [staffHospitalId, setStaffHospitalId] = useState("");

  // Shared state
  const [hospitals, setHospitals] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch public hospital list for staff signup
    axiosClient.get("/hospitals/public")
      .then((res) => setHospitals(res.data))
      .catch(() => {});
  }, []);

  async function handleHospitalAdminSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await registerHospitalAdmin({
        hospitalName,
        hospitalAddress,
        adminName,
        adminEmail,
        adminPhone,
        password: adminPassword,
      });
      navigate("/login", {
        state: {
          justRegistered: true,
          message: `Hospital "${result.hospitalName}" registered! Check your email for the verification link. A System Admin will approve your account.`,
        },
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Could not register hospital admin");
    } finally {
      setLoading(false);
    }
  }

  async function handleStaffSignup(e) {
    e.preventDefault();
    setError("");
    if (!staffHospitalId) {
      setError("Please select a hospital");
      return;
    }
    if (!staffLicenseNumber.trim()) {
      setError("License Number is required");
      return;
    }
    setLoading(true);
    try {
      await registerStaff({
        name: staffName,
        email: staffEmail,
        phone: staffPhone,
        licenseNumber: staffLicenseNumber.trim(),
        password: staffLicenseNumber.trim(),
        role: staffRole,
        hospitalId: staffHospitalId,
      });
      navigate("/login", {
        state: {
          justRegistered: true,
          message: `Registered as ${staffRole === "doctor" ? "Doctor" : "Nurse"}! Check your email for verification. Your initial login password is your License Number (${staffLicenseNumber.trim()}).`,
        },
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PublicHeader />

      <div className="login-shell" style={{ padding: "40px 20px" }}>
        <div className="login-panel signup-panel" style={{ maxWidth: 640, width: "100%", padding: "36px 40px" }}>
          <div className="login-brand" style={{ fontSize: 22, marginBottom: 8 }}>Create account</div>

          {/* Mode selector tabs */}
          <div className="portal-tabs">
            {SIGNUP_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`portal-tab ${mode === m.key ? "active" : ""}`}
                onClick={() => { setMode(m.key); setError(""); }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {error && <div className="error-text">{error}</div>}

          {/* =================== HOSPITAL ADMIN FORM =================== */}
          {mode === "hospital_admin" && (
            <form onSubmit={handleHospitalAdminSignup}>
              <div className="login-caption">Register a new hospital and your admin account</div>

              <fieldset className="form-section">
                <legend>Hospital Details</legend>
                <div className="form-row-2col">
                  <div className="field">
                    <label htmlFor="hospitalName">Hospital Name *</label>
                    <input id="hospitalName" type="text" value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} required />
                  </div>
                  <div className="field">
                    <label htmlFor="hospitalAddress">Hospital Address</label>
                    <input id="hospitalAddress" type="text" value={hospitalAddress} onChange={(e) => setHospitalAddress(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              </fieldset>

              <fieldset className="form-section">
                <legend>Admin Account</legend>
                <div className="form-row-2col">
                  <div className="field">
                    <label htmlFor="adminName">Your Name *</label>
                    <input id="adminName" type="text" value={adminName} onChange={(e) => setAdminName(e.target.value)} autoComplete="name" required />
                  </div>
                  <div className="field">
                    <label htmlFor="adminEmail">Email *</label>
                    <input id="adminEmail" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="email" required />
                  </div>
                </div>
                <div className="form-row-2col">
                  <div className="field">
                    <label htmlFor="adminPhone">
                      Phone Number *
                      <InfoTooltip text="Active WhatsApp number required for emergency alerts and high-priority administrative notifications." />
                    </label>
                    <input id="adminPhone" type="tel" value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} autoComplete="tel" placeholder="+8801XXXXXXXXX" required />
                  </div>
                  <div className="field">
                    <label htmlFor="adminPassword">Password *</label>
                    <input id="adminPassword" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="new-password" required />
                  </div>
                </div>
              </fieldset>

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 12 }}>
                {loading ? "Registering..." : "Register Hospital & Admin"}
              </button>
            </form>
          )}

          {/* =================== STAFF FORM =================== */}
          {mode === "staff" && (
            <form onSubmit={handleStaffSignup}>
              <div className="login-caption">Sign up as a Doctor or Nurse under an existing hospital</div>

              <div className="form-row-2col">
                <div className="field">
                  <label htmlFor="staffRole">Role *</label>
                  <CustomSelect id="staffRole" value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="field-select">
                    <option value="doctor">Doctor</option>
                    <option value="nurse">Nurse</option>
                  </CustomSelect>
                </div>

                <div className="field">
                  <label htmlFor="staffHospital">Hospital *</label>
                  <CustomSelect id="staffHospital" value={staffHospitalId} onChange={(e) => setStaffHospitalId(e.target.value)} className="field-select" required>
                    <option value="">Select your hospital</option>
                    {hospitals.map((h) => (
                      <option key={h._id} value={h._id}>{h.name}</option>
                    ))}
                  </CustomSelect>
                  {hospitals.length === 0 && (
                    <div className="field-hint">No hospitals registered yet. Ask your Hospital Admin to register first.</div>
                  )}
                </div>
              </div>

              <div className="form-row-2col">
                <div className="field">
                  <label htmlFor="staffName">Full Name *</label>
                  <input id="staffName" type="text" value={staffName} onChange={(e) => setStaffName(e.target.value)} autoComplete="name" required />
                </div>

                <div className="field">
                  <label htmlFor="staffEmail">Email *</label>
                  <input id="staffEmail" type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} autoComplete="email" required />
                </div>
              </div>

              <div className="form-row-2col">
                <div className="field">
                  <label htmlFor="staffPhone">
                    Phone Number *
                    <InfoTooltip text={`Active WhatsApp number required to receive automated clinical advisories and emergency telemetry alerts.`} />
                  </label>
                  <input id="staffPhone" type="tel" value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} autoComplete="tel" placeholder="+8801XXXXXXXXX" required />
                </div>

                <div className="field">
                  <label htmlFor="staffLicenseNumber">{staffRole === "doctor" ? "BMDC / Medical License No. *" : "Nursing Council / License No. *"}</label>
                  <input id="staffLicenseNumber" type="text" value={staffLicenseNumber} onChange={(e) => setStaffLicenseNumber(e.target.value)} placeholder="e.g. A-123456" required />
                </div>
              </div>

              <div style={{ background: "rgba(2, 132, 199, 0.08)", border: "1px solid rgba(2, 132, 199, 0.25)", borderRadius: 6, padding: "10px 14px", fontSize: "0.82rem", color: "var(--text-secondary, #475569)", marginTop: 8, marginBottom: 8, lineHeight: 1.5 }}>
                <strong>Initial Password Notice:</strong> You do not need to create a password now. Your Medical / Nursing License Number will serve as your initial login password. You will be prompted to set your personal permanent password upon your first login.
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 12 }}>
                {loading ? "Registering..." : "Sign up"}
              </button>
            </form>
          )}

          <div className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
