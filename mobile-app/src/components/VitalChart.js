import { View, Text, Dimensions } from "react-native";
import { LineChart } from "react-native-chart-kit";

export default function VitalChart({ label, values }) {
  const screenWidth = Dimensions.get("window").width - 32;

  if (!values.length) return <Text>Waiting for data...</Text>;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontWeight: "600", marginBottom: 4 }}>{label}</Text>
      <LineChart
        data={{ labels: [], datasets: [{ data: values }] }}
        width={screenWidth}
        height={160}
        chartConfig={{
          backgroundColor: "#fff",
          backgroundGradientFrom: "#fff",
          backgroundGradientTo: "#fff",
          decimalPlaces: 1,
          color: () => "#3498db",
        }}
        withDots={false}
        bezier
      />
    </View>
  );
}
