import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axiosClient from "../api/axiosClient";
import Layout from "../components/Layout";
import PatientAdvisoriesTimeline from "../components/PatientAdvisoriesTimeline";
import CustomSelect from "../components/ui/CustomSelect";
import { useAuth } from "../context/AuthContext";
import { generateMedicalReportPdf } from "../utils/generateMedicalReportPdf";
import { formatDoctorName } from "../utils/clinicalCommunication";

export default function History() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(() => searchParams.get("patientId") || "");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [vitalsStats, setVitalsStats] = useState({});
  const [timeRange, setTimeRange] = useState("24h");
  const [loading, setLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // If logged-in user is a patient/guardian, redirect to their dedicated portal dashboard
  useEffect(() => {
    if (user?.role === "patient") {
      navigate("/patient/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // Load patients list for selection
  useEffect(() => {
    async function fetchPatients() {
      try {
        const { data } = await axiosClient.get("/patients?status=all");
        setPatients(data || []);
        if (!selectedPatientId && data.length > 0) {
          setSelectedPatientId(data[0]._id);
        }
      } catch (err) {
        console.error("Failed to load patients for history view:", err);
      }
    }
    fetchPatients();
  }, [selectedPatientId]);

  // Load telemetry data whenever selectedPatientId or timeRange changes
  const loadPatientTelemetry = useCallback(async () => {
    if (!selectedPatientId) return;
    setLoading(true);
    try {
      let url = `/vitals/patient/${selectedPatientId}?limit=300`;
      const now = Date.now();
      if (timeRange === "1h") {
        url += `&from=${new Date(now - 3600 * 1000).toISOString()}`;
      } else if (timeRange === "6h") {
        url += `&from=${new Date(now - 6 * 3600 * 1000).toISOString()}`;
      } else if (timeRange === "24h") {
        url += `&from=${new Date(now - 24 * 3600 * 1000).toISOString()}`;
      }

      const [patRes, notesRes, historyRes, statsRes] = await Promise.all([
        axiosClient.get(`/patients/${selectedPatientId}`),
        axiosClient.get(`/patients/${selectedPatientId}/notes`),
        axiosClient.get(url),
        axiosClient.get(`/vitals/patient/${selectedPatientId}/stats`),
      ]);

      setSelectedPatient(patRes.data);
      setNotes(notesRes.data || []);
      setVitalsHistory([...historyRes.data].reverse());
      setVitalsStats(statsRes.data || {});
    } catch (err) {
      console.warn("Could not load telemetry for patient:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedPatientId, timeRange]);

  useEffect(() => {
    loadPatientTelemetry();
  }, [loadPatientTelemetry]);

  function handlePatientChange(e) {
    const pId = e.target.value;
    setSelectedPatientId(pId);
    setSearchParams(pId ? { patientId: pId } : {});
  }

  function handleDownloadPdf() {
    if (!selectedPatient) return;
    setPdfGenerating(true);
    try {
      generateMedicalReportPdf({
        patient: selectedPatient,
        notes,
        vitalsStats,
        vitalsHistory,
      });
    } catch (err) {
      console.error("Failed to generate PDF report:", err);
      alert("Failed to generate PDF report.");
    } finally {
      setPdfGenerating(false);
    }
  }

  return (
    <Layout>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Patient Clinical History &amp; Timeline</h1>
          <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
            Patient-synchronized clinical advisories, active notices, and intervention history
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Select Patient:</label>
          <div style={{ minWidth: 260 }}>
            <CustomSelect value={selectedPatientId} onChange={handlePatientChange} placeholder="Choose a patient...">
              <option value="">Choose a patient...</option>
              {patients.map((p) => {
                const bedLabel = p.incubatorId?.label || p.incubatorId?.deviceTopicId || "Bed";
                const isDischarged = Boolean(p.dischargedAt);
                return (
                  <option key={p._id} value={p._id}>
                    {p.name} ({bedLabel}) {isDischarged ? "[Discharged]" : "[Active]"}
                  </option>
                );
              })}
            </CustomSelect>
          </div>
        </div>
      </div>

      {selectedPatient && (
        <>
          {/* Gentle, Integrated Patient Profile & Baseline Telemetry Summary */}
          <div className="patient-summary-card">
            <div className="patient-identity-block">
              <div className="patient-identity-title">
                <h3 className="patient-name-heading">{selectedPatient.name}</h3>
                <span className={`badge ${selectedPatient.dischargedAt ? "badge-unassigned" : "badge-ok"}`}>
                  {selectedPatient.dischargedAt ? "Discharged" : "Active in NICU"}
                </span>
              </div>
              <div className="patient-meta-row">
                <span>Bed: <strong>{selectedPatient.incubatorId?.label || selectedPatient.incubatorId?.deviceTopicId || "Unassigned"}</strong></span>
                <span>•</span>
                <span>Doctor: <strong>{selectedPatient.assignedDoctor?.name ? formatDoctorName(selectedPatient.assignedDoctor.name) : "NICU Team"}</strong></span>
                <span>•</span>
                <span>Indication: <strong>{selectedPatient.primarySyndrome || "Observation"}</strong></span>
                {selectedPatient.admittedAt && (
                  <>
                    <span>•</span>
                    <span>Admitted: <strong>{new Date(selectedPatient.admittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</strong></span>
                  </>
                )}
              </div>
            </div>


            {/* Actions */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn-small-outline"
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 12px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {pdfGenerating ? "Generating..." : "Export PDF"}
              </button>

              <Link
                to={`/patients/${selectedPatient._id}`}
                className="btn-small-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", fontSize: 12, padding: "6px 12px" }}
              >
                Full Record &#8594;
              </Link>
            </div>
          </div>

          {/* Patient Clinical Advisories & Active Notices History (Filtered on/after admission date) */}
          <PatientAdvisoriesTimeline patient={selectedPatient} />
        </>
      )}

      {!selectedPatient && !loading && (
        <div className="panel empty-state" style={{ padding: 50 }}>
          Please select a patient from the dropdown above to view their synchronized clinical advisories and active notices history.
        </div>
      )}
    </Layout>
  );
}
