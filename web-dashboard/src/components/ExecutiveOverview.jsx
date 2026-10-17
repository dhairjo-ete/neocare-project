import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

import axiosClient from "../api/axiosClient";

import { useAuth } from "../context/AuthContext";

import { useDataSync } from "../hooks/useDataSync";

import CustomSelect from "./ui/CustomSelect";
import InfoTooltip from "./ui/InfoTooltip";
import PatientAdvisoriesTimeline from "./PatientAdvisoriesTimeline";
import EditHospitalModal from "./EditHospitalModal";

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

export default function ExecutiveOverview() {

  const { user } = useAuth();

  const isSystemAdmin = user?.role === "system_admin";
  const isHospitalAdmin = user?.role === "hospital_admin";

  const [hospitals, setHospitals] = useState([]);
  const [editingHospital, setEditingHospital] = useState(null);

  function handleHospitalSaved(updated) {
    setHospitals((prev) =>
      prev.map((h) => (String(h._id) === String(updated._id) ? { ...h, ...updated } : h))
    );
    if (selectedHospital && String(selectedHospital._id) === String(updated._id)) {
      setSelectedHospital((prev) => ({ ...prev, ...updated }));
    }
  }

  const [usersList, setUsersList] = useState([]);

  const [wardsList, setWardsList] = useState([]);

  const [incubatorsList, setIncubatorsList] = useState([]);

  const [activePatients, setActivePatients] = useState([]);

  const [patientsList, setPatientsList] = useState([]);

  const [loading, setLoading] = useState(true);

  // Selected Hospital & Workspace Tab State

  const [selectedHospital, setSelectedHospital] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs = ["telemetry", "wards", "incubators", "doctors", "nurses", "patients", "incharge"];
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    validTabs.includes(requestedTab) ? requestedTab : "telemetry"
  );

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const currentHospId = selectedHospital?._id || searchParams.get("hospitalId");
    const nextParams = {};
    if (newTab !== "telemetry") nextParams.tab = newTab;
    if (currentHospId) nextParams.hospitalId = currentHospId;
    setSearchParams(nextParams);
  };

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const hospId = searchParams.get("hospitalId");
    if (hospId && hospitals.length > 0) {
      const match = hospitals.find((h) => String(h._id) === String(hospId));
      if (match) setSelectedHospital(match);
    }
  }, [searchParams, hospitals]);

  const [hospitalSearch, setHospitalSearch] = useState("");

  const [patientTabSearch, setPatientTabSearch] = useState("");

  // Sub-Form States

  const [showAddHospital, setShowAddHospital] = useState(false);

  const [newHospName, setNewHospName] = useState("");

  const [newHospAddress, setNewHospAddress] = useState("");

  const [newWardName, setNewWardName] = useState("");

  const [newIncName, setNewIncName] = useState("");

  const [newIncWardId, setNewIncWardId] = useState("");

  const [newStaffName, setNewStaffName] = useState("");

  const [newStaffEmail, setNewStaffEmail] = useState("");

  const [newStaffPhone, setNewStaffPhone] = useState("");

  const [newStaffLicenseNo, setNewStaffLicenseNo] = useState("");

  const [newStaffRole, setNewStaffRole] = useState("doctor");

  const [newStaffWardId, setNewStaffWardId] = useState("");

  const [createdStaffCreds, setCreatedStaffCreds] = useState(null);

  const [copiedCreds, setCopiedCreds] = useState(false);

  const [editStaffPassword, setEditStaffPassword] = useState("");

  const [showEditStaffPassword, setShowEditStaffPassword] = useState(false);

  const [msgError, setMsgError] = useState("");

  const [msgSuccess, setMsgSuccess] = useState("");

  // Inline delete confirmation modal  -  shows backend errors directly inside, no window.confirm

  const [deleteModal, setDeleteModal] = useState({ open: false, type: "", id: null, name: "", loading: false, error: "" });

  // List modal state  -  mirrors the Patients page pattern: a compact card

  // opens a searchable modal instead of an always-expanded table.

  const [listModal, setListModal] = useState(null); // "wards" | "incubators-active" | "incubators-inactive" | "doctors" | "nurses" | "patients-active" | "patients-discharged"

  const [modalSearch, setModalSearch] = useState("");

  const [modalDateFilter, setModalDateFilter] = useState("");

  const [modalIncubatorFilter, setModalIncubatorFilter] = useState("");

  const [modalSortOrder, setModalSortOrder] = useState("desc");

  // Detailed patient view (Timeline view) modal inside Executive Overview

  const [inspectingPatient, setInspectingPatient] = useState(null);

  const [inspectingNotes, setInspectingNotes] = useState([]);

  const [inspectingNotesLoading, setInspectingNotesLoading] = useState(false);

  const handleOpenPatientDetail = async (p) => {

    setInspectingPatient(p);

    setInspectingNotesLoading(true);

    try {

      const { data } = await axiosClient.get(`/patients/${p._id}/notes`);

      setInspectingNotes(data);

    } catch {

      setInspectingNotes([]);

    } finally {

      setInspectingNotesLoading(false);

    }

  };

  const handleDeleteInspectingNote = async (noteId) => {
    if (!inspectingPatient) return;
    if (!window.confirm("Are you sure you want to delete this clinical note? This action cannot be undone.")) return;
    try {
      await axiosClient.delete(`/patients/${inspectingPatient._id}/notes/${noteId}`);
      setInspectingNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch (err) {
      console.error("Failed to delete clinical note:", err);
      alert(err?.response?.data?.error || "Could not delete note.");
    }
  };

  function openListModal(type) {

    setListModal(type);

    setModalSearch("");

    setModalDateFilter("");

    setModalIncubatorFilter("");

    setModalSortOrder("desc");

  }

  function closeListModal() {

    setListModal(null);

    setModalSearch("");

    setModalDateFilter("");

    setModalIncubatorFilter("");

    setModalSortOrder("desc");

  }

  const loadAllData = useCallback(async (showSpinner = false) => {

    if (showSpinner) setLoading(true);

    try {

      const [hospRes, usersRes, wardsRes, incRes, activePatientsRes, allPatientsRes] = await Promise.allSettled([

        axiosClient.get("/hospitals"),

        axiosClient.get("/users"),

        axiosClient.get("/wards"),

        axiosClient.get("/incubators"),

        axiosClient.get("/patients?status=active"),

        axiosClient.get("/patients"),

      ]);

      if (hospRes.status === "fulfilled") setHospitals(hospRes.value.data);

      if (usersRes.status === "fulfilled") setUsersList(usersRes.value.data);

      if (wardsRes.status === "fulfilled") setWardsList(wardsRes.value.data);

      if (incRes.status === "fulfilled") setIncubatorsList(incRes.value.data);

      if (activePatientsRes.status === "fulfilled") setActivePatients(activePatientsRes.value.data);

      if (allPatientsRes.status === "fulfilled") setPatientsList(allPatientsRes.value.data);

    } catch (err) {

      console.error("[loadAllData]", err);

    } finally {

      if (showSpinner) setLoading(false);

    }

  }, []);

  useEffect(() => {

    loadAllData(true);

  }, [loadAllData]);

  // Real-time synchronization across connected portals

  useDataSync(

    useCallback(() => {

      loadAllData(false);

    }, [loadAllData])

  );

  // Default selected hospital for Hospital Admin. The backend's GET /hospitals

  // already scopes the response to exactly this admin's own hospital (a

  // single-item array)  -  so for a non-system-admin, hospitals[0] IS their

  // hospital. We deliberately do NOT match by comparing IDs against the

  // locally-cached user.hospitalId: that cached value can drift from the

  // fresh, JWT-verified value the backend used to build the response

  // (e.g. after a hospital reassignment), and an ID mismatch there used to

  // leave selectedHospital stuck at null forever  -  a silent blank page with

  // no error, since neither the hospital-grid view nor the workspace view

  // has a condition that renders in that state.

  useEffect(() => {

    if (!isSystemAdmin && !selectedHospital && hospitals.length > 0) {

      setSelectedHospital(hospitals[0]);

    }

  }, [isSystemAdmin, hospitals, selectedHospital]);

  // Find In-Charge for a specific hospital

  const getHospitalInCharge = (hospId) => {

    return usersList.find(

      (u) =>

        u.role === "hospital_admin" &&

        u.hospitalId &&

        (u.hospitalId._id === hospId || u.hospitalId === hospId)

    );

  };

  // Create New Hospital (System Admin)

  const handleCreateHospital = async (e) => {

    e.preventDefault();

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.post("/hospitals", {

        name: newHospName,

        address: newHospAddress,

      });

      setMsgSuccess(`Hospital "${newHospName}" registered successfully.`);

      setNewHospName("");

      setNewHospAddress("");

      setShowAddHospital(false);

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to register hospital");

    }

  };

  // Add Ward to selected hospital

  const handleCreateWard = async (e) => {

    e.preventDefault();

    if (!selectedHospital) return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.post("/wards", {

        name: newWardName,

        hospitalId: selectedHospital._id,

      });

      setMsgSuccess(`NICU Unit "${newWardName}" added successfully.`);

      setNewWardName("");

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to add NICU");

    }

  };

  // Delete Ward

  const handleDeleteWard = (wardId, wardName) => {

    setDeleteModal({ open: true, type: "ward", id: wardId, name: wardName, loading: false, error: "" });

  };

  // Add Incubator to selected hospital

  const handleCreateIncubator = async (e) => {

    e.preventDefault();

    if (!selectedHospital || !newIncWardId) return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.post("/incubators", {

        name: newIncName,

        wardId: newIncWardId,

      });

      setMsgSuccess(`Incubator "${newIncName}" added to fleet.`);

      setNewIncName("");

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to add Incubator");

    }

  };

  // Delete Incubator

  const handleDeleteIncubator = (id, devId) => {

    setDeleteModal({ open: true, type: "incubator", id, name: devId, loading: false, error: "" });

  };

  // Unified confirm delete  -  called by the modal's confirm button

  const handleConfirmDelete = async () => {

    setDeleteModal((prev) => ({ ...prev, loading: true, error: "" }));

    try {

      if (deleteModal.type === "ward") {

        await axiosClient.delete(`/wards/${deleteModal.id}`);

        setMsgSuccess(`NICU "${deleteModal.name}" deleted.`);

      } else if (deleteModal.type === "incubator") {

        await axiosClient.delete(`/incubators/${deleteModal.id}`);

        setMsgSuccess(`Incubator "${deleteModal.name}" deleted.`);

      } else {
        await axiosClient.delete(`/users/${deleteModal.id}`);
        setMsgSuccess(`Account for "${deleteModal.name}" deleted successfully.`);
      }

      setDeleteModal({ open: false, type: "", id: null, name: "", loading: false, error: "" });

      loadAllData(false);

    } catch (err) {

      // Show backend error message inside the modal  -  not at the top of the page

      const msg = err?.response?.data?.error || `Failed to delete ${deleteModal.type}`;

      setDeleteModal((prev) => ({ ...prev, loading: false, error: msg }));

    }

  };

  // Add Staff (Doctor / Nurse) to selected hospital
  const handleCreateStaff = async (e, roleOverride) => {
    e.preventDefault();
    if (!selectedHospital) return;

    setMsgError("");
    setMsgSuccess("");

    const roleToUse = roleOverride || newStaffRole;
    const licenseTrimmed = newStaffLicenseNo?.trim() || "";

    if (!licenseTrimmed) {
      setMsgError(`${roleToUse === "doctor" ? "BMDC / Medical License" : "Nursing Council"} number is required.`);
      return;
    }

    try {
      const { data } = await axiosClient.post("/auth/register-staff", {
        name: newStaffName,
        email: newStaffEmail,
        password: licenseTrimmed,
        phone: newStaffPhone,
        licenseNumber: licenseTrimmed,
        role: roleToUse,
        hospitalId: selectedHospital._id,
        wardId: newStaffWardId || null,
      });

      const assignedPass = data?.temporaryPassword || licenseTrimmed;
      setCreatedStaffCreds({
        name: newStaffName,
        email: newStaffEmail,
        role: roleToUse,
        password: assignedPass,
        hospitalName: selectedHospital.name,
      });

      setMsgSuccess(
        `${roleToUse === "doctor" ? "Doctor" : "Nurse"} ${newStaffName} registered successfully. Initial password set to license number.`
      );

      setNewStaffName("");
      setNewStaffEmail("");
      setNewStaffPhone("");
      setNewStaffLicenseNo("");
      loadAllData(false);
    } catch (err) {
      setMsgError(err?.response?.data?.error || "Failed to add staff member");
    }
  };

  // Delete Staff (Doctor / Nurse) from selected hospital

  const handleDeleteStaff = (staffId, staffName, role = "doctor") => {
    setDeleteModal({ open: true, type: role, id: staffId, name: staffName, loading: false, error: "" });
  };

  // Delete entire hospital (System Admin governance action)

  const handleDeleteHospital = async (hospId, hospName) => {

    if (

      !window.confirm(

        `PERMANENT REMOVAL: Are you sure you want to remove hospital "${hospName}" from the platform? This action will disassociate hospital access.`

      )

    )

      return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.delete(`/hospitals/${hospId}`);

      setMsgSuccess(`Hospital "${hospName}" removed successfully.`);

      setSelectedHospital(null);

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to remove hospital");

    }

  };

  // Review request states & handlers for System Admin

  const [reviewModal, setReviewModal] = useState(null); // { entityType, entityId, entityName }

  const [reviewTitle, setReviewTitle] = useState("");

  const [reviewMessage, setReviewMessage] = useState("");

  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [reviewSuccessModal, setReviewSuccessModal] = useState(null);

  const openReviewModal = (entityType, entityId, entityName) => {

    setReviewModal({ entityType, entityId, entityName });

    setReviewTitle(`Review Request: ${entityName}`);

    setReviewMessage(`Please review and update the details for ${entityType} "${entityName}".`);

  };

  const closeReviewModal = () => {

    setReviewModal(null);

    setReviewTitle("");

    setReviewMessage("");

  };

  const handleSendReviewRequest = async (e) => {

    e.preventDefault();

    if (!selectedHospital || !reviewModal) return;

    setReviewSubmitting(true);

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.post("/notifications/review-request", {

        hospitalId: selectedHospital._id,

        reviewEntity: reviewModal.entityType,

        reviewEntityId: reviewModal.entityId,

        title: reviewTitle.trim(),

        message: reviewMessage.trim(),

      });

      setReviewSuccessModal({

        entityName: reviewModal.entityName,

        hospitalName: selectedHospital.name,

        title: reviewTitle.trim(),

      });

      closeReviewModal();

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to send review request");

    } finally {

      setReviewSubmitting(false);

    }

  };

  // Edit Entity States & Handlers for Hospital In-Charge

  const [editingWard, setEditingWard] = useState(null);

  const [editWardName, setEditWardName] = useState("");

  const [editWardStatus, setEditWardStatus] = useState("online");

  const [editingIncubator, setEditingIncubator] = useState(null);

  const [editIncName, setEditIncName] = useState("");

  const [editIncWardId, setEditIncWardId] = useState("");

  const [editIncStatus, setEditIncStatus] = useState("active");

  const [editingStaff, setEditingStaff] = useState(null);

  const [editStaffName, setEditStaffName] = useState("");

  const [editStaffEmail, setEditStaffEmail] = useState("");

  const [editStaffPhone, setEditStaffPhone] = useState("");

  const [editStaffLicenseNo, setEditStaffLicenseNo] = useState("");

  const [editStaffWardId, setEditStaffWardId] = useState("");

  const [editingPatient, setEditingPatient] = useState(null);

  const [editPatName, setEditPatName] = useState("");

  const [editPatGestation, setEditPatGestation] = useState("");

  const [editPatWeight, setEditPatWeight] = useState("");

  const [editPatSyndrome, setEditPatSyndrome] = useState("");

  const [editPatGuardianName, setEditPatGuardianName] = useState("");

  const [editPatGuardianPhone, setEditPatGuardianPhone] = useState("");

  const [editPatIncubatorId, setEditPatIncubatorId] = useState("");

  const startEditWard = (w) => {

    setEditingWard(w);

    setEditWardName(w.name || "");

    setEditWardStatus(w.status || "online");

  };

  const handleUpdateWard = async (e) => {

    e.preventDefault();

    if (!editingWard) return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.put(`/wards/${editingWard._id}`, {

        name: editWardName.trim(),

        status: editWardStatus,

      });

      setMsgSuccess(`NICU Unit "${editWardName}" updated successfully.`);

      setEditingWard(null);

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to update NICU Unit");

    }

  };

  const startEditIncubator = (inc) => {

    setEditingIncubator(inc);

    setEditIncName(inc.label || inc.deviceTopicId || "");

    setEditIncWardId(inc.wardId?._id || inc.wardId || "");

    setEditIncStatus(inc.status || "active");

  };

  const handleUpdateIncubator = async (e) => {

    e.preventDefault();

    if (!editingIncubator) return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.put(`/incubators/${editingIncubator._id}`, {

        name: editIncName.trim(),

        wardId: editIncWardId || null,

        status: editIncStatus,

      });

      setMsgSuccess(`Incubator "${editIncName}" updated successfully.`);

      setEditingIncubator(null);

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to update Incubator");

    }

  };

  const startEditStaff = (u) => {
    setEditingStaff(u);
    setEditStaffName(u.name || "");
    setEditStaffEmail(u.email || "");
    setEditStaffPhone(u.phone || "");
    setEditStaffLicenseNo(u.licenseNumber || "");
    setEditStaffWardId(u.wardId?._id || u.wardId || "");
    setEditStaffPassword("");
    setShowEditStaffPassword(false);
  };

  const handleUpdateStaff = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    setMsgError("");
    setMsgSuccess("");

    if (editStaffPassword && editStaffPassword.trim().length > 0 && editStaffPassword.trim().length < 6) {
      setMsgError("New password must be at least 6 characters long.");
      return;
    }

    try {
      const payload = {
        name: editStaffName.trim(),
        email: editStaffEmail.trim(),
        phone: editStaffPhone.trim(),
        licenseNumber: editStaffLicenseNo.trim(),
        wardId: editStaffWardId || null,
      };
      if (editStaffPassword && editStaffPassword.trim().length >= 6) {
        payload.password = editStaffPassword.trim();
      }
      await axiosClient.put(`/users/${editingStaff._id}`, payload);
      setMsgSuccess(`Staff member "${editStaffName}" updated successfully.${editStaffPassword.trim() ? " Password was updated." : ""}`);
      setEditingStaff(null);
      setEditStaffPassword("");
      loadAllData(false);
    } catch (err) {
      setMsgError(err?.response?.data?.error || "Failed to update staff member");
    }
  };

  const startEditPatient = (p) => {

    setEditingPatient(p);

    setEditPatName(p.name || "");

    setEditPatGestation(p.gestationalAgeWeeks || "");

    setEditPatWeight(p.birthWeightGrams || "");

    setEditPatSyndrome(p.primarySyndrome || "");

    setEditPatGuardianName(p.guardianName || "");

    setEditPatGuardianPhone(p.guardianPhone || "");

    setEditPatIncubatorId(p.incubatorId?._id || p.incubatorId || "");

  };

  const handleUpdatePatient = async (e) => {

    e.preventDefault();

    if (!editingPatient) return;

    setMsgError("");

    setMsgSuccess("");

    try {

      await axiosClient.put(`/patients/${editingPatient._id}`, {

        name: editPatName.trim(),

        gestationalAgeWeeks: editPatGestation ? Number(editPatGestation) : undefined,

        birthWeightGrams: editPatWeight ? Number(editPatWeight) : undefined,

        primarySyndrome: editPatSyndrome.trim(),

        guardianName: editPatGuardianName.trim(),

        guardianPhone: editPatGuardianPhone.trim(),

        incubatorId: editPatIncubatorId || undefined,

      });

      setMsgSuccess(`Patient record "${editPatName}" updated successfully.`);

      setEditingPatient(null);

      loadAllData(false);

    } catch (err) {

      setMsgError(err?.response?.data?.error || "Failed to update patient record");

    }

  };

  if (loading) {

    return (

      <div className="waiting-card">

        <div className="spinner"></div>

        <p className="waiting-msg">Loading Executive Command Dashboard...</p>

      </div>

    );

  }

  // Filter lists by selected hospital

  const hospitalWards = selectedHospital

    ? wardsList.filter(

        (w) =>

          w.hospitalId &&

          (w.hospitalId._id === selectedHospital._id ||

            w.hospitalId === selectedHospital._id)

      )

    : [];

  const hospitalIncubators = selectedHospital

    ? incubatorsList.filter(

        (inc) =>

          inc.hospitalId &&

          (inc.hospitalId._id === selectedHospital._id ||

            inc.hospitalId === selectedHospital._id)

      )

    : [];

  const hospitalDoctors = selectedHospital

    ? usersList.filter(

        (u) =>

          u.role === "doctor" &&

          u.hospitalId &&

          (u.hospitalId._id === selectedHospital._id ||

            u.hospitalId === selectedHospital._id)

      )

    : [];

  const hospitalNurses = selectedHospital

    ? usersList.filter(

        (u) =>

          u.role === "nurse" &&

          u.hospitalId &&

          (u.hospitalId._id === selectedHospital._id ||

            u.hospitalId === selectedHospital._id)

      )

    : [];

  const currentInCharge = selectedHospital

    ? getHospitalInCharge(selectedHospital._id)

    : null;

  // Which incubators currently have an active (not-yet-discharged) patient  - 

  // used to compute real occupancy instead of relying on fields that don't

  // exist on the Incubator model.

  const occupiedIncubatorIds = new Set(

    activePatients.map((p) => String(p.incubatorId?._id || p.incubatorId))

  );

  // Hospital-scoped patients (active + discharged)

  const hospitalAllPatients = selectedHospital

    ? patientsList.filter((p) => {

        const pHospId = String(p.hospitalId?._id || p.hospitalId || p.incubatorId?.hospitalId?._id || p.incubatorId?.hospitalId || "");

        if (pHospId && pHospId === String(selectedHospital._id)) return true;

        const incId = String(p.incubatorId?._id || p.incubatorId);

        return hospitalIncubators.some((hi) => String(hi._id) === incId);

      })

    : [];

  const hospitalActivePatients = hospitalAllPatients.filter((p) => !p.dischargedAt);

  const hospitalDischargedPatients = hospitalAllPatients.filter(

    (p) => Boolean(p.dischargedAt)

  );

  // Hospital search filter for the grid view

  const filteredHospitals = hospitalSearch.trim()

    ? hospitals.filter((h) =>

        (h.name || "").toLowerCase().includes(hospitalSearch.trim().toLowerCase()) ||

        (h.address || "").toLowerCase().includes(hospitalSearch.trim().toLowerCase())

      )

    : hospitals;

  return (

    <div className="executive-overview-container">

      {/* Executive Header */}

      <div className="executive-header">

        <div>

          <h1 className="page-title">Cross-Hospital Executive Overview</h1>

          <p className="page-subtitle">

            Centralized management hub for registered hospitals, NICU units, incubator fleets, doctors, nurses, and hospital in-charges.

          </p>

        </div>

        <div className="executive-timestamp">

          Live Sync "¢ {new Date().toLocaleTimeString()}

        </div>

      </div>

      {/* Alert / Notification Feedback Banner */}

      {msgError && <div className="error-text" style={{ marginBottom: 14 }}>{msgError}</div>}

      {msgSuccess && <div className="success-text" style={{ marginBottom: 14 }}>{msgSuccess}</div>}

      {/* Safety net: a hospital_admin with no resolvable hospital record should

          see a clear message, never a silent blank page. */}

      {!isSystemAdmin && !loading && !selectedHospital && hospitals.length === 0 && (

        <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>

          <h3 style={{ marginBottom: 8 }}>No hospital record found</h3>

          <p className="page-subtitle" style={{ margin: 0 }}>

            Your account isn't linked to a hospital yet. If this seems wrong, contact the System Admin.

          </p>

        </div>

      )}

      {/* =========================================================================

          VIEW 1: REGISTERED HOSPITALS LIST (Default view for System Admin)

         ========================================================================= */}

      {!selectedHospital && isSystemAdmin && (

        <div className="registered-hospitals-section">

          <div className="section-header-bar">

            <div>

              <h2 className="section-title">Registered Medical Institutions ({hospitals.length})</h2>

            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>

              <div style={{ position: "relative", minWidth: 220 }}>

                <input

                  type="text"

                  className="input-text"

                  style={{ height: 34, paddingLeft: 30, fontSize: 13 }}

                  placeholder="Search hospitals..."

                  value={hospitalSearch}

                  onChange={(e) => setHospitalSearch(e.target.value)}

                />

                <svg

                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"

                  style={{ position: "absolute", left: 10, top: 10, color: "var(--text-tertiary)" }}

                >

                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />

                </svg>

                {hospitalSearch && (

                  <button type="button" style={{ position: "absolute", right: 8, top: 6, background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 16, cursor: "pointer" }} onClick={() => setHospitalSearch("")}>&times;</button>

                )}

              </div>

              <button

                type="button"

                className="btn-small"

                onClick={() => setShowAddHospital(!showAddHospital)}

              >

                {showAddHospital ? "Cancel" : "+ Register New Hospital"}

              </button>

            </div>

          </div>

          {/* Add Hospital Form Modal / Box */}

          {showAddHospital && (

            <div className="panel form-panel" style={{ marginBottom: 20 }}>

              <h3 className="panel-title">Register New Medical Institution</h3>

              <form onSubmit={handleCreateHospital} className="inline-form">

                <div className="field">

                  <label>Hospital Full Name *</label>

                  <input

                    type="text"

                    className="input-text"

                    placeholder="e.g. City Central Medical Center"

                    value={newHospName}

                    onChange={(e) => setNewHospName(e.target.value)}

                    required

                  />

                </div>

                <div className="field">

                  <label>Physical Address / Location</label>

                  <input

                    type="text"

                    className="input-text"

                    placeholder="e.g. 100 Health Ave, Sector 4"

                    value={newHospAddress}

                    onChange={(e) => setNewHospAddress(e.target.value)}

                  />

                </div>

                <button type="submit" className="btn-small">

                  Register Hospital

                </button>

              </form>

            </div>

          )}

          {/* Hospital Cards Grid */}

          <div className="hospitals-grid">

            {filteredHospitals.map((hosp) => {

              const hospWardsCount = wardsList.filter(

                (w) => w.hospitalId && (w.hospitalId._id === hosp._id || w.hospitalId === hosp._id)

              ).length;

              const hospIncCount = incubatorsList.filter(

                (inc) => inc.hospitalId && (inc.hospitalId._id === hosp._id || inc.hospitalId === hosp._id)

              ).length;

              const hospDocCount = usersList.filter(

                (u) => u.role === "doctor" && u.hospitalId && (u.hospitalId._id === hosp._id || u.hospitalId === hosp._id)

              ).length;

              const hospNurseCount = usersList.filter(

                (u) => u.role === "nurse" && u.hospitalId && (u.hospitalId._id === hosp._id || u.hospitalId === hosp._id)

              ).length;

              const hospActivePatientCount = patientsList.filter(

                (p) => {

                  const pid = p.hospitalId?._id || p.hospitalId;

                  return String(pid) === String(hosp._id) && !p.dischargedAt;

                }

              ).length;

              return (

                <div key={hosp._id} className="hospital-card">

                  <div className="hospital-card-header">

                    <div className="hospital-emblem-badge">

                      {(hosp.name || "H").charAt(0).toUpperCase()}

                    </div>

                    <div>

                      <h3 className="hospital-name">{hosp.name}</h3>

                      <div className="hospital-address">{hosp.address || "Address Not Specified"}</div>

                    </div>

                  </div>

                  {/* Quick Metrics Bar */}

                  <div className="hospital-card-stats-row">

                    <div className="hosp-stat-pill">

                      <span className="hosp-stat-num">{hospWardsCount}</span>

                      <span className="hosp-stat-label">NICUs</span>

                    </div>

                    <div className="hosp-stat-pill">

                      <span className="hosp-stat-num">{hospIncCount}</span>

                      <span className="hosp-stat-label">Incubators</span>

                    </div>

                    <div className="hosp-stat-pill">

                      <span className="hosp-stat-num">{hospDocCount}</span>

                      <span className="hosp-stat-label">Doctors</span>

                    </div>

                    <div className="hosp-stat-pill">

                      <span className="hosp-stat-num">{hospNurseCount}</span>

                      <span className="hosp-stat-label">Nurses</span>

                    </div>

                    <div className="hosp-stat-pill" style={{ borderColor: "rgba(var(--brand-rgb, 190,24,93), 0.25)", background: "rgba(var(--brand-rgb, 190,24,93), 0.05)" }}>

                      <span className="hosp-stat-num" style={{ color: "var(--brand)" }}>{hospActivePatientCount}</span>

                      <span className="hosp-stat-label" style={{ color: "var(--brand)" }}>Patients</span>

                    </div>

                  </div>

                  {/* Open Workspace & Governance Actions */}

                  <div className="hospital-card-footer" style={{ display: "flex", gap: 10, alignItems: "stretch", marginTop: 14 }}>

                    <button

                      type="button"

                      className="btn-manage-workspace"

                      style={{

                        flex: 1,

                        height: 42,

                        minHeight: 42,

                        display: "inline-flex",

                        alignItems: "center",

                        justifyContent: "center",

                        lineHeight: 1.2,

                        padding: "0 14px",

                        fontWeight: 600,

                        fontSize: "13px",

                        margin: 0,

                      }}

                      onClick={() => {

                        setSelectedHospital(hosp);

                        setActiveTab("telemetry");

                      }}

                    >

                      Manage Hospital Workspace

                    </button>

                    {isSystemAdmin && (

                      <button

                        type="button"

                        className="btn-reject"

                        style={{

                          height: 42,

                          minHeight: 42,

                          display: "inline-flex",

                          alignItems: "center",

                          justifyContent: "center",

                          lineHeight: 1.2,

                          padding: "0 14px",

                          fontWeight: 600,

                          fontSize: "13px",

                          whiteSpace: "nowrap",

                          margin: 0,

                        }}

                        onClick={() => handleDeleteHospital(hosp._id, hosp.name)}

                        title="De-register entire medical institution"

                      >

                        Remove Hospital

                      </button>

                    )}

                  </div>

                </div>

              );

            })}

            {filteredHospitals.length === 0 && (

              <div className="empty-state panel" style={{ width: "100%", gridColumn: "1 / -1" }}>

                {hospitalSearch

                  ? `No hospitals matching "${hospitalSearch}".`

                  : "No registered hospitals found. Click \"+ Register New Hospital\" to get started."}

              </div>

            )}

          </div>

        </div>

      )}

      {/* =========================================================================

          VIEW 2: HOSPITAL WORKSPACE DETAIL VIEW (Inside Selected Hospital)

         ========================================================================= */}

      {selectedHospital && (

        <div className="hospital-workspace-container">

          {/* Top Breadcrumb & Hospital Info Header */}

          <div className="workspace-header-card">

            {isSystemAdmin && (

              <button

                type="button"

                className="btn-back-hospitals"

                onClick={() => setSelectedHospital(null)}

              >

                Back to Registered Hospitals

              </button>

            )}

            <div className="workspace-title-row">

              <div className="workspace-emblem">

                {(selectedHospital.name || "H").charAt(0).toUpperCase()}

              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 className="workspace-hospital-name" style={{ margin: 0 }}>{selectedHospital.name}</h2>
                  {(isSystemAdmin || (isHospitalAdmin && String(user?.hospitalId?._id || user?.hospitalId) === String(selectedHospital._id))) && (
                    <button
                      type="button"
                      className="btn-hosp-edit-icon"
                      onClick={() => setEditingHospital(selectedHospital)}
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

                <div className="workspace-hospital-meta" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <span>{selectedHospital.address || "Main Hospital Center"} • ID: {selectedHospital._id}</span>
                  {(isSystemAdmin || (isHospitalAdmin && String(user?.hospitalId?._id || user?.hospitalId) === String(selectedHospital._id))) && (
                    <button
                      type="button"
                      className="btn-hosp-edit-subtle"
                      onClick={() => setEditingHospital(selectedHospital)}
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

            </div>

          </div>

          {/* Sub-Tab Switcher Navigation */}

          <div className="workspace-tabs-bar">

            <button
              type="button"
              className={`workspace-tab ${activeTab === "telemetry" ? "active" : ""}`}
              onClick={() => handleTabChange("telemetry")}
            >
              Telemetry & Capacity
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "wards" ? "active" : ""}`}
              onClick={() => handleTabChange("wards")}
            >
              NICU Units ({hospitalWards.length})
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "incubators" ? "active" : ""}`}
              onClick={() => handleTabChange("incubators")}
            >
              Incubator Fleet ({hospitalIncubators.length})
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "doctors" ? "active" : ""}`}
              onClick={() => handleTabChange("doctors")}
            >
              Doctors ({hospitalDoctors.length})
            </button>
            <button
              type="button"
              className={`workspace-tab ${activeTab === "nurses" ? "active" : ""}`}
              onClick={() => handleTabChange("nurses")}
            >
              Nurses ({hospitalNurses.length})
            </button>
            {isSystemAdmin && (
              <button
                type="button"
                className={`workspace-tab ${activeTab === "patients" ? "active" : ""}`}
                onClick={() => handleTabChange("patients")}
              >
                Patients ({hospitalActivePatients.length})
              </button>
            )}
            {isSystemAdmin && (
              <button
                type="button"
                className={`workspace-tab ${activeTab === "incharge" ? "active" : ""}`}
                onClick={() => handleTabChange("incharge")}
              >
                Hospital In-Charge
              </button>
            )}

          </div>

          {/* TAB 1: TELEMETRY & CAPACITY OVERVIEW */}

          {activeTab === "telemetry" && (

            <div className="workspace-tab-content">

              <div className="panel">

                <h3 className="section-title">Hardware Telemetry & Status</h3>

                <div className="hardware-status-grid">

                  <div className="hardware-status-box status-active-box">

                    <div className="hardware-status-number">

                      {hospitalIncubators.filter((i) => i.status === "active").length}

                    </div>

                    <div className="hardware-status-title">Active Transmitting</div>

                  </div>

                  <div className="hardware-status-box status-maint-box">

                    <div className="hardware-status-number">

                      {hospitalIncubators.filter((i) => i.status === "maintenance").length}

                    </div>

                    <div className="hardware-status-title">Maintenance</div>

                  </div>

                  <div className="hardware-status-box status-offline-box">

                    <div className="hardware-status-number">

                      {hospitalIncubators.filter((i) => i.status === "offline").length}

                    </div>

                    <div className="hardware-status-title">Offline / Standby</div>

                  </div>

                </div>

              </div>

              <div className="panel" style={{ marginTop: 20 }}>

                <h3 className="section-title">NICU Wards Occupancy Breakdown</h3>

                <table className="data-table">

                  <thead>

                    <tr>

                      <th style={{ textAlign: "left" }}>NICU Unit</th>

                      <th style={{ textAlign: "center" }}>Total Incubators</th>

                      <th style={{ textAlign: "center" }}>Occupied Beds</th>

                      <th style={{ textAlign: "center" }}>Occupancy Rate</th>

                    </tr>

                  </thead>

                  <tbody>

                    {hospitalWards.map((w) => {

                      const wardIncs = hospitalIncubators.filter(

                        (i) => i.wardId && (i.wardId._id === w._id || i.wardId === w._id)

                      );

                      const occupiedCount = wardIncs.filter((i) => occupiedIncubatorIds.has(String(i._id))).length;

                      const rate = wardIncs.length > 0 ? Math.round((occupiedCount / wardIncs.length) * 100) : 0;

                      return (

                        <tr key={w._id}>

                          <td style={{ textAlign: "left" }}><strong>{w.name}</strong></td>

                          <td className="mono" style={{ textAlign: "center" }}>{wardIncs.length}</td>

                          <td className="mono" style={{ textAlign: "center", color: "var(--brand-light)", fontWeight: 600 }}>{occupiedCount}</td>

                          <td style={{ textAlign: "center" }}>

                            <div className="occupancy-progress-bar">

                              <div

                                className="occupancy-fill"

                                style={{

                                  width: `${rate}%`,

                                  backgroundColor: rate > 85 ? "var(--critical)" : "var(--brand)",

                                }}

                              ></div>

                              <span className="occupancy-label">{rate}%</span>

                            </div>

                          </td>

                        </tr>

                      );

                    })}

                    {hospitalWards.length === 0 && (

                      <tr><td colSpan={4} className="empty-state">No NICU units registered for this hospital.</td></tr>

                    )}

                  </tbody>

                </table>

              </div>

            </div>

          )}

          {/* TAB 2: NICU UNITS */}

          {activeTab === "wards" && (

            <div className="workspace-tab-content">

              {!isSystemAdmin && (

                <div className="panel form-panel" style={{ marginBottom: 20 }}>

                  <h3 className="panel-title">Add NICU Unit</h3>

                  <form onSubmit={handleCreateWard} className="inline-form">

                    <div className="field">

                      <label>NICU Unit Name *</label>

                      <input

                        type="text"

                        className="input-text"

                        placeholder="e.g. NICU Unit A (Level 3)"

                        value={newWardName}

                        onChange={(e) => setNewWardName(e.target.value)}

                        required

                      />

                    </div>

                    <button type="submit" className="btn-small">+ Add NICU</button>

                  </form>

                </div>

              )}

              <div className="patient-status-actions">

                <button className="status-action-card" onClick={() => openListModal("wards")}>

                  <div className="status-action-label">NICU Units</div>

                  <div className="status-action-count">{hospitalWards.length}</div>

                  <div className="status-action-hint">View list &amp; search ↑</div>

                </button>

              </div>

            </div>

          )}

          {/* TAB 3: INCUBATORS FLEET */}

          {activeTab === "incubators" && (

            <div className="workspace-tab-content">

              {!isSystemAdmin && (

                <div className="panel form-panel" style={{ marginBottom: 20 }}>

                  <h3 className="panel-title">Add Incubator</h3>

                  <form onSubmit={handleCreateIncubator} className="inline-form">

                    <div className="field">

                      <label>Incubator Name *</label>

                      <input

                        type="text"

                        className="input-text"

                        placeholder="e.g. Bay 3 - South"

                        value={newIncName}

                        onChange={(e) => setNewIncName(e.target.value)}

                        required

                      />

                    </div>

                    <div className="field">

                      <label>Assign NICU Unit *</label>

                      <CustomSelect

                        value={newIncWardId}

                        onChange={(e) => setNewIncWardId(e.target.value)}

                        placeholder="Select NICU..."

                      >

                        <option value="">Select NICU...</option>

                        {hospitalWards.map((w) => (

                          <option key={w._id} value={w._id}>{w.name}</option>

                        ))}

                      </CustomSelect>

                    </div>

                    <button type="submit" className="btn-small">+ Add Incubator</button>

                  </form>

                </div>

              )}

              <div className="patient-status-actions">

                <button className="status-action-card" onClick={() => openListModal("incubators-active")}>

                  <div className="status-action-label">Active Incubators</div>

                  <div className="status-action-count">{hospitalIncubators.filter((i) => i.status === "active").length}</div>

                  <div className="status-action-hint">View list &amp; search ↑</div>

                </button>

                <button className="status-action-card" onClick={() => openListModal("incubators-inactive")}>

                  <div className="status-action-label">Maintenance / Offline</div>

                  <div className="status-action-count">{hospitalIncubators.filter((i) => i.status !== "active").length}</div>

                  <div className="status-action-hint">View list &amp; search ↑</div>

                </button>

              </div>

            </div>

          )}

          {/* TAB 4: DOCTORS */}
          {activeTab === "doctors" && (
            <div className="workspace-tab-content">
              {createdStaffCreds && createdStaffCreds.role === "doctor" && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: "16px 20px",
                    borderRadius: 8,
                    border: "1px solid var(--border-accent, #0284c7)",
                    background: "var(--bg-accent-subtle, rgba(2, 132, 199, 0.08))",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.95rem", color: "var(--primary-color, #0284c7)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>Doctor Account Created — Login Credentials</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatedStaffCreds(null)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #94a3b8)", fontSize: "1.2rem", lineHeight: 1 }}
                      title="Dismiss"
                    >
                      &times;
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: "0.85rem" }}>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Doctor Name:</span> <strong>{createdStaffCreds.name}</strong></div>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Portal Email:</span> <strong>{createdStaffCreds.email}</strong></div>
                    <div>
                      <span style={{ color: "var(--text-muted, #94a3b8)" }}>Initial Password:</span>{" "}
                      <code style={{ background: "var(--bg-subtle, rgba(0,0,0,0.12))", padding: "2px 6px", borderRadius: 4, fontWeight: 700, letterSpacing: 0.5 }}>{createdStaffCreds.password}</code>
                      <span style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted, #94a3b8)", marginTop: 2 }}>Medical License No.</span>
                    </div>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Portal Access:</span> <strong>Doctor / Nurse Login (/login)</strong></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>
                      First login uses the Medical License No. The doctor will be prompted to set a permanent password upon sign-in.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `NeoCare NICU Management System\nPortal: Doctor / Nurse Login (/login)\nRole: Attending Doctor\nName: ${createdStaffCreds.name}\nEmail: ${createdStaffCreds.email}\nInitial Password (License No): ${createdStaffCreds.password}\nNote: You will be prompted to set your personal permanent password upon your first sign-in.\nHospital: ${createdStaffCreds.hospitalName || ''}`
                        );
                        setCopiedCreds(true);
                        setTimeout(() => setCopiedCreds(false), 2500);
                      }}
                      className="btn-small-outline"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: "0.8rem" }}
                    >
                      {copiedCreds ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>Credentials Copied</span>
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          <span>Copy Credentials</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {!isSystemAdmin && (
                <div className="panel form-panel" style={{ marginBottom: 20 }}>
                  <h3 className="panel-title">Register Doctor for {selectedHospital.name}</h3>
                  <form onSubmit={(e) => handleCreateStaff(e, "doctor")} className="inline-form">
                    <div className="field">
                      <label>Doctor Name *</label>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="Dr. Full Name"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        className="input-text"
                        placeholder="doctor@hospital.com"
                        value={newStaffEmail}
                        onChange={(e) => setNewStaffEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>
                        Contact Phone *
                        <InfoTooltip text="Active WhatsApp number required for receiving attending clinical advisories and emergency alerts." />
                      </label>
                      <input
                        type="tel"
                        className="input-text"
                        placeholder="+8801XXXXXXXXX"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>BMDC / Medical License No. *</label>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="e.g. A-12345"
                        value={newStaffLicenseNo}
                        onChange={(e) => setNewStaffLicenseNo(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-small">+ Register Doctor</button>
                  </form>
                </div>
              )}

              <div className="patient-status-actions">

                <button className="status-action-card" onClick={() => openListModal("doctors")}>

                  <div className="status-action-label">Doctors</div>

                  <div className="status-action-count">{hospitalDoctors.length}</div>

                  <div className="status-action-hint">View list &amp; search ↑</div>

                </button>

              </div>

            </div>

          )}

          {/* TAB 5: NURSES */}
          {activeTab === "nurses" && (
            <div className="workspace-tab-content">
              {createdStaffCreds && createdStaffCreds.role === "nurse" && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: "16px 20px",
                    borderRadius: 8,
                    border: "1px solid var(--border-accent, #0284c7)",
                    background: "var(--bg-accent-subtle, rgba(2, 132, 199, 0.08))",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.95rem", color: "var(--primary-color, #0284c7)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>Nurse Account Created — Login Credentials</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatedStaffCreds(null)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #94a3b8)", fontSize: "1.2rem", lineHeight: 1 }}
                      title="Dismiss"
                    >
                      &times;
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: "0.85rem" }}>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Nurse Name:</span> <strong>{createdStaffCreds.name}</strong></div>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Portal Email:</span> <strong>{createdStaffCreds.email}</strong></div>
                    <div>
                      <span style={{ color: "var(--text-muted, #94a3b8)" }}>Initial Password:</span>{" "}
                      <code style={{ background: "var(--bg-subtle, rgba(0,0,0,0.12))", padding: "2px 6px", borderRadius: 4, fontWeight: 700, letterSpacing: 0.5 }}>{createdStaffCreds.password}</code>
                      <span style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted, #94a3b8)", marginTop: 2 }}>Nursing License No.</span>
                    </div>
                    <div><span style={{ color: "var(--text-muted, #94a3b8)" }}>Portal Access:</span> <strong>Doctor / Nurse Login (/login)</strong></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>
                      First login uses the Nursing License No. The nurse will be prompted to set a permanent password upon sign-in.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `NeoCare NICU Management System\nPortal: Doctor / Nurse Login (/login)\nRole: Bedside Nurse\nName: ${createdStaffCreds.name}\nEmail: ${createdStaffCreds.email}\nInitial Password (License No): ${createdStaffCreds.password}\nNote: You will be prompted to set your personal permanent password upon your first sign-in.\nHospital: ${createdStaffCreds.hospitalName || ''}`
                        );
                        setCopiedCreds(true);
                        setTimeout(() => setCopiedCreds(false), 2500);
                      }}
                      className="btn-small-outline"
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: "0.8rem" }}
                    >
                      {copiedCreds ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>Credentials Copied</span>
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          <span>Copy Credentials</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {!isSystemAdmin && (
                <div className="panel form-panel" style={{ marginBottom: 20 }}>
                  <h3 className="panel-title">Register Nurse for {selectedHospital.name}</h3>
                  <form onSubmit={(e) => handleCreateStaff(e, "nurse")} className="inline-form">
                    <div className="field">
                      <label>Nurse Name *</label>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="Nurse Full Name"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        className="input-text"
                        placeholder="nurse@hospital.com"
                        value={newStaffEmail}
                        onChange={(e) => setNewStaffEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>
                        Contact Phone *
                        <InfoTooltip text="Active WhatsApp number required for receiving bedside nursing alerts and shift advisories." />
                      </label>
                      <input
                        type="tel"
                        className="input-text"
                        placeholder="+8801XXXXXXXXX"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="field">
                      <label>Nursing Council / License No. *</label>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="e.g. N-67890"
                        value={newStaffLicenseNo}
                        onChange={(e) => setNewStaffLicenseNo(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-small">+ Register Nurse</button>
                  </form>
                </div>
              )}

              <div className="patient-status-actions">

                <button className="status-action-card" onClick={() => openListModal("nurses")}>

                  <div className="status-action-label">Nurses</div>

                  <div className="status-action-count">{hospitalNurses.length}</div>

                  <div className="status-action-hint">View list &amp; search ↑</div>

                </button>

              </div>

            </div>

          )}

          {/* TAB: PATIENTS OVERVIEW (System Admin Only) */}

          {activeTab === "patients" && isSystemAdmin && (

            <div className="workspace-tab-content">

              <div className="patient-status-actions">

                <button

                  className="status-action-card active-card"

                  onClick={() => openListModal("patients-active")}

                >

                  <div className="status-action-label">Active Patients</div>

                  <div className="status-action-count">{hospitalActivePatients.length}</div>

                  <div className="status-action-hint">View active patient list ↑</div>

                </button>

                <button

                  className="status-action-card discharged-card"

                  onClick={() => openListModal("patients-discharged")}

                >

                  <div className="status-action-label">Discharged Patients</div>

                  <div className="status-action-count">{hospitalDischargedPatients.length}</div>

                  <div className="status-action-hint">View discharged records ↑</div>

                </button>

              </div>

            </div>

          )}

          {/* TAB 6: HOSPITAL IN-CHARGE DETAILS (For System Admin) */}

          {activeTab === "incharge" && isSystemAdmin && (

            <div className="workspace-tab-content">

              <div className="panel">

                <h3 className="panel-title" style={{ marginBottom: 16 }}>Hospital In-Charge Credentials & Contact Details</h3>

                {currentInCharge ? (

                  <div className="incharge-full-detail-card">

                    <div className="incharge-avatar">{(currentInCharge.name || "A").charAt(0).toUpperCase()}</div>

                    <div className="incharge-detail-body">

                      <h3 className="incharge-name-title">{currentInCharge.name}</h3>

                      <div className="incharge-role-subtitle">Hospital Administrator / In-Charge</div>

                      <div className="incharge-info-grid" style={{ marginTop: 14 }}>

                        <div className="info-item">

                          <span className="item-label">Email Address:</span>

                          <span className="item-value">{currentInCharge.email}</span>

                        </div>

                        <div className="info-item">

                          <span className="item-label">Contact Number:</span>

                          <span className="item-value">{currentInCharge.phone || "Not Provided"}</span>

                        </div>

                        <div className="info-item">

                          <span className="item-label">Hospital Assignment:</span>

                          <span className="item-value">{selectedHospital.name}</span>

                        </div>

                        <div className="info-item">

                          <span className="item-label">Account Verification:</span>

                          <span className="item-value">

                            {currentInCharge.isEmailVerified ? "Email Verified" : "Unverified"}

                          </span>

                        </div>

                        <div className="info-item">

                          <span className="item-label">System Approval:</span>

                          <span className="item-value">

                            {currentInCharge.isApproved ? "Approved & Active" : "Pending Admin Approval"}

                          </span>

                        </div>

                        <div className="info-item">

                          <span className="item-label">Registered Date:</span>

                          <span className="item-value">{new Date(currentInCharge.createdAt).toLocaleDateString()}</span>

                        </div>

                      </div>

                    </div>

                  </div>

                ) : (

                  <div className="empty-state">

                    No Hospital In-Charge account assigned to {selectedHospital.name} yet. Users registering as Hospital Admin for this hospital will appear here upon approval.

                  </div>

                )}

              </div>

            </div>

          )}

          {/* =========== LIST MODAL (wards / incubators / doctors / nurses) =========== */}

          {listModal && (

            <div className="modal-overlay" onClick={closeListModal} style={{ alignItems: "center", padding: "20px" }}>

              <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840, width: "100%" }}>

                <div className="modal-header" style={{ padding: "20px 24px" }}>

                  <div>

                    <div className="modal-title">

                      {listModal === "wards" && "NICU Units"}

                      {listModal === "incubators-active" && "Active Incubators"}

                      {listModal === "incubators-inactive" && "Maintenance / Offline Incubators"}

                      {listModal === "doctors" && "Doctors"}

                      {listModal === "nurses" && "Nurses"}

                      {listModal === "patients-active" && "Active Patients"}

                      {listModal === "patients-discharged" && "Discharged Patients"}

                    </div>

                    <div className="modal-subtitle">

                      {listModal.startsWith("patients")

                        ? (listModal === "patients-active"

                            ? "Currently admitted, linked to a live incubator"

                            : "Historical record  -  no longer linked to a live incubator")

                        : selectedHospital.name}

                    </div>

                  </div>

                  <button className="modal-close" onClick={closeListModal} aria-label="Close">&times;</button>

                </div>

                {/* Filter Section  -  Row 1: Search & Sort Pills | Row 2: Date & Incubator Filters */}

                <div style={{ padding: "16px 24px", marginBottom: 0 }}>

                  {/* ROW 1: Search Box on Left & Pill Sort Toggle on Right */}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: listModal.startsWith("patients") ? 14 : 0 }}>

                    <input

                      id="exec-modal-search"

                      type="text"

                      className="input-text"

                      value={modalSearch}

                      onChange={(e) => setModalSearch(e.target.value)}

                      placeholder={listModal.startsWith("patients") ? "Search patient, guardian, syndrome..." : (listModal === "doctors" || listModal === "nurses" ? "Search name, email, license..." : "Type to search...")}

                      style={{ height: 36, flex: "1 1 280px", maxWidth: 380, fontSize: 13 }}

                    />

                    {listModal.startsWith("patients") && (

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

                        <button

                          type="button"

                          onClick={() => setModalSortOrder("desc")}

                          style={{

                            height: 32,

                            padding: "0 14px",

                            borderRadius: 20,

                            fontSize: 12.5,

                            fontWeight: modalSortOrder === "desc" ? 600 : 500,

                            border: modalSortOrder === "desc" ? "1px solid var(--brand)" : "1px solid rgba(225, 29, 72, 0.3)",

                            background: modalSortOrder === "desc" ? "var(--brand)" : "transparent",

                            color: modalSortOrder === "desc" ? "#ffffff" : "var(--text-primary)",

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

                          onClick={() => setModalSortOrder("asc")}

                          style={{

                            height: 32,

                            padding: "0 14px",

                            borderRadius: 20,

                            fontSize: 12.5,

                            fontWeight: modalSortOrder === "asc" ? 600 : 500,

                            border: modalSortOrder === "asc" ? "1px solid var(--brand)" : "1px solid rgba(225, 29, 72, 0.3)",

                            background: modalSortOrder === "asc" ? "var(--brand)" : "transparent",

                            color: modalSortOrder === "asc" ? "#ffffff" : "var(--text-primary)",

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

                    )}

                  </div>

                  {/* ROW 2: Date Filter & Incubator Filter on Left, Clear Button on Right */}

                  {listModal.startsWith("patients") && (

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--border-subtle)" }}>

                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                          <label htmlFor="exec-patient-date-filter" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>

                            Date:

                          </label>

                          <input

                            id="exec-patient-date-filter"

                            type="date"

                            className="input-text"

                            value={modalDateFilter}

                            onChange={(e) => setModalDateFilter(e.target.value)}

                            style={{ height: 34, width: 135, padding: "0 6px", fontSize: 12 }}

                          />

                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>

                          <label htmlFor="exec-patient-inc-filter" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>

                            Incubator:

                          </label>

                          <CustomSelect

                            id="exec-patient-inc-filter"

                            value={modalIncubatorFilter}

                            onChange={(e) => setModalIncubatorFilter(e.target.value)}

                            style={{ height: 34, minWidth: 160 }}

                          >

                            <option value="">All Incubators</option>

                            {hospitalIncubators.map((i) => {

                              const wardName = i.wardId?.name || hospitalWards.find((w) => String(w._id) === String(i.wardId?._id || i.wardId))?.name || "Unassigned NICU";

                              return (

                                <option key={i._id} value={i._id}>

                                  {i.label || i.deviceTopicId} ({wardName})

                                </option>

                              );

                            })}

                          </CustomSelect>

                        </div>

                      </div>

                      {(modalSearch || modalDateFilter || modalIncubatorFilter) && (

                        <button

                          className="btn-small-outline"

                          type="button"

                          onClick={() => { setModalSearch(""); setModalDateFilter(""); setModalIncubatorFilter(""); }}

                          style={{ height: 32, fontSize: 12, padding: "0 12px" }}

                        >

                          Clear Filters

                        </button>

                      )}

                    </div>

                  )}

                </div>

                <div className="modal-body">

                  {listModal === "wards" && (

                    <table className="data-table">

                      <thead>

                        <tr>

                          <th style={{ textAlign: "left" }}>NICU Unit Name</th>

                          <th style={{ textAlign: "center" }}>Status</th>

                          <th style={{ textAlign: "center" }}>Incubator Beds</th>

                          <th style={{ textAlign: "right" }}>Actions</th>

                        </tr>

                      </thead>

                      <tbody>

                        {hospitalWards

                          .filter((w) => w.name.toLowerCase().includes(modalSearch.trim().toLowerCase()))

                          .map((w) => (

                            <tr key={w._id}>

                              <td style={{ textAlign: "left" }}><strong>{w.name}</strong></td>

                              <td style={{ textAlign: "center" }}>

                                <span className={`status-pill-badge ${w.status === "maintenance" ? "status-warning" : w.status === "offline" ? "status-disabled" : "status-active"}`}>

                                  {w.status ? w.status.toUpperCase() : "ONLINE"}

                                </span>

                              </td>

                              <td className="mono" style={{ textAlign: "center" }}>

                                {hospitalIncubators.filter((i) => i.wardId && (i.wardId._id === w._id || i.wardId === w._id)).length} Beds

                              </td>

                              <td style={{ textAlign: "right" }}>

                                {!isSystemAdmin ? (

                                  <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>

                                    <button className="btn-small-outline" onClick={() => startEditWard(w)}>Edit</button>

                                    <button className="btn-reject" onClick={() => handleDeleteWard(w._id, w.name)}>Delete</button>

                                  </div>

                                ) : (

                                  <button className="btn-small-outline" onClick={() => openReviewModal("ward", w._id, w.name)}>Request Review</button>

                                )}

                              </td>

                            </tr>

                          ))}

                        {!hospitalWards.length && (

                          <tr><td colSpan={4} className="empty-state">No NICUs added yet.</td></tr>

                        )}

                      </tbody>

                    </table>

                  )}

                  {(listModal === "incubators-active" || listModal === "incubators-inactive") && (

                    <table className="data-table">

                      <thead>

                        <tr>

                          <th style={{ textAlign: "left" }}>Incubator Name</th>

                          <th style={{ textAlign: "left" }}>NICU Unit</th>

                          <th style={{ textAlign: "center" }}>Status</th>

                          <th style={{ textAlign: "right" }}>Actions</th>

                        </tr>

                      </thead>

                      <tbody>

                        {hospitalIncubators

                          .filter((i) => (listModal === "incubators-active" ? i.status === "active" : i.status !== "active"))

                          .filter((i) => (i.label || i.deviceTopicId || "").toLowerCase().includes(modalSearch.trim().toLowerCase()))

                          .map((inc) => (

                            <tr key={inc._id}>

                              <td style={{ textAlign: "left" }}><strong>{inc.label || inc.deviceTopicId}</strong></td>

                              <td style={{ textAlign: "left" }}>{inc.wardId?.name || "Unassigned"}</td>

                              <td style={{ textAlign: "center" }}>

                                <span className={`status-pill-badge ${inc.status === "active" ? "status-active" : "status-disabled"}`}>

                                  {inc.status || "active"}

                                </span>

                              </td>

                              <td style={{ textAlign: "right" }}>

                                {!isSystemAdmin ? (

                                  <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>

                                    <button className="btn-small-outline" onClick={() => startEditIncubator(inc)}>Edit</button>

                                    <button className="btn-reject" onClick={() => handleDeleteIncubator(inc._id, inc.label || inc.deviceTopicId)}>Delete</button>

                                  </div>

                                ) : (

                                  <button className="btn-small-outline" onClick={() => openReviewModal("incubator", inc._id, inc.label || inc.deviceTopicId)}>Request Review</button>

                                )}

                              </td>

                            </tr>

                          ))}

                        {!hospitalIncubators.filter((i) => (listModal === "incubators-active" ? i.status === "active" : i.status !== "active")).length && (

                          <tr><td colSpan={4} className="empty-state">No incubators in this category yet.</td></tr>

                        )}

                      </tbody>

                    </table>

                  )}

                  {(listModal === "doctors" || listModal === "nurses") && (

                    <table className="data-table">

                      <thead>

                        <tr>

                          <th style={{ textAlign: "left" }}>Name</th>

                          <th style={{ textAlign: "left" }}>Email</th>

                          <th style={{ textAlign: "left" }}>Phone</th>

                          <th style={{ textAlign: "center" }}>License No.</th>

                          <th style={{ textAlign: "center" }}>Status</th>

                          <th style={{ textAlign: "right" }}>Actions</th>

                        </tr>

                      </thead>

                      <tbody>

                        {(listModal === "doctors" ? hospitalDoctors : hospitalNurses)

                          .filter((u) => {

                            const q = modalSearch.trim().toLowerCase();

                            return (

                              !q ||

                              u.name.toLowerCase().includes(q) ||

                              u.email.toLowerCase().includes(q) ||

                              (u.licenseNumber || "").toLowerCase().includes(q)

                            );

                          })

                          .map((u) => (

                            <tr key={u._id}>

                              <td style={{ textAlign: "left" }}><strong>{u.name}</strong></td>

                              <td className="mono" style={{ textAlign: "left" }}>{u.email}</td>

                              <td className="mono" style={{ textAlign: "left" }}>{u.phone || "Not Provided"}</td>

                              <td style={{ textAlign: "center" }}>

                                <span className="badge badge-info" style={{ fontFamily: "monospace" }}>

                                  {u.licenseNumber || "N/A"}

                                </span>

                              </td>

                              <td style={{ textAlign: "center" }}>

                                <span className={`status-pill-badge ${u.isApproved ? "status-active" : "status-disabled"}`}>

                                  {u.isApproved ? "Approved" : "Pending"}

                                </span>

                              </td>

                              <td style={{ textAlign: "right" }}>

                                {!isSystemAdmin ? (

                                  <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>

                                    <button className="btn-small-outline" onClick={() => startEditStaff(u)}>Edit</button>

                                    <button className="btn-reject" onClick={() => handleDeleteStaff(u._id, u.name)}>Delete</button>

                                  </div>

                                ) : (

                                  <button className="btn-small-outline" onClick={() => openReviewModal(listModal === "doctors" ? "doctor" : "nurse", u._id, u.name)}>

                                    Request Review

                                  </button>

                                )}

                              </td>

                            </tr>

                          ))}

                        {!(listModal === "doctors" ? hospitalDoctors : hospitalNurses).length && (

                          <tr><td colSpan={6} className="empty-state">No {listModal} registered for this hospital yet.</td></tr>

                        )}

                      </tbody>

                    </table>

                  )}

                  {(listModal === "patients-active" || listModal === "patients-discharged") && (() => {

                    const dateField = listModal === "patients-discharged" ? "dischargedAt" : "admissionDate";

                    const targetList = listModal === "patients-active" ? hospitalActivePatients : hospitalDischargedPatients;

                    const filteredModalPatients = targetList

                      .filter((p) => {

                        if (modalSearch.trim()) {

                          const q = modalSearch.trim().toLowerCase();

                          const nMatch = (p.name || "").toLowerCase().includes(q);

                          const gMatch = (p.guardianName || "").toLowerCase().includes(q);

                          const sMatch = (p.primarySyndrome || "").toLowerCase().includes(q);

                          if (!nMatch && !gMatch && !sMatch) return false;

                        }

                        if (modalIncubatorFilter) {

                          const pIncId = p.incubatorId?._id || p.incubatorId;

                          if (String(pIncId) !== String(modalIncubatorFilter)) return false;

                        }

                        if (modalDateFilter) {

                          const pDateVal = p[dateField] || p.admittedAt;

                          if (!pDateVal) return false;

                          const dKey = new Date(pDateVal).toISOString().slice(0, 10);

                          if (dKey !== modalDateFilter) return false;

                        }

                        return true;

                      })

                      .slice()

                      .sort((a, b) => {

                        const tA = a[dateField] ? new Date(a[dateField]).getTime() : (a.admittedAt ? new Date(a.admittedAt).getTime() : 0);

                        const tB = b[dateField] ? new Date(b[dateField]).getTime() : (b.admittedAt ? new Date(b.admittedAt).getTime() : 0);

                        return modalSortOrder === "asc" ? tA - tB : tB - tA;

                      });

                    return (

                      <table className="data-table">

                        <thead>

                          <tr>

                            <th style={{ textAlign: "left" }}>NAME</th>

                            <th style={{ textAlign: "center" }}>INCUBATOR</th>

                            <th style={{ textAlign: "center" }}>{listModal === "patients-discharged" ? "DISCHARGED DATE" : "ADMITTED DATE"}</th>

                            <th style={{ textAlign: "right" }}>ACTIONS</th>

                          </tr>

                        </thead>

                        <tbody>

                          {filteredModalPatients.map((p) => (

                            <tr key={p._id}>

                              <td style={{ textAlign: "left" }}><strong>{p.name}</strong></td>

                              <td className="mono" style={{ textAlign: "center" }}>{p.incubatorId?.label || p.incubatorId?.deviceTopicId || " - "}</td>

                              <td className="mono" style={{ textAlign: "center" }}>

                                {formatDateTime(p[dateField] || p.admittedAt || p.dischargedAt)}

                              </td>

                              <td style={{ textAlign: "right" }}>

                                <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>

                                  <button

                                    type="button"

                                    onClick={() => handleOpenPatientDetail(p)}

                                    style={{

                                      background: "none",

                                      border: "none",

                                      padding: 0,

                                      color: "var(--brand)",

                                      fontSize: 13,

                                      fontWeight: 500,

                                      cursor: "pointer",

                                      textDecoration: "none",

                                    }}

                                  >

                                    View timeline

                                  </button>

                                  {!isSystemAdmin && (

                                    <button className="btn-small-outline" onClick={() => startEditPatient(p)}>Edit</button>

                                  )}

                                </div>

                              </td>

                            </tr>

                          ))}

                          {!filteredModalPatients.length && (

                            <tr><td colSpan={4} className="empty-state">No patients match the selected filter.</td></tr>

                          )}

                        </tbody>

                      </table>

                    );

                  })()}

                </div>

              </div>

            </div>

          )}

          {/* =========== EDIT WARD MODAL =========== */}

          {editingWard && (

            <div className="modal-overlay" onClick={() => setEditingWard(null)}>

              <div className="modal-panel" style={{ maxWidth: 540, width: "95%", padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">

                  <div className="modal-title">Edit NICU Unit</div>

                  <button className="modal-close" onClick={() => setEditingWard(null)}>&times;</button>

                </div>

                <form onSubmit={handleUpdateWard}>

                  <div className="field" style={{ marginBottom: 14 }}>

                    <label>NICU Unit Name *</label>

                    <input type="text" className="input-text" value={editWardName} onChange={(e) => setEditWardName(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 18 }}>

                    <label>NICU Operational Status *</label>

                    <CustomSelect value={editWardStatus} onChange={(e) => setEditWardStatus(e.target.value)}>

                      <option value="online">Online (Active Ward)</option>

                      <option value="maintenance">Maintenance (Scheduled Maintenance)</option>

                      <option value="offline">Offline (Deactivated Ward)</option>

                    </CustomSelect>

                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>

                    <button type="button" className="btn-small-outline" onClick={() => setEditingWard(null)}>Cancel</button>

                    <button type="submit" className="btn-small">Save Changes</button>

                  </div>

                </form>

              </div>

            </div>

          )}

          {/* =========== EDIT INCUBATOR MODAL =========== */}

          {editingIncubator && (

            <div className="modal-overlay" onClick={() => setEditingIncubator(null)}>

              <div className="modal-panel" style={{ maxWidth: 540, width: "95%", padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">

                  <div className="modal-title">Edit Incubator Bed</div>

                  <button className="modal-close" onClick={() => setEditingIncubator(null)}>&times;</button>

                </div>

                <form onSubmit={handleUpdateIncubator}>

                  <div className="field" style={{ marginBottom: 14 }}>

                    <label>Incubator Label *</label>

                    <input type="text" className="input-text" value={editIncName} onChange={(e) => setEditIncName(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 14 }}>

                    <label>Assigned NICU Unit</label>

                    <CustomSelect value={editIncWardId} onChange={(e)  => setEditIncWardId(e.target.value)}>

                      <option value="">Unassigned</option>

                      {hospitalWards.map((w) => (

                        <option key={w._id} value={w._id}>{w.name}</option>

                      ))}

                    </CustomSelect>

                  </div>

                  <div className="field" style={{ marginBottom: 18 }}>

                    <label>Operational Status *</label>

                    <CustomSelect value={editIncStatus} onChange={(e) => setEditIncStatus(e.target.value)}>

                      <option value="active">Active (Transmitting Vitals)</option>

                      <option value="maintenance">Maintenance (Under Repair)</option>

                      <option value="offline">Offline / Standby</option>

                    </CustomSelect>

                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>

                    <button type="button" className="btn-small-outline" onClick={() => setEditingIncubator(null)}>Cancel</button>

                    <button type="submit" className="btn-small">Save Changes</button>

                  </div>

                </form>

              </div>

            </div>

          )}

          {/* =========== EDIT STAFF MODAL =========== */}

          {editingStaff && (

            <div className="modal-overlay" onClick={() => setEditingStaff(null)}>

              <div className="modal-panel modal-md" onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">

                  <div className="modal-title">Edit Staff Details ({editingStaff.role === "doctor" ? "Doctor" : "Nurse"})</div>

                  <button className="modal-close" onClick={() => setEditingStaff(null)}>&times;</button>

                </div>

                <form onSubmit={handleUpdateStaff}>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>Full Name *</label>

                    <input type="text" className="input-text" value={editStaffName} onChange={(e) => setEditStaffName(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>Email Address *</label>

                    <input type="email" className="input-text" value={editStaffEmail} onChange={(e) => setEditStaffEmail(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>
                      Contact Phone *
                      <InfoTooltip text="Active WhatsApp number required for automated clinical advisories and emergency vitals alerts." />
                    </label>

                    <input type="tel" className="input-text" value={editStaffPhone} onChange={(e) => setEditStaffPhone(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>{editingStaff.role === "doctor" ? "BMDC / Medical License No. *" : "Nursing Council / License No. *"}</label>

                    <input type="text" className="input-text" value={editStaffLicenseNo} onChange={(e) => setEditStaffLicenseNo(e.target.value)} required />

                  </div>

                  <div className="field" style={{ marginBottom: 14 }}>
                    <label>Assigned NICU Ward</label>
                    <CustomSelect value={editStaffWardId} onChange={(e) => setEditStaffWardId(e.target.value)}>
                      <option value="">Whole hospital (Unassigned ward)</option>
                      {hospitalWards.map((w) => (
                        <option key={w._id} value={w._id}>{w.name}</option>
                      ))}
                    </CustomSelect>
                  </div>

                  <div className="field" style={{ marginBottom: 18 }}>
                    <label>
                      Reset Password (optional)
                      <InfoTooltip text="Leave blank to preserve current password. Enter at least 6 characters to reset this staff member's login credentials." />
                    </label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        type={showEditStaffPassword ? "text" : "password"}
                        className="input-text"
                        placeholder="Enter new password to reset, or leave blank"
                        value={editStaffPassword}
                        onChange={(e) => setEditStaffPassword(e.target.value)}
                        minLength={6}
                        style={{ paddingRight: 36 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditStaffPassword((v) => !v)}
                        title={showEditStaffPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          right: 8,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--text-muted, #94a3b8)",
                          display: "flex",
                          alignItems: "center",
                          padding: 4,
                        }}
                      >
                        {showEditStaffPassword ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>

                    <button type="button" className="btn-small-outline" onClick={() => setEditingStaff(null)}>Cancel</button>

                    <button type="submit" className="btn-small">Save Changes</button>

                  </div>

                </form>

              </div>

            </div>

          )}

          {/* =========== EDIT PATIENT MODAL =========== */}

          {editingPatient && (

            <div className="modal-overlay" onClick={() => setEditingPatient(null)}>

              <div className="modal-panel modal-md" onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">

                  <div className="modal-title">Edit Patient Record</div>

                  <button className="modal-close" onClick={() => setEditingPatient(null)}>&times;</button>

                </div>

                <form onSubmit={handleUpdatePatient}>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>Patient Name *</label>

                    <input type="text" className="input-text" value={editPatName} onChange={(e) => setEditPatName(e.target.value)} required />

                  </div>

                  <div className="form-row-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

                    <div className="field">

                      <label>Gestational Age (weeks)</label>

                      <input type="number" className="input-text" value={editPatGestation} onChange={(e) => setEditPatGestation(e.target.value)} placeholder="e.g. 32" />

                    </div>

                    <div className="field">

                      <label>Birth Weight (grams)</label>

                      <input type="number" className="input-text" value={editPatWeight} onChange={(e) => setEditPatWeight(e.target.value)} placeholder="e.g. 1800" />

                    </div>

                  </div>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>Primary Syndrome / Indication *</label>

                    <input type="text" className="input-text" value={editPatSyndrome} onChange={(e) => setEditPatSyndrome(e.target.value)} required />

                  </div>

                  <div className="form-row-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

                    <div className="field">

                      <label>Guardian Name *</label>

                      <input type="text" className="input-text" value={editPatGuardianName} onChange={(e) => setEditPatGuardianName(e.target.value)} required />

                    </div>

                    <div className="field">

                      <label>
                        Guardian Phone *
                        <InfoTooltip text="Active WhatsApp number required for receiving one-click Family Portal access codes and live baby vitals updates." />
                      </label>

                      <input type="tel" className="input-text" value={editPatGuardianPhone} onChange={(e) => setEditPatGuardianPhone(e.target.value)} required />

                    </div>

                  </div>

                  <div className="field" style={{ marginBottom: 18 }}>

                    <label>Assigned Incubator Bed</label>

                    <CustomSelect value={editPatIncubatorId} onChange={(e) => setEditPatIncubatorId(e.target.value)} placeholder="Select Incubator...">

                      <option value="">Select Incubator...</option>

                      {hospitalIncubators.map((inc) => {

                        const wardName = inc.wardId?.name || hospitalWards.find((w) => String(w._id) === String(inc.wardId?._id || inc.wardId))?.name || "Unassigned NICU";

                        const isMaintenance = inc.status === "maintenance";

                        const isOffline = inc.status === "offline";

                        const occupiedPatient = hospitalActivePatients.find(

                          (p) => String(p._id) !== String(editingPatient?._id) && String(p.incubatorId?._id || p.incubatorId) === String(inc._id)

                        );

                        const isOccupied = Boolean(occupiedPatient);

                        const isDisabled = isMaintenance || isOffline || isOccupied;

                        let hint = null;

                        let statusType = inc.status;

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

                            key={inc._id}

                            value={inc._id}

                            disabled={isDisabled}

                            data-status={statusType}

                            data-hint={hint}

                          >

                            {`${inc.label || inc.deviceTopicId} (${wardName})`}

                          </option>

                        );

                      })}

                    </CustomSelect>

                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>

                    <button type="button" className="btn-small-outline" onClick={() => setEditingPatient(null)}>Cancel</button>

                    <button type="submit" className="btn-small">Save Changes</button>

                  </div>

                </form>

              </div>

            </div>

          )}

          {/* =========== INSPECT PATIENT TIMELINE / DETAIL MODAL =========== */}

          {inspectingPatient && (

            <div className="modal-overlay" onClick={() => setInspectingPatient(null)} style={{ alignItems: "center", padding: "20px" }}>

              <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>

                <div className="modal-header">

                  <div>

                    <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>

                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2">

                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>

                      </svg>

                      {inspectingPatient.name}

                    </div>

                    <div className="modal-subtitle">

                      Incubator: {inspectingPatient.incubatorId?.label || inspectingPatient.incubatorId?.deviceTopicId || "Unassigned"}

                    </div>

                  </div>

                  <button className="modal-close" onClick={() => setInspectingPatient(null)} aria-label="Close">&times;</button>

                </div>

                <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {inspectingPatient.dischargedAt && (

                    <div className="banner-neutral">

                      <div className="banner-title">Discharged</div>

                      <div className="banner-meta">

                        {formatDateTime(inspectingPatient.dischargedAt)}

                        {inspectingPatient.dischargedBy?.name && `  -  by ${inspectingPatient.dischargedBy.name}`}

                      </div>

                      {inspectingPatient.dischargeSummary && (

                        <p style={{ marginTop: 8, marginBottom: 0 }}>{inspectingPatient.dischargeSummary}</p>

                      )}

                    </div>

                  )}

                  {/* â"€â"€ Patient Info Grid â"€â"€ */}

                  <div className="patient-meta-grid">

                    <div className="meta-item">

                      <div className="meta-label">Gender</div>

                      <div className="meta-value" style={{ textTransform: "capitalize" }}>{inspectingPatient.biologicalSex || " - "}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Date of birth</div>

                      <div className="meta-value">{inspectingPatient.dateOfBirth ? new Date(inspectingPatient.dateOfBirth).toLocaleDateString() : " - "}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Gestational age</div>

                      <div className="meta-value">{inspectingPatient.gestationalAgeWeeks ? `${inspectingPatient.gestationalAgeWeeks}w` : " - "}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Birth weight</div>

                      <div className="meta-value">{inspectingPatient.birthWeightGrams ? `${inspectingPatient.birthWeightGrams}g` : " - "}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Blood type</div>

                      <div className="meta-value">{inspectingPatient.bloodType || "unknown"}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Primary syndrome</div>

                      <div className="meta-value">{inspectingPatient.primarySyndrome || " - "}</div>

                    </div>

                    <div className="meta-item">

                      <div className="meta-label">Admitted</div>

                      <div className="meta-value">{formatDateTime(inspectingPatient.admittedAt)}</div>

                    </div>

                  </div>

                  {/* â"€â"€ Guardian Details (Simplified 4-Card Grid matching Baby Info above) â"€â"€ */}

                  <div>

                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand)", marginBottom: 10 }}>

                      Mother / Guardian Details

                    </div>

                    <div className="patient-meta-grid" style={{ marginBottom: 0 }}>

                      <div className="meta-item">

                        <div className="meta-label">Guardian name</div>

                        <div className="meta-value">{inspectingPatient.guardianName || " - "}</div>

                      </div>

                      <div className="meta-item">

                        <div className="meta-label">Guardian phone</div>

                        <div className="meta-value">{inspectingPatient.guardianPhone || " - "}</div>

                      </div>

                      <div className="meta-item">

                        <div className="meta-label">National ID / passport</div>

                        <div className="meta-value">{inspectingPatient.guardianNationalId || " - "}</div>

                      </div>

                      <div className="meta-item">

                        <div className="meta-label">Address</div>

                        <div className="meta-value">{inspectingPatient.guardianAddress || " - "}</div>

                      </div>

                    </div>

                  </div>

                  {/* â"€â"€ Timeline Notes (Simplified, Non-scrollable list) â"€â"€ */}

                  <div>

                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--brand)", marginBottom: 10 }}>

                      Timeline Notes

                    </div>

                    {inspectingNotesLoading ? (

                      <p className="waiting-msg">Loading notes...</p>

                    ) : (

                      <ul className="notes-timeline" style={{ maxHeight: "none", overflow: "visible" }}>

                        {inspectingNotes.map((n) => {

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

                                  <span style={{ color: "var(--text-secondary)" }}> - </span>

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

                                  onClick={() => handleDeleteInspectingNote(n._id)}

                                  title="Delete your clinical note"

                                  aria-label="Delete clinical note"

                                >

                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">

                                    <polyline points="3 6 5 6 21 6" />

                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />

                                    <line x1="10" y1="11" x2="10" y2="17" />

                                    <line x1="14" y1="11" x2="14" y2="17" />

                                  </svg>

                                  <span>Delete</span>

                                </button>

                              )}

                            </li>

                          );

                        })}

                        {!inspectingNotes.length && <li className="empty-state">No notes logged yet.</li>}

                      </ul>

                    )}

                  </div>

                  {/* ── Patient Clinical Advisories & Active Notices History (Filtered on/after admission date) ── */}
                  <PatientAdvisoriesTimeline patient={inspectingPatient} />

                  {/* Modal Footer Actions */}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid var(--border)" }}>

                    <button type="button" className="btn-small-outline" onClick={() => setInspectingPatient(null)}>

                      Close

                    </button>

                    {isSystemAdmin ? (

                      <button

                        type="button"

                        className="btn-small-outline"

                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, borderColor: "var(--brand-light)", color: "var(--brand-light)" }}

                        onClick={() => {

                          const target = inspectingPatient;

                          setInspectingPatient(null);

                          openReviewModal("patient", target._id, target.name);

                        }}

                      >

                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                          <circle cx="12" cy="12" r="10" />

                          <line x1="12" y1="8" x2="12" y2="12" />

                          <line x1="12" y1="16" x2="12.01" y2="16" />

                        </svg>

                        Request Review

                      </button>

                    ) : (

                      <button

                        type="button"

                        className="btn-small-outline"

                        onClick={() => {

                          const target = inspectingPatient;

                          setInspectingPatient(null);

                          startEditPatient(target);

                        }}

                      >

                        Edit Patient Details

                      </button>

                    )}

                  </div>

                </div>

              </div>

            </div>

          )}

          {/* =========== SYSTEM ADMIN REVIEW REQUEST MODAL =========== */}

          {reviewModal && (

            <div className="modal-overlay" onClick={closeReviewModal}>

              <div className="modal-panel modal-md" onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">

                  <div>

                    <div className="modal-title">Send Review Request to Hospital In-Charge</div>

                    <div className="modal-subtitle">{selectedHospital?.name}</div>

                  </div>

                  <button className="modal-close" onClick={closeReviewModal}>&times;</button>

                </div>

                <form onSubmit={handleSendReviewRequest}>

                  <div className="field" style={{ marginBottom: 12 }}>

                    <label>Target Entity</label>

                    <input type="text" className="input-text" value={`${reviewModal.entityType.toUpperCase()}: ${reviewModal.entityName}`} disabled readOnly />

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

          {/* =========== REVIEW REQUEST SUCCESS POPUP =========== */}

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

                  Your review request for <strong>"{reviewSuccessModal.entityName}"</strong> has been delivered to the Hospital In-Charge of <strong>{reviewSuccessModal.hospitalName}</strong>. An alert banner and notification have been posted to their dashboard.

                </p>

                <button type="button" className="btn-small" style={{ minWidth: 140, margin: "0 auto" }} onClick={() => setReviewSuccessModal(null)}>

                  Got It

                </button>

              </div>

            </div>

          )}

        </div>

      )}

      {/* ===== Delete Confirmation Modal (Ward / Incubator) ===== */}

      {deleteModal.open && (

        <div className="modal-overlay" onClick={() => !deleteModal.loading && setDeleteModal({ open: false, type: "", id: null, name: "", loading: false, error: "" })}>

          <div className="modal-panel" style={{ maxWidth: 540, width: "95%", padding: "26px 28px" }} onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">

              <div>

                <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>

                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">

                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />

                  </svg>

                  <span>Delete {deleteModal.type === "ward" ? "NICU" : deleteModal.type === "incubator" ? "Incubator" : deleteModal.type === "doctor" ? "Doctor" : deleteModal.type === "nurse" ? "Nurse" : "Staff Member"}</span>

                </div>

                <div className="modal-subtitle">This action cannot be undone.</div>

              </div>

              <button className="modal-close" disabled={deleteModal.loading}

                onClick={() => setDeleteModal({ open: false, type: "", id: null, name: "", loading: false, error: "" })}>&times;</button>

            </div>

            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "12px 0" }}>

              Are you sure you want to delete {" "}<strong>"{deleteModal.name}"</strong>?

            </p>

            {deleteModal.error && (

              <div style={{

                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)",

                borderRadius: 8, padding: "10px 14px", marginBottom: 14,

                color: "#dc2626", fontSize: 13, fontWeight: 500,

                display: "flex", alignItems: "flex-start", gap: 8,

              }}>

                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>

                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />

                </svg>

                {deleteModal.error}

              </div>

            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>

              <button className="btn-small-outline" disabled={deleteModal.loading}

                onClick={() => setDeleteModal({ open: false, type: "", id: null, name: "", loading: false, error: "" })}>

                {deleteModal.error ? "Close" : "Cancel"}

              </button>

              {!deleteModal.error && (

                <button className="btn-small" style={{ background: "#e11d48", color: "#fff" }}

                  onClick={handleConfirmDelete} disabled={deleteModal.loading}>

                  {deleteModal.loading ? "Deleting..." : "Yes, Delete"}

                </button>

              )}

            </div>

          </div>

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