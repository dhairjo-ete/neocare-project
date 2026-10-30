import { createContext, useContext, useState, useCallback, useEffect } from "react";
import axiosClient from "../api/axiosClient";
import { useDataSync } from "../hooks/useDataSync";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("neocare_user");
    return stored ? JSON.parse(stored) : null;
  });

  // #20 FIX: Fetch fresh profile on mount to ensure hospitalName (and other fields) aren't stale
  useEffect(() => {
    const token = localStorage.getItem("neocare_token");
    if (token) {
      axiosClient.get("/users/me")
        .then(({ data }) => {
          const freshUser = {
            id: data._id,
            name: data.name,
            email: data.email,
            role: data.role,
            patientId: data.patientId || (data.role === "patient" ? data._id : null),
            patientName: data.patientName || (data.role === "patient" ? data.name : null),
            hospitalId: data.hospitalId ? (data.hospitalId._id || data.hospitalId) : null,
            hospitalName: data.hospitalId?.name || data.hospitalName || null,
            wardId: data.wardId ? (data.wardId._id || data.wardId) : null,
            isEmailVerified: data.isEmailVerified,
            isApproved: data.isApproved,
            mustChangePassword: ["doctor", "nurse"].includes(data.role) ? Boolean(data.mustChangePassword) : false,
          };
          setUser(freshUser);
          localStorage.setItem("neocare_user", JSON.stringify(freshUser));
        })
        .catch(() => {
          // If token is invalid or user revoked, logout
          logout();
        });
    }
  }, []);

  async function login(email, password, portal) {
    const { data } = await axiosClient.post("/auth/login", { email, password, portal });
    localStorage.setItem("neocare_token", data.token);
    localStorage.setItem("neocare_user", JSON.stringify(data.user));
    setUser(data.user);
    return data;
  }

  async function loginWithMagicCode(code) {
    const { data } = await axiosClient.post("/auth/magic-access", { code });
    localStorage.setItem("neocare_token", data.token);
    localStorage.setItem("neocare_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  // Hospital Admin registration — creates hospital + admin account
  async function registerHospitalAdmin({ hospitalName, hospitalAddress, adminName, adminEmail, adminPhone, password }) {
    const { data } = await axiosClient.post("/auth/register-hospital-admin", {
      hospitalName,
      hospitalAddress,
      adminName,
      adminEmail,
      adminPhone,
      password,
    });
    return data;
  }

  // Doctor / Nurse registration under a hospital
  async function registerStaff({ name, email, phone, password, role, hospitalId, licenseNumber }) {
    const { data } = await axiosClient.post("/auth/register-staff", {
      name,
      email,
      phone,
      password: password || licenseNumber,
      role,
      hospitalId,
      licenseNumber,
    });
    return data;
  }

  function logout() {
    localStorage.removeItem("neocare_token");
    localStorage.removeItem("neocare_user");
    setUser(null);
  }

  const updateProfile = useCallback((updatedUserData) => {
    setUser((prev) => {
      const merged = { ...prev, ...updatedUserData };
      localStorage.setItem("neocare_user", JSON.stringify(merged));
      return merged;
    });
  }, []);

  // user.hospitalName is a snapshot taken at login time. If a system_admin
  // renames the hospital while this person stays logged in, everything else
  // in the UI updates live via useDataSync - but this cached name wouldn't,
  // since it lives in localStorage/context rather than being fetched fresh.
  useDataSync(useCallback((changeEvent) => {
    if (changeEvent.entity !== "hospital" || changeEvent.action !== "update") return;
    setUser((prev) => {
      if (!prev || !prev.hospitalId || String(prev.hospitalId) !== String(changeEvent.data._id)) return prev;
      const updated = { ...prev, hospitalName: changeEvent.data.name };
      localStorage.setItem("neocare_user", JSON.stringify(updated));
      return updated;
    });
  }, []));

  return (
    <AuthContext.Provider value={{ user, login, loginWithMagicCode, registerHospitalAdmin, registerStaff, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
