import axios from "axios";

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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
      if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/signup")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;
