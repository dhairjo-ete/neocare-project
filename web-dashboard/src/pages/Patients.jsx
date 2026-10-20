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
  const [copiedCode, setCopiedCode] = useState(false);

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

      {/* ── Patient Admission Success Modal ── */}
      {admittedSuccessData && (() => {
        const incMatch = incubators.find((i) => String(i._id) === String(admittedSuccessData.incubatorId?._id || admittedSuccessData.incubatorId));
        const bedLabel = incMatch?.label || incMatch?.deviceTopicId || admittedSuccessData.incubatorId?.label || "NICU Bed";
        const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
        const effectiveMagicLink = admittedSuccessData.magicLink && !admittedSuccessData.magicLink.includes("localhost")
          ? admittedSuccessData.magicLink
          : `${currentOrigin}/patient/access?code=${admittedSuccessData.accessCode}`;
        const cleanPhone = (admittedSuccessData.guardianPhone || "").replace(/[^0-9]/g, "");
        const waText = encodeURIComponent(
          formatGuardianCareUpdate({
            patientName: admittedSuccessData.name,
            guardianName: admittedSuccessData.guardianName,
            incubatorLabel: bedLabel,
            accessCode: admittedSuccessData.accessCode,
            magicLink: effectiveMagicLink,
          })
        );
        const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

        return (
          <div className="modal-overlay" onClick={() => setAdmittedSuccessData(null)}>
            <div className="admission-success-modal" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="admission-modal-header">
                <div className="admission-modal-header-main">
                  <div className="admission-modal-icon-badge">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="admission-modal-title">Patient Admitted Successfully</h3>
                    <span className="admission-modal-subtitle">SMS &amp; Guardian Access Link Generated</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="admission-modal-close-btn"
                  onClick={() => setAdmittedSuccessData(null)}
                  title="Close popup"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="admission-modal-body">
                {/* Patient Summary Card */}
                <div className="admission-detail-card">
                  <div className="admission-detail-row">
                    <span className="admission-detail-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      Baby / Infant
                    </span>
                    <span className="admission-detail-value">{admittedSuccessData.name}</span>
                  </div>

                  <div className="admission-detail-row">
                    <span className="admission-detail-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                        <path d="M6 8h.01M6 12h.01M6 16h.01"></path>
                      </svg>
                      Assigned Bed
                    </span>
                    <span className="admission-detail-value">{bedLabel}</span>
                  </div>

                  <div className="admission-detail-row">
                    <span className="admission-detail-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                      Guardian Contact
                    </span>
                    <span className="admission-detail-value">
                      {admittedSuccessData.guardianName} ({admittedSuccessData.guardianPhone})
                    </span>
                  </div>
                </div>

                {/* Unique Access Code */}
                <div className="admission-code-block">
                  <div className="admission-code-meta">
                    <span className="admission-code-title">Guardian Access Code</span>
                    <span className="admission-code-value">{admittedSuccessData.accessCode}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-small-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(admittedSuccessData.accessCode || "");
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    style={{ minWidth: 100, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                  >
                    {copiedCode ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Magic Link */}
                <div className="admission-magiclink-group">
                  <label className="admission-magiclink-label">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    One-Click Magic Link (Dispatched via SMS)
                  </label>
                  <div className="admission-magiclink-input-row">
                    <input
                      type="text"
                      readOnly
                      value={effectiveMagicLink}
                      className="admission-magiclink-input"
                      title={effectiveMagicLink}
                    />
                    <button
                      type="button"
                      className="btn-small-outline"
                      onClick={() => {
                        navigator.clipboard.writeText(effectiveMagicLink);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      }}
                      style={{ minWidth: 95, height: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                    >
                      {copiedLink ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="admission-sms-status-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>SMS alert dispatched to {admittedSuccessData.guardianPhone}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="admission-modal-footer">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admission-whatsapp-btn"
                  title="Send care update & magic access link directly to parent via WhatsApp"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.074-1.127-.065-.268-.086-.615-.221-1.04-.407-1.802-.79-2.977-2.617-3.067-2.738-.09-.12-1.727-2.298-1.727-4.383 0-2.086 1.092-3.111 1.48-3.504.388-.393.847-.492 1.13-.492.283 0 .565.003.812.015.263.013.615-.1 1.014.86.417 1.002.997 2.43 1.084 2.607.087.177.145.385.029.615-.116.23-.174.373-.348.577-.174.204-.366.455-.523.611-.174.173-.356.363-.153.71.203.348.905 1.492 1.94 2.414 1.332 1.187 2.455 1.556 2.803 1.729.348.174.551.145.754-.087.203-.232.87-1.016 1.102-1.364.232-.348.464-.29.783-.174.319.116 2.029.957 2.377 1.13.348.174.58.261.667.406.087.145.087.84-.057 1.245z"/>
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 1.891.526 3.66 1.439 5.174L2 22l4.981-1.309A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.053c-1.63 0-3.14-.492-4.405-1.333l-.316-.21-2.96.777.79-2.887-.231-.334A8.04 8.04 0 0 1 3.947 12c0-4.441 3.612-8.053 8.053-8.053 4.441 0 8.053 3.612 8.053 8.053 0 4.441-3.612 8.053-8.053 8.053z"/>
                  </svg>
                  <span>Notify via WhatsApp</span>
                </a>

                <button
                  type="button"
                  className="btn-primary admission-done-btn"
                  onClick={() => setAdmittedSuccessData(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
