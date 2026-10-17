import { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";
import { getSocket } from "../services/socket";

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 20));
    socket.on("alert:new", handler);
    return () => socket.off("alert:new", handler);
  }, []);

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, marginBottom: 12 }}>Alerts</Text>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={{ padding: 10, marginBottom: 6, backgroundColor: item.severity === "critical" ? "#fdecea" : "#fff8e1", borderRadius: 6 }}>
            <Text>{item.severity.toUpperCase()} — {item.device_id}: {item.type} = {item.value}</Text>
          </View>
        )}
        ListEmptyComponent={<Text>No active alerts.</Text>}
      />
    </View>
  );
}
