export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (typeof window !== "undefined" && window.location.protocol !== "file:" && window.location.origin.includes("localhost")
    ? "http://localhost:5000"
    : "https://neocare-backend-saqj.onrender.com");

export default SOCKET_URL;
