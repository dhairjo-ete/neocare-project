import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export default function LiveChart({ data = [] }) {
  const [activeMetric, setActiveMetric] = useState("all");

  const formattedData = data.map((item) => {
    let timeStr = "";
    if (item.timestamp) {
      const d = new Date(item.timestamp);
      timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    return {
      ...item,
      timeFormatted: timeStr,
    };
  });

  return (
    <div className="live-chart-wrapper">
      <div className="chart-controls">
        <span className="chart-mode-label">Vital Parameter Stream:</span>
        <div className="chart-tab-group">
          <button
            type="button"
            className={`chart-tab ${activeMetric === "all" ? "active" : ""}`}
            onClick={() => setActiveMetric("all")}
          >
            Combined Overview
          </button>
          <button
            type="button"
            className={`chart-tab ${activeMetric === "heart_rate" ? "active" : ""}`}
            onClick={() => setActiveMetric("heart_rate")}
          >
            Heart Rate (bpm)
          </button>
          <button
            type="button"
            className={`chart-tab ${activeMetric === "spo2" ? "active" : ""}`}
            onClick={() => setActiveMetric("spo2")}
          >
            SpO₂ (%)
          </button>
          <button
            type="button"
            className={`chart-tab ${activeMetric === "temperature" ? "active" : ""}`}
            onClick={() => setActiveMetric("temperature")}
          >
            Temperature (°C)
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={formattedData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1e2e42" vertical={false} />
          <XAxis dataKey="timeFormatted" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#1e2e42" }} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#7e93ab", fontSize: 11, fontFamily: "IBM Plex Mono" }}
            axisLine={{ stroke: "#1e2e42" }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12, color: "#f8fafc" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />

          {(activeMetric === "all" || activeMetric === "heart_rate") && (
            <Line
              type="monotone"
              name="Heart Rate (bpm)"
              dataKey="heart_rate"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}

          {(activeMetric === "all" || activeMetric === "spo2") && (
            <Line
              type="monotone"
              name="SpO₂ (%)"
              dataKey="spo2"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}

          {(activeMetric === "all" || activeMetric === "temperature") && (
            <Line
              type="monotone"
              name="Temperature (°C)"
              dataKey="temperature"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
