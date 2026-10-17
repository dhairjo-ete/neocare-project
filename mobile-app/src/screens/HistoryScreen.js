import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import VitalChart from "../components/VitalChart";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function HistoryScreen() {
  const [data, setData] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = API_URL || "http://localhost:5000/api";
        const token = await AsyncStorage.getItem("neocare_token");
        const headers = { Authorization: `Bearer ${token}` };
        // Device IDs are generated per incubator, so ask the server for ours
        const devices = (await axios.get(`${base}/vitals/devices`, { headers })).data;
        if (!devices.length) {
          if (!cancelled) setError("No incubators found for your hospital.");
          return;
        }
        const id = devices[0];
        const res = await axios.get(`${base}/vitals/${id}`, { headers });
        if (!cancelled) {
          setDeviceId(id);
          setData([...res.data].reverse());
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || "Could not load history.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, marginBottom: 12 }}>History — {deviceId || "…"}</Text>
      {error ? <Text style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</Text> : null}
      <VitalChart label="Heart Rate" values={data.map((d) => d.heart_rate)} />
    </View>
  );
}
