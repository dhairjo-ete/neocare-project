import { useCallback, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import NicuGridView from "../components/NicuGridView";
import DetailedIncubatorView from "../components/DetailedIncubatorView";
import SimulationControls from "../components/SimulationControls";
import { useSocket } from "../hooks/useSocket";
import axiosClient from "../api/axiosClient";

const MAX_POINTS = 60;

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDevice = searchParams.get("device");

  const [viewMode, setViewMode] = useState(urlDevice ? "detailed" : "grid"); // "grid" | "detailed"
  const [selectedDevice, setSelectedDevice] = useState(urlDevice || "incubator_01");
  const [deviceMap, setDeviceMap] = useState({});
  const [historyMap, setHistoryMap] = useState({});
  const [alerts, setAlerts] = useState([]);

  // Sync state if URL query param changes dynamically
  useEffect(() => {
    const devParam = searchParams.get("device");
    if (devParam) {
      setSelectedDevice(devParam);
      setViewMode("detailed");
    }
  }, [searchParams]);

  const onVitals = useCallback((vital) => {
    const devId = vital.device_id || "incubator_01";

    // Update latest reading per device
    setDeviceMap((prev) => ({
      ...prev,
      [devId]: vital,
    }));

    // Update history per device
    setHistoryMap((prev) => {
      const currentList = prev[devId] || [];
      return {
        ...prev,
        [devId]: [...currentList.slice(-MAX_POINTS + 1), vital],
      };
    });
  }, []);

  const onAlert = useCallback((alert) => {
    setAlerts((prev) => (prev.some((a) => a._id === alert._id) ? prev : [alert, ...prev].slice(0, 20)));
  }, []);

  // Keep every open screen in sync when someone else acknowledges an alert, or
  // when a discharge closes a patient's open alerts.
  const onAlertChange = useCallback(({ action, data }) => {
    if (!data) return;
    if (action === "acknowledge") {
      setAlerts((prev) =>
        prev.map((a) =>
          a._id === data._id
            ? { ...a, acknowledged: true, acknowledgedBy: data.acknowledgedBy, acknowledgedAt: data.acknowledgedAt }
            : a
        )
      );
    } else if (action === "close_patient") {
      setAlerts((prev) => prev.filter((a) => String(a.patientId) !== String(data.patientId)));
    }
  }, []);

  const onStandby = useCallback((data) => {
    // #8 FIX: Clear cache for empty or standby incubators
    const devId = data.device_id;
    setDeviceMap((prev) => {
      const next = { ...prev };
      delete next[devId];
      return next;
    });
    setHistoryMap((prev) => {
      const next = { ...prev };
      delete next[devId];
      return next;
    });
  }, []);

  const onControlUpdated = useCallback((data) => {
    if (!data?.deviceTopicId || !data?.controlSettings) return;
    setDeviceMap((prev) => {
      const cur = prev[data.deviceTopicId];
      if (!cur) return prev;
      return {
        ...prev,
        [data.deviceTopicId]: {
          ...cur,
          phototherapy: data.controlSettings.phototherapy,
          oxygen_flow: data.controlSettings.oxygenFlow,
        },
      };
    });
  }, []);

  useSocket(onVitals, onAlert, null, onStandby, onAlertChange, onControlUpdated);

  // #6 FIX: Load unacknowledged alerts on mount so they persist across page reloads
  useEffect(() => {
    async function fetchAlerts() {
      try {
        const { data } = await axiosClient.get("/alerts?acknowledged=false");
        setAlerts(data);
      } catch (err) {
        console.error("Failed to load alerts:", err);
      }
    }
    fetchAlerts();
  }, []);

  const activeVital = deviceMap[selectedDevice];
  const activeHistory = historyMap[selectedDevice] || [];
  const filteredAlerts = alerts.filter((a) => a.device_id === selectedDevice || !a.device_id);

  // #6 FIX: Actually call the backend to persist the acknowledgement
  const handleAcknowledge = async (alertId) => {
    try {
      const { data } = await axiosClient.patch(`/alerts/${alertId}/acknowledge`);
      // Use the server's record so the first acknowledger's name/time is kept
      setAlerts((prev) =>
        prev.map((a) => (a._id === alertId ? { ...a, ...data, acknowledged: true } : a))
      );
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
      const errMsg = err?.response?.data?.error || "Failed to acknowledge alert.";
      alert(errMsg);
    }
  };

  const handleSelectDeviceFromGrid = (deviceTopicId) => {
    setSelectedDevice(deviceTopicId);
    setViewMode("detailed");
    setSearchParams({ device: deviceTopicId });
  };

  return (
    <Layout>
      {/* Operational Header */}
      <div className="dashboard-operational-bar">
        <div>
          <h1 className="page-title">
            {viewMode === "grid" ? "NICU Command Center" : `Bed Monitor — ${selectedDevice}`}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <SimulationControls selectedDevice={viewMode === "detailed" ? selectedDevice : null} />

          {viewMode === "detailed" && (
            <button
              type="button"
              className="btn-small-outline"
              onClick={() => {
                setViewMode("grid");
                setSearchParams({});
              }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              ← Back to NICU Grid
            </button>
          )}
        </div>
      </div>

      {/* MODE 1: Hierarchical NICU Grid View */}
      {viewMode === "grid" && (
        <NicuGridView
          deviceMap={deviceMap}
          onSelectDevice={handleSelectDeviceFromGrid}
        />
      )}

      {/* MODE 2: Detailed Bed Dashboard */}
      {viewMode === "detailed" && (
        <DetailedIncubatorView
          selectedDevice={selectedDevice}
          activeVital={activeVital}
          activeHistory={activeHistory}
          alerts={filteredAlerts}
          onAcknowledgeAlert={handleAcknowledge}
        />
      )}
    </Layout>
  );
}



