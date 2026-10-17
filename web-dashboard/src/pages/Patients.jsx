import { useEffect, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import Layout from "../components/Layout";
import { useDataSync } from "../hooks/useDataSync";
import { useAuth } from "../context/AuthContext";
import CustomSelect from "../components/ui/CustomSelect";
import InfoTooltip from "../components/ui/InfoTooltip";
import { formatGuardianCareUpdate, formatDoctorName } from "../utils/clinicalCommunication";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

const COMMON_SYNDROMES = [
  "Respiratory Distress Syndrome",
  "Low Birth Weight",
  "Jaundice (Neonatal Hyperbilirubinemia)",
  "Prematurity",
  "Suspected Sepsis",
  "Birth Asphyxia",
  "Hypoglycemia",
  "Congenital Heart Defect",
  "Meconium Aspiration Syndrome",
];

const EMPTY_FORM = {
  incubatorId: "",
  name: "",
  biologicalSex: "",
  dateOfBirth: "",
  gestationalAgeWeeks: "",
  birthWeightGrams: "",
  bloodType: "unknown",
  primarySyndrome: "",
  assignedDoctor: "",
  assignedNurse: "",
  guardianName: "",
  guardianPhone: "",
  guardianNationalId: "",
  guardianAddress: "",
};

/** Format a date/datetime as "10 Sept 2026, 13:16" */
function formatDateTime(value) {
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

/** Local calendar-day key (avoids UTC shifting a date to the previous/next day) */
function dayKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Patients() {
  const { user } = useAuth();

  if (user?.role === "system_admin") {
    return <Navigate to="/admin/overview" replace />;
  }

  const canAdmit = user && ["hospital_admin", "nurse"].includes(user.role);

  const [incubators, setIncubators] = useState([]);
  const [activePatients, setActivePatients] = useState([]);
  const [doctors, setDoctors] = useState([]); // for assigned doctor dropdown
  const [nurses, setNurses] = useState([]); // for assigned duty nurse dropdown
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [admittedSuccessData, setAdmittedSuccessData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Counts shown on the Active / Discharged buttons
  const [activeCount, setActiveCount] = useState(null);
  const [dischargedCount, setDischargedCount] = useState(null);

  // Modal state: null | "active" | "discharged"
  const [modalStatus, setModalStatus] = useState(null);
  const [modalPatients, setModalPatients] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [incubatorFilter, setIncubatorFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("desc"); // "asc" | "desc"

  const loadIncubators = useCallback(async () => {
    try {
      const [incRes, activeRes] = await Promise.all([
        axiosClient.get("/incubators"),
        axiosClient.get("/patients?status=active"),
      ]);
      setIncubators(incRes.data);
      setActivePatients(activeRes.data);
      
      // Catch the users call separately so a 403 (for Nurses) doesn't crash incubator loading
      try {
        const usersRes = await axiosClient.get("/users");
        const allStaff = usersRes.data || [];
        setDoctors(allStaff.filter((u) => u.role === "doctor" && u.isApproved));
        setNurses(allStaff.filter((u) => u.role === "nurse" && u.isApproved));
      } catch (userErr) {
        // Nurse role naturally denies this, which is fine, doctors/nurses list remains empty
        console.warn("Could not load staff list (likely insufficient permissions).");
      }
    } catch (err) {
      console.error("Failed to load incubators or patients", err);
    }
  }, []);

  const loadCounts = useCallback(async () => {
    try {
      const [activeRes, dischargedRes] = await Promise.all([
        axiosClient.get("/patients?status=active"),
        axiosClient.get("/patients?status=discharged"),
      ]);
      setActiveCount(activeRes.data.length);
      setDischargedCount(dischargedRes.data.length);
    } catch {}
  }, []);

  const fetchModalList = useCallback(async (status) => {
    setModalLoading(true);
    try {
      const { data } = await axiosClient.get(`/patients?status=${status}`);
      setModalPatients(data);
    } catch {
      setModalPatients([]);
    } finally {
      setModalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncubators();
    loadCounts();
  }, [loadIncubators, loadCounts]);

  // Real-time synchronization - keeps counts and any open modal list current
  useDataSync(
    useCallback(() => {
      loadIncubators();
      loadCounts();
      if (modalStatus) fetchModalList(modalStatus);
    }, [loadIncubators, loadCounts, modalStatus, fetchModalList])
  );

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await axiosClient.post("/patients", {
        ...form,
        gestationalAgeWeeks: Number(form.gestationalAgeWeeks) || undefined,
        birthWeightGrams: Number(form.birthWeightGrams) || undefined,
      });
      setForm(EMPTY_FORM);
      loadCounts();
      setAdmittedSuccessData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not add patient");
    } finally {
      setSubmitting(false);
    }
  }

  function openModal(status) {
    setModalStatus(status);
    setSearchQuery("");
    setDateFilter("");
    setIncubatorFilter("");
    setSortOrder("desc");
    fetchModalList(status);
  }

  function closeModal() {
    setModalStatus(null);
    setModalPatients([]);
    setSearchQuery("");
    setDateFilter("");
    setIncubatorFilter("");
    setSortOrder("desc");
  }

  // Apply incubator + date + search query filter then sort
  const dateField = modalStatus === "discharged" ? "dischargedAt" : "admittedAt";
  const filteredPatients = modalPatients
    .filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = (p.name || "").toLowerCase().includes(q);
        const guardianMatch = (p.guardianName || "").toLowerCase().includes(q);
        const syndromeMatch = (p.primarySyndrome || "").toLowerCase().includes(q);
        const incMatch = (p.incubatorId?.label || p.incubatorId?.deviceTopicId || "").toLowerCase().includes(q);
        if (!nameMatch && !guardianMatch && !syndromeMatch && !incMatch) return false;
      }
      if (incubatorFilter) {
        const pIncId = p.incubatorId?._id || p.incubatorId;
        if (String(pIncId) !== String(incubatorFilter)) return false;
      }
      if (dateFilter) {
        if (!p[dateField] || dayKey(p[dateField]) !== dateFilter) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const tA = a[dateField] ? new Date(a[dateField]).getTime() : 0;
      const tB = b[dateField] ? new Date(b[dateField]).getTime() : 0;
      return sortOrder === "asc" ? tA - tB : tB - tA;
    });

  return (
    <Layout>
      <h1 className="page-title">Patients</h1>


      {canAdmit ? (
        <form className="patient-admission-form" onSubmit={handleCreate}>
          <div className="field col-inc">
            <label>Incubator</label>
            <CustomSelect value={form.incubatorId} onChange={(e) => updateField("incubatorId", e.target.value)} required placeholder="Select incubator">
              <option value="">Select incubator</option>
              {incubators.map((i) => {
                const wardName = i.wardId?.name || "Unassigned NICU";
                const isMaintenance = i.status === "maintenance";
                const isOffline = i.status === "offline";
                const occupiedPatient = activePatients.find(
                  (p) => String(p.incubatorId?._id || p.incubatorId) === String(i._id)
                );
                const isOccupied = Boolean(occupiedPatient);
                const isDisabled = isMaintenance || isOffline || isOccupied;

                let hint = null;
                let statusType = i.status;
                if (isMaintenance) {
                  hint = "Under Maintenance";
                  statusType = "maintenance";
                } else if (isOffline) {
                  hint = "Offline";
                  statusType = "offline";
                } else if (isOccupied) {
                  hint = `Occupied (${occupiedPatient.name})`;
                  statusType = "occupied";
                }

                return (
                  <option
                    key={i._id}
                    value={i._id}
                    disabled={isDisabled}
                    data-status={statusType}
                    data-hint={hint}
                  >
                    {`${i.label || i.deviceTopicId} (${wardName})`}
                  </option>
                );
              })}
            </CustomSelect>
          </div>
          <div className="field col-name">
            <label>Name</label>
            <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Baby of Mrs. Rahman" required />
          </div>
          <div className="field col-gender">
            <label>Gender</label>
            <CustomSelect value={form.biologicalSex} onChange={(e) => updateField("biologicalSex", e.target.value)} required>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </CustomSelect>
          </div>
          <div className="field col-dob">
            <label>Date of birth</label>
            <input type="date" value={form.dateOfBirth} onChange={(e) => updateField("dateOfBirth", e.target.value)} required />
          </div>
          <div className="field col-ga">
            <label>Gestational age (weeks)</label>
            <input type="number" value={form.gestationalAgeWeeks} onChange={(e) => updateField("gestationalAgeWeeks", e.target.value)} required />
          </div>
          <div className="field col-weight">
            <label>Birth weight (g)</label>
            <input type="number" value={form.birthWeightGrams} onChange={(e) => updateField("birthWeightGrams", e.target.value)} required />
          </div>
          <div className="field col-blood">
            <label>Blood type</label>
            <CustomSelect value={form.bloodType} onChange={(e) => updateField("bloodType", e.target.value)} required>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </CustomSelect>
          </div>
          <div className="field col-syndrome">
            <label>Primary syndrome / admission reason</label>
            <input
              list="syndrome-options"
              value={form.primarySyndrome}
              onChange={(e) => updateField("primarySyndrome", e.target.value)}
              placeholder="e.g. Respiratory Distress Syndrome"
              required
            />
            <datalist id="syndrome-options">
              {COMMON_SYNDROMES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field col-doctor">
            <label>Assigned Doctor <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></label>
            <CustomSelect value={form.assignedDoctor} onChange={(e) => updateField("assignedDoctor", e.target.value)}>
              <option value="">- No doctor assigned -</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{formatDoctorName(d.name)}</option>
              ))}
            </CustomSelect>
          </div>

          <div className="field col-nurse">
            <label>Assigned Duty Nurse <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></label>
            <CustomSelect value={form.assignedNurse} onChange={(e) => updateField("assignedNurse", e.target.value)}>
              <option value="">- No nurse assigned -</option>
              {nurses.map((n) => (
                <option key={n._id} value={n._id}>Nurse {n.name.replace(/^nurse\s+/i, "")}</option>
              ))}
            </CustomSelect>
          </div>

          <div className="form-section-divider">Mother / Guardian details</div>

          <div className="field col-gname">
            <label>Guardian name</label>
            <input value={form.guardianName} onChange={(e) => updateField("guardianName", e.target.value)} placeholder="Primary contact name" required />
          </div>
          <div className="field col-gphone">
            <label>
              Guardian phone
              <InfoTooltip text="Active WhatsApp number required for receiving one-click Family Portal access codes and live baby vital updates." />
            </label>
            <input type="tel" value={form.guardianPhone} onChange={(e) => updateField("guardianPhone", e.target.value)} placeholder="+8801XXXXXXXXX" required />
          </div>
          <div className="field col-gnid">
            <label>National ID / passport no. <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></label>
            <input value={form.guardianNationalId} onChange={(e) => updateField("guardianNationalId", e.target.value)} placeholder="Optional: National ID or passport no." />
          </div>
          <div className="field col-gaddr">
            <label>Guardian address</label>
            <input value={form.guardianAddress} onChange={(e) => updateField("guardianAddress", e.target.value)} placeholder="Present address" required />
          </div>

          <div className="form-actions">
            <button className="btn-small" type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add patient"}
            </button>
          </div>
        </form>
      ) : (
        <div className="banner-neutral" style={{ marginBottom: 22 }}>
          <div className="banner-title">Patient Admission is handled by Hospital In-Charge</div>
        </div>
      )}

      {error && <div className="error-text">{error}</div>}

      <div className="patient-status-actions">
        <button className="status-action-card" onClick={() => openModal("active")}>
          <div className="status-action-label">Active Patients</div>
          <div className="status-action-count">{activeCount === null ? "..." : activeCount}</div>
          <div className="status-action-hint">View list &amp; filter by date &#8594;</div>
        </button>
        <button className="status-action-card" onClick={() => openModal("discharged")}>
          <div className="status-action-label">Discharged Patients</div>
          <div className="status-action-count">{dischargedCount === null ? "..." : dischargedCount}</div>
          <div className="status-action-hint">View list &amp; filter by date &#8594;</div>
        </button>
      </div>

      {modalStatus && (
        <div className="modal-overlay" onClick={closeModal} style={{ alignItems: "center", padding: "20px" }}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840, width: "100%" }}>
            <div className="modal-header" style={{ padding: "20px 24px" }}>
              <div>
                <div className="modal-title">
                  {modalStatus === "active" ? "Active Patients" : "Discharged Patients"}
                </div>
                <div className="modal-subtitle">
                  {modalStatus === "active"
                    ? "Currently admitted, linked to a live incubator"
                    : "Historical record - no longer linked to a live incubator"}
                </div>
              </div>
              <button className="modal-close" onClick={closeModal} aria-label="Close">x</button>
            </div>

            {/* Filter Section - Row 1: Search & Sort Pills | Row 2: Date & Incubator Filters */}
            <div style={{ padding: "16px 24px", marginBottom: 0 }}>
              {/* ROW 1: Search box & Pill Sort toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <input
                  type="text"
                  className="input-text"
                  placeholder="Search patient, guardian, or syndrome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ height: 36, flex: "1 1 280px", maxWidth: 380, fontSize: 13 }}
                />

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setSortOrder("desc")}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: sortOrder === "desc" ? 600 : 500,
                      border: sortOrder === "desc" ? "1px solid var(--brand)" : "1px solid rgba(225, 29, 72, 0.3)",
                      background: sortOrder === "desc" ? "var(--brand)" : "transparent",
                      color: sortOrder === "desc" ? "#ffffff" : "var(--text-primary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ↓ Newest
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortOrder("asc")}
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 20,
                      fontSize: 12.5,
                      fontWeight: sortOrder === "asc" ? 600 : 500,
                      border: sortOrder === "asc" ? "1px solid var(--brand)" : "1px solid rgba(225, 29, 72, 0.3)",
                      background: sortOrder === "asc" ? "var(--brand)" : "transparent",
                      color: sortOrder === "asc" ? "#ffffff" : "var(--text-primary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    ↑ Oldest
                  </button>
                </div>
              </div>

              {/* ROW 2: Date Filter & Incubator Filter + Clear Button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label htmlFor="patient-date-filter" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                      Date:
                    </label>
                    <input
                      id="patient-date-filter"
                      type="date"
                      className="input-text"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      style={{ height: 34, width: 135, padding: "0 6px", fontSize: 12 }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label htmlFor="patient-inc-filter" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                      Incubator:
                    </label>
                    <CustomSelect
                      id="patient-inc-filter"
                      value={incubatorFilter}
                      onChange={(e) => setIncubatorFilter(e.target.value)}
                      style={{ height: 34, minWidth: 160 }}
                    >
                      <option value="">All Incubators</option>
                      {incubators.map((i) => (
                        <option key={i._id} value={i._id}>
                          {i.label || i.deviceTopicId} ({i.wardId?.name || "Unassigned NICU"})
                        </option>
                      ))}
                    </CustomSelect>
                  </div>
                </div>

                {(searchQuery || dateFilter || incubatorFilter) && (
                  <button
                    className="btn-small-outline"
                    type="button"
                    onClick={() => { setSearchQuery(""); setDateFilter(""); setIncubatorFilter(""); }}
                    style={{ height: 32, fontSize: 12, padding: "0 12px" }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            <div className="modal-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Name</th>
                    <th style={{ textAlign: "center" }}>Incubator</th>
                    <th style={{ textAlign: "center" }}>{modalStatus === "discharged" ? "Discharged Date" : "Admitted Date"}</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((p) => (
                    <tr key={p._id}>
                      <td style={{ textAlign: "left" }}><strong>{p.name}</strong></td>
                      <td className="mono" style={{ textAlign: "center" }}>{p.incubatorId?.label || p.incubatorId?.deviceTopicId || "-"}</td>
                      <td className="mono" style={{ textAlign: "center" }}>
                        {formatDateTime(modalStatus === "discharged" ? p.dischargedAt : p.admittedAt)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          to={`/patients/${p._id}`}
                          onClick={closeModal}
                          style={{ color: "var(--brand)", textDecoration: "none", fontSize: 13, fontWeight: 500 }}
                        >
                          View timeline
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!modalLoading && !filteredPatients.length && (
                    <tr>
                      <td colSpan={4} className="empty-state">
                        {dateFilter
                          ? "No patients found for that date."
                          : modalStatus === "active"
                          ? "No active patients yet."
                          : "No discharged patients on record yet."}
                      </td>
                    </tr>
                  )}
                  {modalLoading && (
                    <tr>
                      <td colSpan={4} className="empty-state">Loading...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {admittedSuccessData && (
        <div className="modal-backdrop" onClick={() => setAdmittedSuccessData(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(34, 197, 94, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ok, #22c55e)" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Patient Admitted Successfully</h3>
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>SMS &amp; Magic Access Link Generated</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setAdmittedSuccessData(null)}>✕</button>
            </div>

            <div style={{ background: "var(--bg-main)", padding: 14, borderRadius: 8, marginBottom: 16, border: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Baby:</strong> {admittedSuccessData.name}
              </div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Guardian:</strong> {admittedSuccessData.guardianName} ({admittedSuccessData.guardianPhone})
              </div>
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border-subtle)" }}>
                <span>Unique Access Code:</span>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 16, fontWeight: 800, color: "var(--brand)", letterSpacing: "1px", background: "rgba(15, 76, 129, 0.1)", padding: "2px 8px", borderRadius: 4 }}>
                  {admittedSuccessData.accessCode}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                One-Click Magic Link (Sent to Guardian via SMS)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  readOnly
                  value={admittedSuccessData.magicLink || ""}
                  style={{ fontSize: 12, fontFamily: "IBM Plex Mono", background: "var(--bg-surface)" }}
                />
                <button
                  type="button"
                  className="btn-small-outline"
                  onClick={() => {
                    navigator.clipboard.writeText(admittedSuccessData.magicLink || "");
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--ok)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                SMS alert dispatched to {admittedSuccessData.guardianPhone}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 18 }}>
              {(() => {
                const cleanPhone = (admittedSuccessData.guardianPhone || "").replace(/[^0-9]/g, "");
                const waText = encodeURIComponent(
                  formatGuardianCareUpdate({
                    patientName: admittedSuccessData.name,
                    guardianName: admittedSuccessData.guardianName,
                    incubatorLabel: admittedSuccessData.incubatorId?.label || "Incubator Bed",
                    accessCode: admittedSuccessData.accessCode,
                    magicLink: admittedSuccessData.magicLink,
                  })
                );
                const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                return (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-small-outline"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      padding: "8px 14px",
                      textDecoration: "none",
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    Notify via WhatsApp
                  </a>
                );
              })()}

              <button
                type="button"
                className="btn-primary"
                style={{ padding: "8px 22px", fontSize: 13 }}
                onClick={() => setAdmittedSuccessData(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
