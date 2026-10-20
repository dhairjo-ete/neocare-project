import axios from "axios";

const defaultBaseUrl =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.protocol !== "file:" && window.location.origin.includes("localhost")
    ? "http://localhost:5000/api"
    : "https://neocare-backend-saqj.onrender.com/api");

const axiosClient = axios.create({
  baseURL: defaultBaseUrl,
});

axiosClient.interceptors.request.use((config) => {
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
