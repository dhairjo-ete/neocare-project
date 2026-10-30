// Clean up any accidental double-slashes or trailing slashes before React Router initializes
if (typeof window !== "undefined" && window.location.pathname.includes("//")) {
  const cleanPath = window.location.pathname.replace(/\/+/g, "/");
  window.history.replaceState(null, "", cleanPath + window.location.search + window.location.hash);
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
