import { useState, useEffect, useCallback } from "react";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";
import { useDataSync } from "../hooks/useDataSync";
import { useSocket } from "../hooks/useSocket";
import { classifyVitals } from "../utils/vitalsStatus";
import EditHospitalModal from "./EditHospitalModal";

export default function NicuGridView({ deviceMap, onSelectDevice }) {
  const { user } = useAuth();
  const isSystemAdmin = user?.role === "system_admin";
  const isHospitalAdmin = user?.role === "hospital_admin";
  const canAccessHospitals = isSystemAdmin || isHospitalAdmin;

  // Drill-down State
  const [viewLevel, setViewLevel] = useState(isSystemAdmin ? "hospitals" : "wards");
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [selectedWard, setSelectedWard] = useState(null);

  const [hospitals, setHospitals] = useState([]);
  const [wards, setWards] = useState([]);
  const [incubators, setIncubators] = useState([]);
  const [patientsMap, setPatientsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [editingHospital, setEditingHospital] = useState(null);

  // Load core data
  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const [hRes, wRes, iRes, pRes] = await Promise.all([
        canAccessHospitals ? axiosClient.get("/hospitals") : Promise.resolve({ data: [] }),
        axiosClient.get("/wards"),
        axiosClient.get("/incubators"),
        axiosClient.get("/patients?activeOnly=true"),
      ]);

      setHospitals(hRes.data || []);
      setWards(wRes.data || []);
      setIncubators(iRes.data || []);

      const pMap = {};
      (pRes.data || []).forEach((p) => {
        const incId = p.incubatorId?._id || p.incubatorId;
        const topicId = p.incubatorId?.deviceTopicId;
        if (incId) pMap[incId] = p;
        if (topicId) pMap[topicId] = p;
      });
      setPatientsMap(pMap);
    } catch (err) {
      console.error("[NicuGridView] Load error:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [canAccessHospitals]);

  function handleHospitalSaved(updated) {
    setHospitals((prev) =>
      prev.map((h) => (String(h._id) === String(updated._id) ? { ...h, ...updated } : h))
    );
    if (selectedHospital && String(selectedHospital._id) === String(updated._id)) {
      setSelectedHospital((prev) => ({ ...prev, ...updated }));
    }
  }

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Real-time synchronization when any portal/admin makes changes
  useDataSync(useCallback(() => {
    loadData(false);
  }, [loadData]));

  // Listen for incubator:standby events (backend signals no patient on a device)
  // When a patient is admitted/discharged, loadData() is triggered by data:change
  useSocket(null, null, null, useCallback(() => {
    // standby events don't require a full reload - they are informational
    // The data:change event from patient admission/discharge already triggers loadData
  }, []));


  const [modalNotice, setModalNotice] = useState(null);

  // Compute status for an incubator based on its hardware status, patient admission, and latest vitals
  function getIncubatorCardStatus(inc, vital, hasPatient) {
    const hwStatus = inc?.status || "active";

    if (hwStatus === "maintenance") {
      return {
        label: "MAINTENANCE",
        code: "warning",
        class: "badge-warning",
        isOpenable: false,
        message: "Biomedical maintenance & calibration in progress",
      };
    }

    if (hwStatus === "offline") {
      return {
        label: "OFFLINE",
        code: "offline",
        class: "badge-unassigned",
        isOpenable: false,
        message: "Hardware disconnected from IoT gateway",
      };
    }

    // Active incubator with NO admitted patient - empty/standby bed
    if (!hasPatient) {
      return {
        label: "STANDBY",
        code: "standby",
        class: "badge-standby",
        isOpenable: true,  // Staff can open to admit a patient
        message: "Empty bed - no patient admitted",
        isEmpty: true,
      };
    }

    // Active incubator WITH admitted patient - evaluate live telemetry
    if (!vital) {
      return {
        label: "CONNECTING",
        code: "stable",
        class: "badge-ok",
        isOpenable: true,
        message: "Patient admitted - awaiting first sensor reading",
        isEmpty: false,
      };
    }

    // Same bands as the backend alert engine; null/missing values are ignored
    const level = classifyVitals(vital);

    if (level === "critical") {
      return { label: "CRITICAL", code: "critical", class: "badge-critical", isOpenable: true, isEmpty: false };
    }

    if (level === "warning") {
      return { label: "WARNING", code: "warning", class: "badge-warning", isOpenable: true, isEmpty: false };
    }

    return { label: "STABLE", code: "stable", class: "badge-ok", isOpenable: true, isEmpty: false };
  }

  function handleCardClick(inc, devKey, statusObj) {
    if (!statusObj.isOpenable) {
      const isMaint = inc?.status === "maintenance";
      setModalNotice({
        title: isMaint ? "Incubator Under Maintenance" : "Incubator Offline",
        message: isMaint
          ? `Incubator "${inc.label || devKey}" is currently under scheduled biomedical maintenance and sensor calibration. Real-time telemetry monitoring is temporarily paused until returned to Active status.`
          : `Incubator "${inc.label || devKey}" is currently Offline (powered down or disconnected). Real-time telemetry is unavailable until the device is switched to Active.`,
        type: isMaint ? "warning" : "error",
      });
      return;
    }
    setModalNotice(null);
    onSelectDevice(devKey);
  }

  // Filter Wards by Selected Hospital
  const filteredWards = selectedHospital
    ? wards.filter((w) => String(w.hospitalId?._id || w.hospitalId) === String(selectedHospital._id))
    : wards;

  // Filter Incubators by Selected Ward or Selected Hospital
  const filteredIncubators = selectedWard
    ? incubators.filter((i) => String(i.wardId?._id || i.wardId) === String(selectedWard._id))
    : selectedHospital
    ? incubators.filter((i) => String(i.hospitalId?._id || i.hospitalId) === String(selectedHospital._id))
    : incubators;

  if (loading) {
    return (
      <div className="waiting-card">
        <div className="spinner"></div>
        <p className="waiting-msg">Loading NICU telemetry grid...</p>
      </div>
    );
  }

  return (
    <div className="command-center-container">
      {/* Informative Toast / Banner for Locked Incubators */}
      {modalNotice && (
        <div className={`banner ${modalNotice.type === "warning" ? "banner-warning" : "banner-error"}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <strong>{modalNotice.title}:</strong> {modalNotice.message}
          </div>
          <button
            onClick={() => setModalNotice(null)}
            style={{ background: "none", border: "none", color: "inherit", fontSize: 18, cursor: "pointer", padding: "0 6px" }}
            title="Dismiss"
          >
            x
          </button>
        </div>
      )}

      {/* Clean Interactive Breadcrumb Bar */}
      <div className="grid-breadcrumb-bar">
        <div className="breadcrumb-links">
          {canAccessHospitals && (
            <>
              <button
                className={`breadcrumb-btn ${viewLevel === "hospitals" ? "active" : ""}`}
                onClick={() => {
                  setViewLevel("hospitals");
                  setSelectedHospital(null);
                  setSelectedWard(null);
                  setModalNotice(null);
                  setHospitalSearch("");
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {isSystemAdmin ? `Hospitals (${hospitals.length})` : (hospitals[0]?.name ? `${hospitals[0].name}` : "My Hospital")}
              </button>
              {(selectedHospital || viewLevel !== "hospitals") && <span className="breadcrumb-sep">/</span>}
            </>
          )}

          {(selectedHospital || (!isSystemAdmin && viewLevel !== "hospitals")) && (
            <>
              <button
                className={`breadcrumb-btn ${viewLevel === "wards" ? "active" : ""}`}
                onClick={() => { setViewLevel("wards"); setSelectedWard(null); setModalNotice(null); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
                {selectedHospital ? `${selectedHospital.name} NICUs` : "NICUs"} ({filteredWards.length})
              </button>
              {selectedWard && <span className="breadcrumb-sep">/</span>}
            </>
          )}

          {selectedWard && (
            <span className="breadcrumb-btn active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              {selectedWard.name} Incubators ({filteredIncubators.length})
            </span>
          )}
        </div>

        {/* Back Button */}
        {viewLevel === "incubators" && (
          <button className="btn-small-outline" onClick={() => { setViewLevel("wards"); setModalNotice(null); }}>
            ← Back to NICUs
          </button>
        )}
        {viewLevel === "wards" && (
          isSystemAdmin && selectedHospital ? (
            <button className="btn-small-outline" onClick={() => { setViewLevel("hospitals"); setModalNotice(null); }}>
              ← Back to Hospitals
            </button>
          ) : isHospitalAdmin ? (
            <button className="btn-small-outline" onClick={() => { setViewLevel("hospitals"); setModalNotice(null); }}>
              ← Hospital Details
            </button>
          ) : null
        )}
      </div>

      {/* Hospital Search Bar - visible only on hospitals level for system admin */}
      {viewLevel === "hospitals" && isSystemAdmin && (
        <div className="hosp-search-bar">
          <svg className="hosp-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="hosp-search-input"
            placeholder="Search hospitals by name or location..."
            value={hospitalSearch}
            onChange={(e) => setHospitalSearch(e.target.value)}
          />
          {hospitalSearch && (
            <button className="hosp-search-clear" onClick={() => setHospitalSearch("")} title="Clear search">x</button>
          )}
        </div>
      )}

      {/* ================= LEVEL 1: HOSPITALS GRID (System Admin & Hospital In-Charge) ================= */}
      {viewLevel === "hospitals" && canAccessHospitals && (
        <div className="nicu-grid-floorplan">
          {hospitals
            .filter((h) => {
              const q = hospitalSearch.toLowerCase();
              return !q || h.name?.toLowerCase().includes(q) || h.address?.toLowerCase().includes(q);
            })
            .map((h) => {
            const hWards = wards.filter((w) => String(w.hospitalId?._id || w.hospitalId) === String(h._id));
            const hIncubators = incubators.filter((i) => String(i.hospitalId?._id || i.hospitalId) === String(h._id));
            const incIds = new Set(hIncubators.map((i) => String(i._id)));
            const seenHospPatientIds = new Set();
            const activePatients = Object.values(patientsMap).filter((p) => {
              const pIncId = String(p.incubatorId?._id || p.incubatorId);
              if (!incIds.has(pIncId)) return false;
              if (seenHospPatientIds.has(String(p._id))) return false;
              seenHospPatientIds.add(String(p._id));
              return true;
            }).length;
            const firstLetter = (h.name || "H").trim().charAt(0).toUpperCase();
            const canEditThisHospital = isSystemAdmin || (isHospitalAdmin && String(user?.hospitalId?._id || user?.hospitalId) === String(h._id));

            return (
              <div
                key={h._id}
                className="nicu-bed-card hospital-grid-card"
                onClick={() => {
                  setSelectedHospital(h);
                  setViewLevel("wards");
                  setModalNotice(null);
                }}
              >
                <div className="bed-card-header">
                  <div className="bed-identity" style={{ width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                      <span className="bed-number">HOSPITAL</span>
                      <span className="badge badge-ok">{hIncubators.length} Beds</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      <span className="bed-label" style={{ margin: 0 }}>{h.name}</span>
                      {canEditThisHospital && (
                        <button
                          type="button"
                          className="btn-hosp-edit-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingHospital(h);
                          }}
                          title="Edit hospital name and location"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bed-patient-section">
                  <div className="patient-active-badge" style={{ justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="patient-icon hosp-initial-icon">{firstLetter}</span>
                      <div className="patient-meta">
                        <span className="patient-name">{h.address || "Location not set"}</span>
                        <span className="patient-sub">{hWards.length} NICUs</span>
                      </div>
                    </div>
                    {canEditThisHospital && (
                      <button
                        type="button"
                        className="btn-hosp-edit-subtle"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingHospital(h);
                        }}
                        title="Edit location"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Edit Location
                      </button>
                    )}
                  </div>
                </div>

                <div className="bed-vitals-grid">
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">NICUS</span>
                    <span className="vital-mini-value">{hWards.length}</span>
                  </div>
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">INCUBATORS</span>
                    <span className="vital-mini-value">{hIncubators.length}</span>
                  </div>
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">PATIENTS</span>
                    <span className="vital-mini-value" style={{ color: "var(--brand-light)" }}>{activePatients}</span>
                  </div>
                </div>

                <div className="bed-card-footer">
                  <span className="protocol-tag">System Network</span>
                  <span className="view-detail-link">Open NICUs &#8594;</span>
                </div>
              </div>
            );
          })}
          {hospitals.filter((h) => {
            const q = hospitalSearch.toLowerCase();
            return !q || h.name?.toLowerCase().includes(q) || h.address?.toLowerCase().includes(q);
          }).length === 0 && (
            <div className="panel empty-state">
              {hospitalSearch ? `No hospitals match "${hospitalSearch}".` : "No hospitals registered in the system yet."}
            </div>
          )}
        </div>
      )}

      {/* ================= LEVEL 2: NICUS GRID ================= */}
      {viewLevel === "wards" && (
        <>
          {(isHospitalAdmin ? (hospitals[0] || selectedHospital) : selectedHospital) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--bg-panel, #ffffff)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "10px",
                padding: "12px 18px",
                marginBottom: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              {(() => {
                const activeHosp = isHospitalAdmin ? (hospitals[0] || selectedHospital) : selectedHospital;
                const canEditThis = isSystemAdmin || (isHospitalAdmin && String(user?.hospitalId?._id || user?.hospitalId) === String(activeHosp?._id));
                return (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "8px",
                          background: "rgba(168, 32, 104, 0.12)",
                          color: "var(--brand-primary, #a82068)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "1rem",
                        }}
                      >
                        {(activeHosp.name || "H").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.05em", color: "var(--brand-primary, #a82068)", textTransform: "uppercase" }}>
                            HOSPITAL
                          </span>
                          <strong style={{ fontSize: "1.05rem", color: "var(--text-primary, #0f172a)" }}>
                            {activeHosp.name}
                          </strong>
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--text-muted, #64748b)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>{activeHosp.address || "Location not set"}</span>
                          <span style={{ margin: "0 4px" }}>•</span>
                          <span>{filteredWards.length} NICUs</span>
                        </div>
                      </div>
                    </div>

                    {canEditThis && (
                      <button
                        type="button"
                        className="btn-hosp-edit-icon"
                        onClick={() => setEditingHospital(activeHosp)}
                        style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                        title="Edit hospital name and location"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Edit Hospital & Location</span>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="nicu-grid-floorplan">
          {filteredWards.map((w) => {
            const wIncubators = incubators.filter((i) => String(i.wardId?._id || i.wardId) === String(w._id));
            const incIds = new Set(wIncubators.map((i) => String(i._id)));
            // Deduplicate patients (each patient may appear under both incId and topicId keys)
            const seenPatientIds = new Set();
            const activePatients = Object.values(patientsMap).filter((p) => {
              const pIncId = String(p.incubatorId?._id || p.incubatorId);
              if (!incIds.has(pIncId)) return false;
              if (seenPatientIds.has(String(p._id))) return false;
              seenPatientIds.add(String(p._id));
              return true;
            }).length;
            const freeBeds = Math.max(0, wIncubators.length - activePatients);

            return (
              <div
                key={w._id}
                className="nicu-bed-card ward-grid-card"
                onClick={() => {
                  setSelectedWard(w);
                  setViewLevel("incubators");
                  setModalNotice(null);
                }}
              >
                <div className="bed-card-header">
                  <div className="bed-identity">
                    <span className="bed-number">NICU UNIT</span>
                    <span className="bed-label">{w.name}</span>
                  </div>
                  <span className="badge badge-ok">{wIncubators.length} Beds Total</span>
                </div>

                <div className="bed-patient-section">
                  <div className="patient-active-badge">
                    <span className="patient-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                    </span>
                    <div className="patient-meta">
                      <span className="patient-name">{w.hospitalId?.name || selectedHospital?.name || "Hospital NICU"}</span>
                      <span className="patient-sub">{activePatients} Occupied · {freeBeds} Free Beds</span>
                    </div>
                  </div>
                </div>

                <div className="bed-vitals-grid">
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">TOTAL BEDS</span>
                    <span className="vital-mini-value">{wIncubators.length}</span>
                  </div>
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">OCCUPIED</span>
                    <span className="vital-mini-value" style={{ color: "var(--brand-light)" }}>{activePatients}</span>
                  </div>
                  <div className="vital-mini-box">
                    <span className="vital-mini-label">AVAILABLE</span>
                    <span className="vital-mini-value" style={{ color: "var(--ok)" }}>{freeBeds}</span>
                  </div>
                </div>

                <div className="bed-card-footer">
                  <span className="protocol-tag">1 Bed = 1 Patient</span>
                  <span className="view-detail-link">Inspect Incubators &#8594;</span>
                </div>
              </div>
            );
          })}
          {filteredWards.length === 0 && (
            <div className="panel empty-state">No NICUs found. Create a NICU in NICUs administration.</div>
          )}
        </div>
      </>
    )}

      {/* ================= LEVEL 3: INCUBATORS MONITORS GRID ================= */}
      {viewLevel === "incubators" && (
        <div className="nicu-grid-floorplan">
          {filteredIncubators.map((inc, index) => {
            const devKey = inc.deviceTopicId || `incubator_0${index + 1}`;
            const patient = patientsMap[inc._id] || patientsMap[devKey];
            const hasPatient = !!patient;
            // Gate vitals: only show live readings when a patient is admitted
            const vital = hasPatient ? (deviceMap[devKey] || deviceMap[`incubator_0${index + 1}`]) : null;
            const status = getIncubatorCardStatus(inc, vital, hasPatient);
            const hwStatus = inc?.status || "active";


            return (
              <div
                key={inc._id || devKey}
                className={`nicu-bed-card status-border-${status.code} ${!status.isOpenable ? "disabled-card" : ""}`}
                onClick={() => handleCardClick(inc, devKey, status)}
                title={
                  !status.isOpenable
                    ? status.message
                    : status.isEmpty
                    ? "Click to open bed and admit a patient"
                    : "Click to view detailed real-time waveform dashboard"
                }
              >
                <div className="bed-card-header">
                  <div className="bed-identity">
                    <span className="bed-number">BED #{index + 1}</span>
                    <span className="bed-label">{inc.label || devKey}</span>
                  </div>
                  <span className={`badge ${status.class}`}>{status.label}</span>
                </div>

                {/* Patient Protocol Info */}
                <div className="bed-patient-section">
                  {patient ? (
                    <div className="patient-active-badge">
                      <span className="patient-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </span>
                      <div className="patient-meta">
                        <span className="patient-name">{patient.name}</span>
                        <span className="patient-sub">
                          {patient.gestationalAgeWeeks ? `${patient.gestationalAgeWeeks}w GA` : "NICU Patient"}
                          {patient.birthWeightGrams ? ` · ${patient.birthWeightGrams}g` : ""}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="patient-empty-badge">
                      <span className="patient-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                      </span>
                      <span className="patient-empty-text">
                        {hwStatus === "active" ? "Ready for Admission" : "Bed Unavailable"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Body Content based on Status */}
                {hwStatus === "maintenance" ? (
                  <div className="bed-status-notice-box maintenance-notice">
                    <span className="notice-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                    </span>
                    <div>
                      <strong>Biomedical Maintenance</strong>
                      <p>Undergoing calibration / maintenance. Live monitoring locked.</p>
                    </div>
                  </div>
                ) : hwStatus === "offline" ? (
                  <div className="bed-status-notice-box offline-notice">
                    <span className="notice-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/></svg>
                    </span>
                    <div>
                      <strong>Device Offline</strong>
                      <p>Hardware powered off / disconnected. Telemetry unavailable.</p>
                    </div>
                  </div>
                ) : !patient ? (
                  /* Empty active bed - no phantom vitals, show standby notice */
                  <div className="bed-status-notice-box standby-notice">
                    <span className="notice-icon" style={{ display: "inline-flex", alignItems: "center" }}>
                      <circle cx="12" cy="12" r="6" fill="var(--ok)"/>
                    </span>
                    <div>
                      <strong>Standby - Unoccupied</strong>
                      <p>No infant admitted. Telemetry begins automatically upon patient admission.</p>
                    </div>
                  </div>
                ) : vital ? (
                  <div className="bed-vitals-grid">
                    <div className="vital-mini-box hr-mini">
                      <span className="vital-mini-label">HR</span>
                      <span className="vital-mini-value">{vital.heart_rate ?? "-"} <small>bpm</small></span>
                    </div>
                    <div className="vital-mini-box spo2-mini">
                      <span className="vital-mini-label">SpO2</span>
                      <span className="vital-mini-value">{vital.spo2 ?? "-"} <small>%</small></span>
                    </div>
                    <div className="vital-mini-box temp-mini">
                      <span className="vital-mini-label">TEMP</span>
                      <span className="vital-mini-value">{vital.temperature ?? "-"} <small>°C</small></span>
                    </div>
                  </div>
                ) : (
                  <div className="bed-no-vitals">
                    <span className="mono">Connecting to sensor stream...</span>
                  </div>
                )}

                <div className="bed-card-footer">
                  <span className="protocol-tag">1 Bed = 1 Patient</span>
                  {!status.isOpenable ? (
                    <span className="status-locked-tag">
                      {hwStatus === "maintenance" ? "Locked (Maintenance)" : "Locked (Offline)"}
                    </span>
                  ) : status.isEmpty ? (
                    <span className="view-detail-link" style={{ color: "var(--ok)" }}>Admit Patient &#8594;</span>
                  ) : (
                    <span className="view-detail-link">Inspect Bed &#8594;</span>
                  )}
                </div>
              </div>
            );
          })}
          {filteredIncubators.length === 0 && (
            <div className="panel empty-state">No incubators registered in this NICU yet.</div>
          )}
        </div>
      )}

      {/* Hospital Edit Modal */}
      <EditHospitalModal
        hospital={editingHospital}
        isOpen={Boolean(editingHospital)}
        onClose={() => setEditingHospital(null)}
        onSaved={handleHospitalSaved}
      />
    </div>
  );
}

