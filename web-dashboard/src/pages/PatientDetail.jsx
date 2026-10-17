import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { useDataSync } from "../hooks/useDataSync";
import { useSocket } from "../hooks/useSocket";
import CustomSelect from "../components/ui/CustomSelect";
import PatientAdvisoriesTimeline from "../components/PatientAdvisoriesTimeline";
import InfoTooltip from "../components/ui/InfoTooltip";
import { generateMedicalReportPdf } from "../utils/generateMedicalReportPdf";
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

export default function PatientDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isHospitalAdmin = user?.role === "hospital_admin";
  const isSystemAdmin = user?.role === "system_admin";
  const isDoctor = user?.role === "doctor";

  const [patient, setPatient] = useState(null);
  const [incubators, setIncubators] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [dischargeSummary, setDischargeSummary] = useState("");

  // Auto-expand discharge or review modal if arriving from notification deep link
  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "discharge") {
      if (isHospitalAdmin) {
        setShowDischargeForm(true);
      } else if (isDoctor) {
        setShowDischargeRequestModal(true);
      }
    }
  }, [searchParams, isHospitalAdmin, isDoctor]);

  // Telemetry & PDF Report states
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [vitalsStats, setVitalsStats] = useState({});
  const [latestVital, setLatestVital] = useState(null);
  const [timeRange, setTimeRange] = useState("24h"); // "1h" | "6h" | "24h" | "all"
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Edit state (Hospital In-Charge)
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  // System Admin Review Request state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccessModal, setReviewSuccessModal] = useState(null);

  // Doctor Discharge Request state
  const [showDischargeRequestModal, setShowDischargeRequestModal] = useState(false);
  const [dischargeRequestMsg, setDischargeRequestMsg] = useState("");
  const [dischargeRequestSubmitting, setDischargeRequestSubmitting] = useState(false);
  const [dischargeRequestSuccess, setDischargeRequestSuccess] = useState(false);
  const [dischargeRequestError, setDischargeRequestError] = useState("");


  function openReviewModal() {
    if (!patient) return;
    setReviewTitle(`Review Request: Patient Record - ${patient.name}`);
    setReviewMessage(`Please review patient record "${patient.name}" regarding clinical data / admission info accuracy.`);
    setShowReviewModal(true);
  }

  function closeReviewModal() {
    setShowReviewModal(false);
    setReviewTitle("");
    setReviewMessage("");
  }

  async function handleSendReviewRequest(e) {
    e.preventDefault();
    if (!patient) return;
    setReviewSubmitting(true);
    try {
      const hospId = patient.hospitalId?._id || patient.hospitalId;
      await axiosClient.post("/notifications/review-request", {
        hospitalId: hospId,
        reviewEntity: "patient",
        reviewEntityId: patient._id,
        title: reviewTitle.trim(),
        message: reviewMessage.trim(),
      });
      setReviewSuccessModal({
        entityName: patient.name,
        hospitalName: patient.hospitalId?.name || "Hospital",
      });
      closeReviewModal();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not send review request");
    } finally {
      setReviewSubmitting(false);
    }
  }

  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const [patientRes, notesRes] = await Promise.all([
        axiosClient.get(`/patients/${id}`),
        axiosClient.get(`/patients/${id}/notes`).catch((err) => {
          console.warn("Could not load clinical notes:", err);
          return { data: [] };
        }),
      ]);
      setPatient(patientRes.data);
      setNotes(notesRes.data || []);
    } catch (err) {
      console.error("Failed to load patient:", err);
      setLoadError(err?.response?.data?.error || "Failed to load patient records");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const [activePatients, setActivePatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [nurses, setNurses] = useState([]);

  const loadStaff = useCallback(async () => {
    if (!["hospital_admin", "system_admin", "doctor", "nurse"].includes(user?.role)) return;
    try {
      const usersRes = await axiosClient.get("/users");
      const approvedStaff = usersRes.data || [];
      setDoctors(approvedStaff.filter((u) => u.role === "doctor" && u.isApproved));
      setNurses(approvedStaff.filter((u) => u.role === "nurse" && u.isApproved));
    } catch (err) {
      console.warn("Could not load hospital staff list:", err);
    }
  }, [user]);

  const loadIncubators = useCallback(async () => {
    if (!isHospitalAdmin) return;
    try {
      const [incRes, activeRes] = await Promise.all([
        axiosClient.get("/incubators"),
        axiosClient.get("/patients?status=active"),
      ]);
      setIncubators(incRes.data);
      setActivePatients(activeRes.data);
    } catch {}
  }, [isHospitalAdmin]);

  useEffect(() => {
    load();
    loadIncubators();
    loadStaff();
  }, [id, load, loadIncubators, loadStaff]);

  const loadTelemetry = useCallback(async () => {
    if (!id) return;
    try {
      let url = `/vitals/patient/${id}?limit=300`;
      const now = Date.now();
      if (timeRange === "1h") {
        url += `&from=${new Date(now - 3600 * 1000).toISOString()}`;
      } else if (timeRange === "6h") {
        url += `&from=${new Date(now - 6 * 3600 * 1000).toISOString()}`;
      } else if (timeRange === "12h") {
        url += `&from=${new Date(now - 12 * 3600 * 1000).toISOString()}`;
      } else if (timeRange === "24h") {
        url += `&from=${new Date(now - 24 * 3600 * 1000).toISOString()}`;
      }

      const [historyRes, statsRes] = await Promise.all([
        axiosClient.get(url),
        axiosClient.get(`/vitals/patient/${id}/stats`),
      ]);

      setVitalsHistory([...historyRes.data].reverse());
      setVitalsStats(statsRes.data || {});
      if (statsRes.data?.latest) {
        setLatestVital(statsRes.data.latest);
      }
    } catch (err) {
      console.warn("Failed to load patient telemetry:", err);
    }
  }, [id, timeRange]);

  useEffect(() => {
    loadTelemetry();
  }, [loadTelemetry]);

  // Live Socket.io sync for incoming vitals
  const onLiveVitals = useCallback((incomingVital) => {
    const patBedTopic = patient?.incubatorId?.deviceTopicId;
    if (incomingVital.patientId === id || (patBedTopic && incomingVital.device_id === patBedTopic)) {
      setLatestVital(incomingVital);
      setVitalsHistory((prev) => [...prev.slice(-120), incomingVital]);
    }
  }, [id, patient]);

  useSocket(onLiveVitals, null, null, null, null);

  function handleDownloadPdf() {
    if (!patient) return;
    setPdfGenerating(true);
    try {
      generateMedicalReportPdf({
        patient,
        notes,
        vitalsStats,
        vitalsHistory,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF report. Please try again.");
    } finally {
      setPdfGenerating(false);
    }
  }

  useDataSync(useCallback((changeEvent) => {
    // #15 FIX: Only re-fetch when patient-related data changes, not on every entity event
    const relevantEntities = ["patient", "patient_note", "incubator"];
    if (!changeEvent || relevantEntities.includes(changeEvent.entity)) {
      load();
    }
  }, [load]));

  // A discharge request is "pending" when the server says so (survives reloads,
  // clears automatically when the In-Charge accepts/declines).
  const dischargePending = Boolean(patient?.pendingDischarge);
  // Only the assigned doctor may request discharge (matches the backend rule)
  const assignedDoctorId = patient?.assignedDoctor?._id || patient?.assignedDoctor || null;
  const canRequestDischarge = isDoctor && (!assignedDoctorId || String(assignedDoctorId) === String(user?.id));

  function openEditPanel() {
    if (!patient) return;
    setEditForm({
      name: patient.name || "",
      biologicalSex: patient.biologicalSex || "",
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.slice(0, 10) : "",
      gestationalAgeWeeks: patient.gestationalAgeWeeks || "",
      birthWeightGrams: patient.birthWeightGrams || "",
      bloodType: patient.bloodType || "unknown",
      primarySyndrome: patient.primarySyndrome || "",
      assignedDoctor: patient.assignedDoctor?._id || patient.assignedDoctor || "",
      assignedNurse: patient.assignedNurse?._id || patient.assignedNurse || "",
      guardianName: patient.guardianName || "",
      guardianPhone: patient.guardianPhone || "",
      guardianNationalId: patient.guardianNationalId || "",
      guardianAddress: patient.guardianAddress || "",
      incubatorId: patient.incubatorId?._id || patient.incubatorId || "",
    });
    setEditError("");
    setEditSuccess("");
    setShowEditPanel(true);
  }

  function closeEditPanel() {
    setShowEditPanel(false);
    setEditError("");
    setEditSuccess("");
  }

  function updateEditField(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    setEditSuccess("");
    try {
      await axiosClient.put(`/patients/${id}`, {
        ...editForm,
        assignedDoctor: editForm.assignedDoctor || null,
        assignedNurse: editForm.assignedNurse || null,
        gestationalAgeWeeks: Number(editForm.gestationalAgeWeeks) || undefined,
        birthWeightGrams: Number(editForm.birthWeightGrams) || undefined,
      });
      setEditSuccess("Patient details updated successfully.");
      load(); // refresh data - emitDataChange on backend propagates to all portals
      setTimeout(() => {
        closeEditPanel();
      }, 1200);
    } catch (err) {
      setEditError(err?.response?.data?.error || "Could not save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    setError("");
    try {
      await axiosClient.post(`/patients/${id}/notes`, { text: noteText });
      setNoteText("");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not add note");
    }
  }

  async function handleDeleteNote(noteId) {
    if (!window.confirm("Are you sure you want to delete this clinical note? This action cannot be undone.")) {
      return;
    }
    setError("");
    setDeletingNoteId(noteId);
    try {
      await axiosClient.delete(`/patients/${id}/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch (err) {
      console.error("Failed to delete clinical note:", err);
      setError(err?.response?.data?.error || "Could not delete note.");
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function handleConfirmDischarge(e) {
    e.preventDefault();
    setError("");
    try {
      await axiosClient.patch(`/patients/${id}/discharge`, { dischargeSummary });
      setShowDischargeForm(false);
      setDischargeSummary("");
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Could not discharge patient");
    }
  }

  function openDischargeRequestModal() {
    if (dischargePending) return;
    setDischargeRequestError("");
    setShowDischargeRequestModal(true);
  }

  function closeDischargeRequestModal() {
    if (dischargeRequestSubmitting) return;
    setShowDischargeRequestModal(false);
    setDischargeRequestError("");
  }

  async function handleSendDischargeRequest(e) {
    e.preventDefault();
    if (!patient || dischargeRequestSubmitting || dischargePending) return;
    setDischargeRequestSubmitting(true);
    setDischargeRequestError("");
    try {
      await axiosClient.post("/notifications/discharge-request", {
        patientId: patient._id,
        message: dischargeRequestMsg.trim(),
      });
      setDischargeRequestSuccess(true);
      setShowDischargeRequestModal(false);
      setDischargeRequestMsg("");
      load(); // pulls pendingDischarge so the button locks immediately
    } catch (err) {
      setDischargeRequestError(err?.response?.data?.error || "Could not send discharge request");
    } finally {
      setDischargeRequestSubmitting(false);
    }
  }

  if (loading && !patient) {
    return (
      <Layout>
        <div style={{ padding: "60px 0", textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <p className="waiting-msg" style={{ margin: 0 }}>Loading patient records...</p>
        </div>
      </Layout>
    );
  }

  if (loadError && !patient) {
    return (
      <Layout>
        <div style={{ maxWidth: 540, margin: "60px auto", textAlign: "center", padding: 32, background: "var(--card-bg, #fff)", borderRadius: 12, border: "1px solid #fee2e2", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ color: "#ef4444", marginBottom: 16 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Unable to Load Patient</h2>
          <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px", lineHeight: 1.5 }}>
            {loadError}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn-primary" onClick={load} style={{ fontSize: 13, padding: "8px 18px" }}>
              Try Again
            </button>
            <Link to="/patients" className="btn-small-outline" style={{ textDecoration: "none", fontSize: 13, padding: "8px 18px", display: "inline-flex", alignItems: "center" }}>
              Back to Patients
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  if (!patient) {
    return (
      <Layout>
        <p className="waiting-msg">Patient record not found.</p>
      </Layout>
    );
  }

  const isDischarged = Boolean(patient.dischargedAt);

  return (
    <Layout>
      <p className="page-subtitle" style={{ marginBottom: 4 }}>
        <Link to="/patients">Patients</Link> / {patient.name}
      </p>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{patient.name}</h1>
          <p className="page-subtitle" style={{ margin: "4px 0 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Incubator: {patient.incubatorId?.label || patient.incubatorId?.deviceTopicId || "Unassigned"}</span>
            {patient.incubatorId?.deviceTopicId && !patient.dischargedAt && (
              <Link
                to={`/dashboard?device=${patient.incubatorId.deviceTopicId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(2, 132, 199, 0.12)",
                  color: "#0284c7",
                  border: "1px solid rgba(2, 132, 199, 0.3)",
                  textDecoration: "none",
                }}
                title="Open live telemetry monitor for this incubator"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                View Live Bed Monitor →
              </Link>
            )}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-small-outline"
            onClick={handleDownloadPdf}
            disabled={pdfGenerating}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
            title="Download certified clinical health report as PDF"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {pdfGenerating ? "Generating..." : "Clinical Report (PDF)"}
          </button>
          {isHospitalAdmin && !isDischarged && (
            <button
              className="btn-small-outline"
              onClick={openEditPanel}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit Patient Details
            </button>
          )}
          {isHospitalAdmin && !isDischarged && (
            <button
              className="btn-small-outline"
              onClick={() => {
                if (!dischargeSummary && patient.pendingDischarge?.reason) {
                  setDischargeSummary(patient.pendingDischarge.reason);
                }
                setShowDischargeForm(true);
              }}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, borderColor: "var(--critical)", color: "var(--critical)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Discharge Patient
            </button>
          )}
          {isSystemAdmin && (
            <button
              className="btn-small-outline"
              onClick={openReviewModal}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, borderColor: "var(--brand-light)", color: "var(--brand-light)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Request Review
            </button>
          )}
          {canRequestDischarge && !isDischarged && (
            <button
              className="btn-small-outline"
              onClick={openDischargeRequestModal}
              disabled={dischargePending}
              title={dischargePending ? "A discharge request is already awaiting the Hospital In-Charge" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, borderColor: "#f59e0b", color: "#f59e0b", opacity: dischargePending ? 0.55 : 1, cursor: dischargePending ? "not-allowed" : "pointer" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {dischargePending ? "Discharge Requested" : "Request Discharge"}
            </button>
          )}
        </div>
      </div>

      {isDischarged && (
        <div className="banner-neutral">
          <div className="banner-title">Discharged</div>
          <div className="banner-meta">
            {formatDateTime(patient.dischargedAt)}
            {patient.dischargedBy?.name && ` - by ${patient.dischargedBy.name}`}
          </div>
          {patient.dischargeSummary && <p style={{ marginTop: 8, marginBottom: 0 }}>{patient.dischargeSummary}</p>}
        </div>
      )}

      {/* ── Patient Info Grid ── */}
      <div className="patient-meta-grid">
        <div className="meta-item">
          <div className="meta-label">Gender</div>
          <div className="meta-value" style={{ textTransform: "capitalize" }}>{patient.biologicalSex || "-"}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Date of birth</div>
          <div className="meta-value">{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : "-"}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Gestational age</div>
          <div className="meta-value">{patient.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks}w` : "-"}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Birth weight</div>
          <div className="meta-value">{patient.birthWeightGrams ? `${patient.birthWeightGrams}g` : "-"}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Blood type</div>
          <div className="meta-value">{patient.bloodType}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Primary syndrome</div>
          <div className="meta-value">{patient.primarySyndrome || "-"}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Assigned Doctor</div>
          <div className="meta-value" style={{ fontWeight: 600, color: "var(--brand-light)" }}>
            {patient.assignedDoctor?.name ? formatDoctorName(patient.assignedDoctor.name) : "Unassigned"}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Assigned Nurse</div>
          <div className="meta-value" style={{ fontWeight: 600, color: "var(--ok)" }}>
            {patient.assignedNurse?.name ? `Nurse ${patient.assignedNurse.name.replace(/^nurse\s+/i, "")}` : "Unassigned"}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Admitted</div>
          <div className="meta-value">{formatDateTime(patient.admittedAt)}</div>
        </div>
      </div>

      {/* ── Guardian Details ── */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div className="section-title" style={{ margin: 0 }}>Mother / Guardian details</div>
          {patient.guardianPhone && (
            <a
              href={`https://wa.me/${(patient.guardianPhone || "").replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                formatGuardianCareUpdate({
                  patientName: patient.name,
                  guardianName: patient.guardianName,
                  incubatorLabel: patient.incubatorId?.label || "NICU Bedside Monitor",
                  accessCode: patient.accessCode || "",
                })
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-small-outline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                textDecoration: "none",
              }}
              title="Send access code and live telemetry portal link to guardian via WhatsApp"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Notify Guardian (WhatsApp)
            </a>
          )}
        </div>
        <div className="patient-meta-grid">
          <div className="meta-item">
            <div className="meta-label">Guardian name</div>
            <div className="meta-value">{patient.guardianName || "-"}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">
              Guardian phone
              <InfoTooltip text="Active WhatsApp number required for receiving one-click Family Portal access codes and live baby vital updates." />
            </div>
            <div className="meta-value">{patient.guardianPhone || "-"}</div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Patient Access Code</div>
            <div className="meta-value" style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, color: "var(--brand)" }}>
              {patient.accessCode || "-"}
            </div>
          </div>
          <div className="meta-item">
            <div className="meta-label">Address</div>
            <div className="meta-value">{patient.guardianAddress || "-"}</div>
          </div>
        </div>
      </div>

      {/* ── Timeline Notes ── */}
      <div className="panel">
        <div className="section-title">Timeline notes</div>

        {!isSystemAdmin && user?.role !== "patient" && !isDischarged && (
          <form className="inline-form" onSubmit={handleAddNote}>
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <label>Add a note</label>
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Administered medication at 14:00"
                required
              />
            </div>
            <button className="btn-small" type="submit">Add note</button>
          </form>
        )}

        {error && <div className="error-text">{error}</div>}

        <ul className="notes-timeline">
          {notes.map((n) => {
            const roleLabel = n.authorId?.role === "hospital_admin" ? "Hospital In-Charge"
              : n.authorId?.role === "doctor" ? "Doctor"
              : n.authorId?.role === "nurse" ? "Nurse"
              : n.authorId?.role || "";
            const roleColor = n.authorId?.role === "hospital_admin" ? "#6366f1"
              : n.authorId?.role === "doctor" ? "#0ea5e9"
              : n.authorId?.role === "nurse" ? "#10b981"
              : "#64748b";

            const noteAuthorId = n.authorId?._id ? String(n.authorId._id) : (typeof n.authorId === "string" ? n.authorId : "");
            const currentUserId = user?.id ? String(user.id) : (user?._id ? String(user._id) : "");
            const isAuthor = Boolean(currentUserId && noteAuthorId && currentUserId === noteAuthorId);

            return (
              <li key={n._id} className="note-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="note-meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{formatDateTime(n.timestamp)}</span>
                    <span style={{ color: "var(--text-secondary)" }}>-</span>
                    <span style={{ fontWeight: 600 }}>{n.authorId?.name || "Unknown"}</span>
                    {roleLabel && (
                      <span style={{
                        display: "inline-block",
                        padding: "1px 7px",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 700,
                        background: `${roleColor}1a`,
                        color: roleColor,
                        border: `1px solid ${roleColor}40`,
                        letterSpacing: "0.02em",
                        textTransform: "uppercase",
                      }}>
                        {roleLabel}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {n.text}
                  </div>
                </div>

                {isAuthor && (
                  <button
                    type="button"
                    className="btn-delete-note"
                    onClick={() => handleDeleteNote(n._id)}
                    disabled={deletingNoteId === n._id}
                    title="Delete your clinical note"
                    aria-label="Delete clinical note"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    <span>{deletingNoteId === n._id ? "Deleting..." : "Delete"}</span>
                  </button>
                )}
              </li>
            );
          })}
          {!notes.length && <li className="empty-state">No notes logged yet.</li>}
        </ul>

        {!isDischarged && isHospitalAdmin && patient.pendingDischarge && (
          <p className="page-subtitle" style={{ margin: "12px 0 0", color: "#f59e0b" }}>
            Discharge requested{patient.pendingDischarge.requestedBy ? ` by ${formatDoctorName(patient.pendingDischarge.requestedBy)}` : ""}
            {patient.pendingDischarge.reason ? ` - "${patient.pendingDischarge.reason}"` : ""}
          </p>
        )}
      </div>

      {/* ── Patient Clinical History & Problems (Filtered on/after admission date) ── */}
      <PatientAdvisoriesTimeline patient={patient} />

      {/* ── Confirm Discharge Modal (Hospital In-Charge only) ── */}
      {!isDischarged && isHospitalAdmin && showDischargeForm && (
        <div className="modal-overlay" onClick={() => setShowDischargeForm(false)} style={{ alignItems: "center", padding: "20px" }}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, width: "100%" }}>
            <div className="modal-header">
              <div className="modal-title">Discharge Patient — {patient.name}</div>
              <button className="modal-close" onClick={() => setShowDischargeForm(false)} aria-label="Close">&times;</button>
            </div>
            <form onSubmit={handleConfirmDischarge} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {patient.pendingDischarge?.reason && (
                <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "var(--radius-sm)", fontSize: 12.5, color: "var(--text-secondary)" }}>
                  Doctor's Request: <strong>"{patient.pendingDischarge.reason}"</strong>
                </div>
              )}
              <div className="field">
                <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Discharge Summary / Notes (optional)
                </label>
                <textarea
                  value={dischargeSummary}
                  onChange={(e) => setDischargeSummary(e.target.value)}
                  placeholder="e.g. Baby is stable, transferred to pediatric ward / home care."
                  style={{ width: "100%", minHeight: 90, padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text-primary)", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                <button type="button" className="btn-small-outline" onClick={() => setShowDischargeForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-small" style={{ background: "var(--critical)", color: "#fff" }}>
                  Confirm Discharge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Patient Modal (Hospital In-Charge only) ── */}
      {showEditPanel && (
        <div
          className="modal-overlay"
          onClick={closeEditPanel}
          style={{ alignItems: "center", padding: "20px" }}
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 720,
              width: "100%",
              maxHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
              borderRadius: "16px",
            }}
          >
            {/* Header (Fixed Top) */}
            <div className="modal-header" style={{ flexShrink: 0, padding: "20px 24px", background: "var(--panel)" }}>
              <div>
                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Patient Details
                </div>
                <div className="modal-subtitle" style={{ fontSize: 13, marginTop: 2 }}>{patient.name}</div>
              </div>
              <button className="modal-close" onClick={closeEditPanel} aria-label="Close">x</button>
            </div>

            {/* Scrollable Form Body */}
            <form
              onSubmit={handleSaveEdit}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {/* Clinical Information Card */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--brand)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />
                  Clinical Information
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Patient Name *
                    </label>
                    <input value={editForm.name} onChange={(e) => updateEditField("name", e.target.value)} required />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Incubator Bed *
                    </label>
                    <CustomSelect value={editForm.incubatorId} onChange={(e) => updateEditField("incubatorId", e.target.value)} required placeholder="Select incubator">
                      <option value="">Select incubator</option>
                      {incubators.map((i) => {
                        const wardName = i.wardId?.name || "Unassigned NICU";
                        const isMaintenance = i.status === "maintenance";
                        const isOffline = i.status === "offline";
                        // If occupied by ANOTHER active patient (excluding the current patient)
                        const occupiedPatient = activePatients.find(
                          (p) => String(p._id) !== String(patient._id) && String(p.incubatorId?._id || p.incubatorId) === String(i._id)
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
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Gender *
                    </label>
                    <CustomSelect value={editForm.biologicalSex} onChange={(e) => updateEditField("biologicalSex", e.target.value)} required>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </CustomSelect>
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Date of Birth *
                    </label>
                    <input type="date" value={editForm.dateOfBirth} onChange={(e) => updateEditField("dateOfBirth", e.target.value)} required />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Gestational Age (weeks)
                    </label>
                    <input type="number" value={editForm.gestationalAgeWeeks} onChange={(e) => updateEditField("gestationalAgeWeeks", e.target.value)} min={20} max={45} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Birth Weight (g)
                    </label>
                    <input type="number" value={editForm.birthWeightGrams} onChange={(e) => updateEditField("birthWeightGrams", e.target.value)} min={100} max={6000} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Blood Type
                    </label>
                    <CustomSelect value={editForm.bloodType} onChange={(e) => updateEditField("bloodType", e.target.value)}>
                      {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </CustomSelect>
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Assigned Doctor
                    </label>
                    <CustomSelect
                      value={editForm.assignedDoctor}
                      onChange={(e) => updateEditField("assignedDoctor", e.target.value)}
                      placeholder="Select attending doctor"
                    >
                      <option value="">- No doctor assigned -</option>
                      {doctors.map((d) => (
                        <option key={d._id} value={d._id}>
                          {formatDoctorName(d.name)}
                        </option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Assigned Duty Nurse
                    </label>
                    <CustomSelect
                      value={editForm.assignedNurse}
                      onChange={(e) => updateEditField("assignedNurse", e.target.value)}
                      placeholder="Select duty nurse"
                    >
                      <option value="">- No nurse assigned -</option>
                      {nurses.map((n) => (
                        <option key={n._id} value={n._id}>
                          Nurse {n.name.replace(/^nurse\s+/i, "")}
                        </option>
                      ))}
                    </CustomSelect>
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Primary Syndrome / Admission Reason
                    </label>
                    <input
                      list="edit-syndrome-options"
                      value={editForm.primarySyndrome}
                      onChange={(e) => updateEditField("primarySyndrome", e.target.value)}
                      placeholder="e.g. Respiratory Distress Syndrome"
                    />
                    <datalist id="edit-syndrome-options">
                      {COMMON_SYNDROMES.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Mother / Guardian Details Card */}
              <div
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--brand)",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--brand)" }} />
                  Mother / Guardian Details
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Guardian Name
                    </label>
                    <input value={editForm.guardianName} onChange={(e) => updateEditField("guardianName", e.target.value)} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Guardian Phone
                    </label>
                    <input type="tel" value={editForm.guardianPhone} onChange={(e) => updateEditField("guardianPhone", e.target.value)} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      National ID / Passport No.
                    </label>
                    <input value={editForm.guardianNationalId} onChange={(e) => updateEditField("guardianNationalId", e.target.value)} />
                  </div>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Guardian Address
                    </label>
                    <input value={editForm.guardianAddress} onChange={(e) => updateEditField("guardianAddress", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Status Messages */}
              {editError && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#e11d48",
                    fontSize: 13,
                  }}
                >
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius)",
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#10b981",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {editSuccess}
                </div>
              )}

              {/* Footer Action Buttons */}
              <div
                style={{
                  display: "flex",
                  justify: "flex-end",
                  gap: 10,
                  paddingTop: 12,
                  marginTop: "auto",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button type="button" className="btn-small-outline" onClick={closeEditPanel}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-small"
                  disabled={editSaving}
                  style={{ background: "var(--brand)", minWidth: 130 }}
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── System Admin Review Request Modal ── */}
      {showReviewModal && (
        <div className="modal-overlay" onClick={closeReviewModal}>
          <div className="modal-panel modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Send Review Request to Hospital In-Charge</div>
                <div className="modal-subtitle">{patient.hospitalId?.name || "Hospital In-Charge"}</div>
              </div>
              <button className="modal-close" onClick={closeReviewModal}>x</button>
            </div>
            <form onSubmit={handleSendReviewRequest}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Target Entity</label>
                <input type="text" className="input-text" value={`PATIENT: ${patient.name}`} disabled readOnly />
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Request Title *</label>
                <input type="text" className="input-text" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} required />
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label>Message / Review Instructions for Hospital In-Charge *</label>
                <textarea className="input-text" style={{ minHeight: 90, fontFamily: "inherit" }} value={reviewMessage} onChange={(e) => setReviewMessage(e.target.value)} placeholder="Explain what data needs update or correction..." required />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-small-outline" onClick={closeReviewModal}>Cancel</button>
                <button type="submit" className="btn-small" disabled={reviewSubmitting}>
                  {reviewSubmitting ? "Sending..." : "Send Review Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── System Admin Review Request Success Popup ── */}
      {reviewSuccessModal && (
        <div className="modal-overlay" onClick={() => setReviewSuccessModal(null)}>
          <div className="modal-panel modal-sm" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", padding: "28px 24px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Review Request Sent Successfully</h3>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
              Your review request for patient <strong>"{reviewSuccessModal.entityName}"</strong> has been delivered to the Hospital In-Charge of <strong>{reviewSuccessModal.hospitalName}</strong>. An alert banner and notification have been posted to their dashboard.
            </p>
            <button type="button" className="btn-small" style={{ minWidth: 140, margin: "0 auto" }} onClick={() => setReviewSuccessModal(null)}>
              Got It
            </button>
          </div>
        </div>
      )}

      {/* ── Doctor: Request Discharge Modal ── */}
      {showDischargeRequestModal && (
        <div className="modal-overlay" onClick={closeDischargeRequestModal}>
          <div
            className="modal-panel modal-md dr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dr-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") closeDischargeRequestModal(); }}
          >
            <div className="modal-header dr-header">
              <div className="dr-header-main">
                <span className="dr-header-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </span>
                <div>
                  <div className="modal-title" id="dr-modal-title">Request Patient Discharge</div>
                  <div className="modal-subtitle">Awaiting approval from the Hospital In-Charge</div>
                </div>
              </div>
              <button type="button" className="modal-close" onClick={closeDischargeRequestModal} aria-label="Close">x</button>
            </div>

            <form className="dr-form" onSubmit={handleSendDischargeRequest}>
              <div className="dr-body">
                <div className="dr-patient-card">
                  <div className="dr-patient-label">Patient</div>
                  <div className="dr-patient-name">{patient.name}</div>
                  {(patient.incubatorId?.label || patient.incubatorId?.deviceTopicId) && (
                    <div className="dr-patient-meta">
                      Incubator: {patient.incubatorId?.label || patient.incubatorId?.deviceTopicId}
                    </div>
                  )}
                </div>

                <div className="dr-notice" role="note">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    This sends a discharge request to the Hospital In-Charge. The patient is discharged only after the In-Charge approves it.
                  </span>
                </div>

                <div className="dr-field">
                  <label htmlFor="dr-reason">
                    Reason / Clinical Justification <span className="dr-optional">(optional)</span>
                  </label>
                  <textarea
                    id="dr-reason"
                    className="dr-textarea"
                    rows={4}
                    maxLength={500}
                    autoFocus
                    value={dischargeRequestMsg}
                    onChange={(e) => setDischargeRequestMsg(e.target.value)}
                    placeholder="e.g. Vitals stable for 48 hours. Ready for home care."
                  />
                  <div className="dr-counter">{dischargeRequestMsg.length}/500</div>
                </div>

                {dischargeRequestError && (
                  <div className="dr-error" role="alert">{dischargeRequestError}</div>
                )}
              </div>

              <div className="dr-footer">
                <button type="button" className="btn-small-outline dr-btn" onClick={closeDischargeRequestModal} disabled={dischargeRequestSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-small dr-btn dr-btn-primary" disabled={dischargeRequestSubmitting}>
                  {dischargeRequestSubmitting ? "Sending..." : "Send Discharge Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Doctor: Discharge Request Sent Success Popup ── */}
      {dischargeRequestSuccess && (
        <div className="modal-overlay" onClick={() => setDischargeRequestSuccess(false)}>
          <div className="modal-panel modal-sm" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", padding: "28px 24px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Discharge Request Sent</h3>
            <p style={{ margin: "0 0 20px", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
              Your discharge request for <strong>{patient.name}</strong> has been sent to the Hospital In-Charge. You will receive a notification when it is approved or declined.
            </p>
            <button type="button" className="btn-small" style={{ minWidth: 140, margin: "0 auto", background: "#f59e0b" }} onClick={() => setDischargeRequestSuccess(false)}>
              Got It
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
