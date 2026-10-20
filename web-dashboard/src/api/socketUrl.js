export function getSocketUrl() {
  const custom = typeof localStorage !== "undefined" ? localStorage.getItem("neocare_custom_socket_url") : null;
  if (custom) return custom.replace(/\/+$/, "");

  const isDesktop = typeof window !== "undefined" && (
    window.location.protocol === "file:" ||
    Boolean(window.electron) ||
    navigator.userAgent.toLowerCase().includes("electron")
  );

  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (isDesktop && (!envUrl || envUrl.includes("localhost"))) {
    return "https://neocare-backend-saqj.onrender.com";
  }

  if (typeof window !== "undefined" && window.location.protocol !== "file:" && window.location.origin.includes("localhost")) {
    return envUrl || "http://localhost:5000";
  }

  return envUrl || "https://neocare-backend-saqj.onrender.com";
}

export const SOCKET_URL = getSocketUrl();
export default SOCKET_URL;
