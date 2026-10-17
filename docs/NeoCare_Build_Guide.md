# NeoCare — Complete Build Guide
### IoT-Enabled Neonatal Incubator Monitoring System (Web + Mobile)

---

## 1. System Architecture

```
[Python Sensor Simulator]
        │  publishes JSON (HR, SpO2, Temp) every N sec
        ▼
   [MQTT Broker - HiveMQ Cloud]
        │  subscribed by backend
        ▼
[Node.js + Express Backend] ──writes──▶ [MongoDB Atlas]
        │        ▲
        │ Socket.io (real-time push)   │ REST API (history, auth, config)
        ▼        │
[React.js Web Dashboard]         [React Native Mobile App]
                                        │
                                        ▼
                           [Firebase Cloud Messaging – push alerts]
```

**Data flow:** Simulator → MQTT → Backend (subscriber) → MongoDB (persist) + Socket.io (broadcast live) → Web/Mobile clients. Backend also runs threshold checks → triggers FCM push on abnormal readings.

---

## 2. Repository Structure

```
neocare/
├── simulator/          # Python MQTT publisher
├── backend/            # Node.js + Express + Socket.io
├── web-dashboard/       # React.js
├── mobile-app/          # React Native
└── docs/
```

---

## 3. Build Order (recommended sequence)

| Phase | Component | Goal |
|---|---|---|
| 1 | MQTT setup + Python simulator | Confirm data publishes correctly |
| 2 | Backend subscriber + MongoDB | Persist incoming data |
| 3 | Backend REST API + Socket.io | Serve history + live stream |
| 4 | Web dashboard | Visualize live + historical data |
| 5 | Alert engine + FCM | Push abnormal-condition notifications |
| 6 | React Native app | Mobile view + notifications |
| 7 | Auth, deployment, polish | Production-ready demo |

---

## 4. Python Sensor Simulator

**Libraries:** `paho-mqtt`, `random`, `time`, `json`

**Design:**
- Simulate 1+ virtual "incubator" (use `device_id` field so it scales to multiple babies later)
- Generate realistic ranges with occasional injected anomalies:
  - Heart Rate: 120–160 bpm normal (neonate range), spike/drop for anomaly testing
  - SpO₂: 95–100% normal, drop below 90% for alert testing
  - Temperature: 36.5–37.5°C normal
- Publish to topic: `neocare/{device_id}/vitals` every 2–5 seconds
- Payload example:
```json
{"device_id":"incubator_01","heart_rate":142,"spo2":97,"temperature":36.8,"timestamp":"2026-08-01T10:00:00Z"}
```
- Use Gaussian noise (`random.gauss`) instead of pure random for realistic waveforms
- Add a `--anomaly` flag or random 2% chance per cycle to simulate emergencies (for demoing alerts)

---

## 5. MQTT (HiveMQ Cloud)

- Create free HiveMQ Cloud cluster → get host, port (8883 TLS), username/password
- Topic structure: `neocare/<device_id>/vitals` (publish), `neocare/<device_id>/status` (online/offline via LWT — Last Will and Testament)
- Use TLS (port 8883) always — never plaintext MQTT for a health-adjacent demo
- Backend subscribes with wildcard: `neocare/+/vitals`

---

## 6. Backend (Node.js + Express + Socket.io)

**Core modules:**
- `mqttClient.js` — connects to HiveMQ, subscribes, parses payload, calls save + broadcast
- `models/Vital.js` — Mongoose schema: `{device_id, heart_rate, spo2, temperature, timestamp}`
- `models/Alert.js` — `{device_id, type, value, severity, acknowledged, timestamp}`
- `services/alertEngine.js` — threshold logic (see §8)
- `routes/vitals.js` — REST: `GET /api/vitals/:deviceId?from&to` (history), `GET /api/vitals/:deviceId/latest`
- `routes/alerts.js` — `GET /api/alerts`, `PATCH /api/alerts/:id/acknowledge`
- `routes/auth.js` — JWT login/register (see §10)
- `socket.js` — on new vital: `io.emit('vitals:update', data)`; on alert: `io.emit('alert:new', alert)`

**MongoDB Atlas:**
- Free M0 cluster, whitelist IP or `0.0.0.0/0` for dev
- Index on `{device_id: 1, timestamp: -1}` for fast history queries
- Consider a TTL index or scheduled downsampling if storing high-frequency data long-term (see Advanced §12.3)

---

## 7. Web Dashboard (React.js)

**Structure:**
```
src/
├── components/
│   ├── VitalCard.jsx        # HR / SpO2 / Temp live tiles
│   ├── LiveChart.jsx        # real-time line chart (recharts)
│   ├── HistoryChart.jsx     # historical range view
│   ├── AlertPanel.jsx       # active alerts list
│   └── DeviceSelector.jsx   # for multi-incubator support
├── hooks/
│   └── useSocket.js         # socket.io-client wrapper
├── pages/
│   ├── Dashboard.jsx
│   ├── Login.jsx
│   └── History.jsx
└── context/AuthContext.jsx
```

**Key implementation points:**
- `socket.io-client` connects on mount, listens for `vitals:update`, updates state → re-renders chart
- Use `recharts` or `chart.js` for live rolling-window charts (last 60 data points)
- Color-code vitals: green (normal) / amber (warning) / red (critical) based on thresholds
- Alert banner/toast (e.g., `react-toastify`) triggered on `alert:new` socket event
- Protect routes with JWT stored in httpOnly cookie or memory (avoid localStorage for tokens if possible)

---

## 8. Alert / Threshold Engine

| Vital | Normal | Warning | Critical |
|---|---|---|---|
| Heart Rate | 120–160 bpm | 100–119 or 161–180 | <100 or >180 |
| SpO₂ | 95–100% | 90–94% | <90% |
| Temperature | 36.5–37.5°C | 36.0–36.4 or 37.6–38.0 | <36.0 or >38.0 |

- Run on every incoming MQTT message in backend
- Debounce: require 2–3 consecutive abnormal readings before firing an alert (avoids false positives from sensor noise)
- On critical alert → save to `Alert` collection → emit socket event → trigger FCM push

---

## 9. Mobile App (React Native)

- Use **Firebase Cloud Messaging** for push notifications (critical alerts) even when app is backgrounded
- Screens: Login, Dashboard (live vitals, same socket.io-client connection), Alerts, History
- Use `react-native-chart-kit` or `victory-native` for charts
- Request notification permissions on first launch; store FCM token in backend tied to user for targeted push
- Handle foreground vs background notification display differently (foreground: in-app banner; background: OS notification)

---

## 10. Authentication & Roles

- JWT-based auth (`bcrypt` for password hashing)
- Roles: `admin`, `nurse/caregiver`, `viewer` — gate acknowledge/dismiss-alert actions to nurse/admin only
- Middleware: `verifyToken`, `requireRole(role)`

---

## 11. Deployment

| Component | Suggested Host |
|---|---|
| Backend | Render / Railway (free tier) |
| Web dashboard | Vercel / Netlify |
| MongoDB | Atlas (already cloud) |
| MQTT | HiveMQ Cloud (already cloud) |
| Mobile | Expo EAS build → APK for demo, or Expo Go for dev |

---

## 12. Advanced Features (to elevate the project)

1. **Anomaly detection with ML** — train a lightweight model (Isolation Forest / simple LSTM) on simulated normal patterns to flag subtle deviations before they cross hard thresholds. Great for a "novelty" section in your report.
2. **Multi-incubator dashboard** — support N simulated babies simultaneously with a grid/overview view and per-device drill-down (your `device_id` field already supports this).
3. **Data downsampling / aggregation job** — cron job to compress raw high-frequency data into 1-min averages after 24h, keeping DB lean while preserving trend history.
4. **Audit trail** — log every alert acknowledgment (who, when) for accountability — relevant since it's healthcare-adjacent.
5. **Offline-first mobile** — cache last known state locally (AsyncStorage) so caregivers see last reading even if connectivity drops.
6. **Predictive trend line** — simple linear regression on last N points to show "trending toward critical" warning before threshold breach.
7. **Voice/SMS escalation** — if a critical alert isn't acknowledged within X minutes, escalate via Twilio SMS/call (strong "real-world completeness" feature).
8. **Digital twin visualization** — simple animated incubator SVG on the dashboard reflecting live vitals (visually impressive for demo/viva).
9. **Role-based multi-tenant support** — simulate multiple hospitals/wards, each with isolated device sets.

---

## 13. Security Checklist (mention in report — matters for healthcare-adjacent systems)

- TLS everywhere (MQTT 8883, HTTPS for API)
- JWT expiry + refresh tokens
- Input validation on all MQTT payloads before DB insert (reject malformed data)
- Rate-limit API endpoints
- Environment variables for all secrets (never commit `.env`)

---

## 14. Suggested Timeline (for a semester project)

| Week | Task |
|---|---|
| 1–2 | MQTT + simulator + backend subscriber |
| 3 | MongoDB schema + REST API |
| 4–5 | Web dashboard (live + history) |
| 6 | Alert engine + FCM setup |
| 7–8 | React Native app |
| 9 | Auth + roles |
| 10 | Advanced feature (pick 1–2 from §12) |
| 11 | Deployment |
| 12 | Testing, report, demo prep |
