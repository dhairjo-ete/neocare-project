# NeoCare — IoT-Enabled Neonatal Incubator Monitoring System

An academic prototype demonstrating real-time IoT monitoring, cloud data
pipelines, and mobile alerting for simulated neonatal vital signs.

## Project structure

- `simulator/` — Python script that publishes fake vital-sign data over MQTT
- `backend/` — Node.js + Express + Socket.io API, MQTT subscriber, alert engine
- `web-dashboard/` — React (Vite) live monitoring dashboard
- `mobile-app/` — React Native (Expo) mobile app with push alerts
- `docs/` — project write-up and build guide

## Quick start

**1. Simulator**
```bash
cd simulator
pip install -r requirements.txt
cp .env.example .env   # fill in your HiveMQ credentials
python simulator.py
```

**2. Backend**
```bash
cd backend
npm install
cp .env.example .env   # fill in MongoDB URI, HiveMQ creds, JWT secret
npm run dev
```

**3. Web dashboard**
```bash
cd web-dashboard
npm install
cp .env.example .env
npm run dev
```

**4. Mobile app**
```bash
cd mobile-app
npm install
cp .env.example .env
npx expo start
```

## Tech stack

Python · MQTT (HiveMQ Cloud) · Node.js · Express · Socket.io · MongoDB Atlas ·
React.js · React Native (Expo) · Firebase Cloud Messaging

## Note

This project is an academic prototype for demonstrating IoT system
integration. It is not intended for clinical use.
