import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { showDesktopAlert } from "../utils/desktopNotification";
import { SOCKET_URL } from "../api/socketUrl";

export function useSocket(
  onVitals,
  onAlert,
  onStatus,
  onStandby,
  onAlertChange,
  onControlUpdated,
  onAlertEscalated
) {
  const socketRef = useRef(null);
  const onVitalsRef = useRef(onVitals);
  const onAlertRef = useRef(onAlert);
  const onStatusRef = useRef(onStatus);
  const onStandbyRef = useRef(onStandby);
  const onAlertChangeRef = useRef(onAlertChange);
  const onControlUpdatedRef = useRef(onControlUpdated);
  const onAlertEscalatedRef = useRef(onAlertEscalated);

  useEffect(() => {
    onVitalsRef.current = onVitals;
    onAlertRef.current = onAlert;
    onStatusRef.current = onStatus;
    onStandbyRef.current = onStandby;
    onAlertChangeRef.current = onAlertChange;
    onControlUpdatedRef.current = onControlUpdated;
    onAlertEscalatedRef.current = onAlertEscalated;
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token: localStorage.getItem("neocare_token") },
      transports: ["websocket", "polling"],
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("vitals:update", (data) => onVitalsRef.current?.(data));

    socket.on("alert:new", (data) => {
      onAlertRef.current?.(data);

      // Tier 2: Trigger native OS desktop notification if tab is hidden/minimized
      if (document.hidden && data?.severity === "critical") {
        const patientDesc = data.patientName
          ? `${data.patientName} (${data.incubatorLabel || data.device_id})`
          : (data.incubatorLabel || data.device_id);

        showDesktopAlert({
          title: `Clinical Priority: ${patientDesc}`,
          body: `Parameter variance noted — ${data.condition || data.type} (${data.value}). Bedside review recommended.`,
          tag: `alert-${data._id || data.device_id}`,
          deviceId: data.device_id,
        });
      }
    });

    socket.on("alert:escalated", (data) => {
      onAlertEscalatedRef.current?.(data);

      // Tier 4: Trigger native OS desktop notification for unacknowledged escalations
      const patientDesc = data.patientName
        ? `${data.patientName} (${data.incubatorLabel || data.device_id})`
        : (data.incubatorLabel || data.device_id);

      showDesktopAlert({
        title: `Supervisor Advisory: ${patientDesc}`,
        body: `Clinical event unacknowledged for >60s — ${data.condition || data.type} (${data.value}). Supervisory review requested.`,
        tag: `escalated-${data._id || data.device_id}`,
        deviceId: data.device_id,
      });
    });

    socket.on("device:status", (data) => onStatusRef.current?.(data));
    socket.on("incubator:standby", (data) => onStandbyRef.current?.(data));
    socket.on("alert:change", (data) => onAlertChangeRef.current?.(data));
    socket.on("incubator:control_updated", (data) => onControlUpdatedRef.current?.(data));

    return () => socket.disconnect();
  }, []);

  return socketRef;
}
