import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function HistoryChart({ data, dataKey, color = "var(--spo2)" }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="#1e2e42" vertical={false} />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          tick={{ fill: "#7e93ab", fontSize: 11, fontFamily: "IBM Plex Mono" }}
          axisLine={{ stroke: "#1e2e42" }}
          tickLine={false}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fill: "#7e93ab", fontSize: 11, fontFamily: "IBM Plex Mono" }}
          axisLine={{ stroke: "#1e2e42" }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: "#142234", border: "1px solid #1e2e42", borderRadius: 6, fontSize: 12 }}
          labelFormatter={(t) => new Date(t).toLocaleString()}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
