import axios from "axios";

export function getBaseApiUrl() {
  const custom = typeof localStorage !== "undefined" ? localStorage.getItem("neocare_custom_api_url") : null;
  if (custom) return custom.replace(/\/+$/, "");

  const isDesktop = typeof window !== "undefined" && (
    window.location.protocol === "file:" ||
    Boolean(window.electron) ||
    navigator.userAgent.toLowerCase().includes("electron")
  );

  const envUrl = import.meta.env.VITE_API_URL;
  if (isDesktop && (!envUrl || envUrl.includes("localhost"))) {
    return "https://neocare-backend-saqj.onrender.com/api";
  }

  if (typeof window !== "undefined" && window.location.protocol !== "file:" && window.location.origin.includes("localhost")) {
    return envUrl || "http://localhost:5000/api";
  }

  return envUrl || "https://neocare-backend-saqj.onrender.com/api";
}

const axiosClient = axios.create({
  baseURL: getBaseApiUrl(),
});

axiosClient.interceptors.request.use((config) => {
  config.baseURL = getBaseApiUrl();
  const token = localStorage.getItem("neocare_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// #16 FIX: Only clear auth token on explicit 401 Unauthorized (invalid/expired token)
// Prevent network errors (blips) or 403 Forbidden responses from logging out users.
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("neocare_token");
      localStorage.removeItem("neocare_user");
      // Only redirect if not already on login/signup page
      const current = (window.location.pathname + window.location.hash).toLowerCase();
      if (!current.includes("login") && !current.includes("signup")) {
        if (window.location.protocol === "file:") {
          window.location.hash = "#/login";
        } else {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
