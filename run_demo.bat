@echo off
title NeoCare IoT Monitoring System Launcher
echo ===================================================
echo     NeoCare IoT Incubator System Launching...
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Backend Server (Node.js + Express + Socket.io)...
start "NeoCare Backend" cmd /k "cd backend && npm run dev"

timeout /t 2 >nul

echo [2/3] Starting Web Monitoring Dashboard (Vite + React)...
start "NeoCare Web Dashboard" cmd /k "cd web-dashboard && npm run dev"

timeout /t 2 >nul

echo [3/3] Starting Python Vitals & Telemetry Sensor Simulator...
start "NeoCare Sensor Simulator" cmd /k "cd simulator && python simulator.py --interactive --devices incubator_01,incubator_02"

timeout /t 3 >nul

echo.
echo ===================================================
echo  NeoCare Demo Running!
echo  Opening Web Dashboard at http://localhost:5173 ...
echo ===================================================
start http://localhost:5173

pause
