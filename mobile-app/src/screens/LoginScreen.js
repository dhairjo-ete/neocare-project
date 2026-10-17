import { useState } from "react";
import { View, Text, TextInput, Button } from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  async function handleLogin() {
    setError("");
    setStatusMsg("");
    try {
      const { data } = await axios.post(`${API_URL || "http://localhost:5000/api"}/auth/login`, { email, password });
      await AsyncStorage.setItem("neocare_token", data.token);
      if (data.user) {
        await AsyncStorage.setItem("neocare_user", JSON.stringify(data.user));
      }
      navigation.replace("Dashboard");
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.code === "EMAIL_NOT_VERIFIED") {
        setStatusMsg("Email not verified. Please check your inbox for the verification link.");
      } else if (resp?.code === "AWAITING_APPROVAL") {
        setStatusMsg(resp.error || "Account awaiting administrator approval.");
      } else {
        setError(resp?.error || "Invalid email or password");
      }
    }
  }

  return (
    <View style={{ padding: 24, marginTop: 80 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 6 }}>NeoCare Mobile</Text>
      <Text style={{ fontSize: 14, color: "#666", marginBottom: 20 }}>Clinical Staff & Telemetry Access</Text>

      {statusMsg ? (
        <View style={{ backgroundColor: "#FFFBEB", borderColor: "#F59E0B", borderWidth: 1, padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <Text style={{ color: "#B45309", fontSize: 13 }}>{statusMsg}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ backgroundColor: "#FEF2F2", borderColor: "#EF4444", borderWidth: 1, padding: 12, borderRadius: 6, marginBottom: 16 }}>
          <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <TextInput
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, marginBottom: 12, padding: 10 }}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 6, marginBottom: 20, padding: 10 }}
      />
      <Button title="Log in" onPress={handleLogin} color="#0284c7" />
    </View>
  );
}
