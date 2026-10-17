import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocket } from "../services/socket";
import VitalChart from "../components/VitalChart";

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN); // NaN never compares true, so null is not "critical"

export default function DashboardScreen() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [vitalsMap, setVitalsMap] = useState({});
  const [historyMap, setHistoryMap] = useState({});

  // Device IDs are generated per incubator, so load this user's devices from the API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await AsyncStorage.getItem("neocare_token");
        const { data } = await axios.get(`${API_URL || "http://localhost:5000/api"}/vitals/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        setDevices(data);
        setSelectedDevice((cur) => cur || data[0] || "");
      } catch {
        /* the waiting box below explains there is no stream yet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (vital) => {
      const dev = vital.device_id;
      if (!dev) return;
      setVitalsMap((prev) => ({ ...prev, [dev]: vital }));
      setHistoryMap((prev) => ({
        ...prev,
        [dev]: [...(prev[dev] || []).slice(-29), vital.heart_rate],
      }));
    };
    socket.on("vitals:update", handler);
    return () => socket.off("vitals:update", handler);
  }, []);

  const latest = vitalsMap[selectedDevice];
  const hrHistory = historyMap[selectedDevice] || [];

  const getStatusColor = (vital) => {
    if (!vital) return "#10b981";
    const hr = num(vital.heart_rate), sp = num(vital.spo2), tp = num(vital.temperature);
    if (sp < 90 || hr < 80 || hr > 200 || tp < 35.5 || tp > 38.5) {
      return "#ef4444";
    }
    if (sp < 94 || hr < 100 || hr > 180 || tp < 36.0 || tp > 37.8) {
      return "#f59e0b";
    }
    return "#10b981";
  };

  const statusColor = getStatusColor(latest);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>NeoCare Mobile Dashboard</Text>
      <Text style={styles.headerSubtitle}>Real-Time Neonatal Monitoring</Text>

      {/* Device Picker Pills */}
      <View style={styles.pickerRow}>
        {devices.map((dev) => (
          <TouchableOpacity
            key={dev}
            style={[styles.pill, selectedDevice === dev && styles.pillActive]}
            onPress={() => setSelectedDevice(dev)}
          >
            <Text style={[styles.pillText, selectedDevice === dev && styles.pillTextActive]}>
              {dev}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {latest ? (
        <View style={styles.mainCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.deviceTitle}>{selectedDevice}</Text>
            <View style={[styles.badge, { backgroundColor: `${statusColor}25`, borderColor: statusColor }]}>
              <Text style={[styles.badgeText, { color: statusColor }]}>{latest.condition || "Normal"}</Text>
            </View>
          </View>

          <View style={styles.vitalsGrid}>
            <View style={styles.vitalBox}>
              <Text style={styles.vitalLabel}>Heart Rate</Text>
              <Text style={[styles.vitalValue, { color: num(latest.heart_rate) < 100 || num(latest.heart_rate) > 180 ? statusColor : "#10b981" }]}>
                {latest.heart_rate} <Text style={styles.unit}>bpm</Text>
              </Text>
            </View>

            <View style={styles.vitalBox}>
              <Text style={styles.vitalLabel}>SpO₂ Saturation</Text>
              <Text style={[styles.vitalValue, { color: num(latest.spo2) < 94 ? statusColor : "#06b6d4" }]}>
                {latest.spo2} <Text style={styles.unit}>%</Text>
              </Text>
            </View>

            <View style={styles.vitalBox}>
              <Text style={styles.vitalLabel}>Temperature</Text>
              <Text style={[styles.vitalValue, { color: num(latest.temperature) < 36 || num(latest.temperature) > 37.8 ? statusColor : "#f59e0b" }]}>
                {latest.temperature} <Text style={styles.unit}>°C</Text>
              </Text>
            </View>
          </View>

          {/* Digital Twin Controls */}
          <View style={styles.twinSummary}>
            <Text style={styles.twinText}>Heater: {latest.heater_power || 50}%</Text>
            <Text style={styles.twinText}>O₂ Flow: {latest.oxygen_flow || 2.0} L/min</Text>
            <Text style={styles.twinText}>Fan: {latest.fan_speed || 1200} RPM</Text>
          </View>
        </View>
      ) : (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingText}>{selectedDevice ? `Waiting for telemetry from ${selectedDevice}...` : "No incubators available for your account."}</Text>
        </View>
      )}

      <Text style={styles.chartTitle}>Heart Rate Trend (bpm)</Text>
      <VitalChart label="HR Waveform" values={hrHistory} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1420", padding: 16 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#f8fafc", marginBottom: 2 },
  headerSubtitle: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  pickerRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  pillActive: { backgroundColor: "#0284c7", borderColor: "#38bdf8" },
  pillText: { fontSize: 13, color: "#94a3b8" },
  pillTextActive: { color: "#ffffff", fontWeight: "600" },
  mainCard: { backgroundColor: "#101b29", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#1e2e42", marginBottom: 20 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  deviceTitle: { fontSize: 16, fontWeight: "600", color: "#f8fafc" },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  vitalsGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  vitalBox: { flex: 1, alignItems: "center" },
  vitalLabel: { fontSize: 11, color: "#64748b", marginBottom: 4 },
  vitalValue: { fontSize: 20, fontWeight: "700" },
  unit: { fontSize: 11, fontWeight: "400", color: "#64748b" },
  twinSummary: { flexDirection: "row", justifyContent: "space-around", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#1e2e42" },
  twinText: { fontSize: 11, color: "#94a3b8" },
  waitingBox: { padding: 24, backgroundColor: "#101b29", borderRadius: 12, alignItems: "center", marginBottom: 20 },
  waitingText: { color: "#64748b", fontSize: 13 },
  chartTitle: { fontSize: 15, fontWeight: "600", color: "#f8fafc", marginBottom: 8 },
});
