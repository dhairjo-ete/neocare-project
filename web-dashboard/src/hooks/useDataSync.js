import { useEffect } from "react";
import { io } from "socket.io-client";

/**
 * Custom hook to listen for real-time data change events
 * emitted by the backend (hospitals, wards/NICUs, incubators, patients, users)
 * and trigger an automatic re-fetch on all open portals and dashboards.
 */
export function useDataSync(onDataChange) {
  useEffect(() => {
    if (!onDataChange) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL, { auth: { token: localStorage.getItem("neocare_token") } });

    socket.on("data:change", (changeEvent) => {
      onDataChange(changeEvent);
    });

    return () => {
      socket.disconnect();
    };
  }, [onDataChange]);
}
