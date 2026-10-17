#!/bin/bash

echo "==================================================="
echo "    NeoCare IoT Incubator System Launching..."
echo "==================================================="
echo ""

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "[1/3] Starting Backend Server..."
(cd "$DIR/backend" && npm run dev) &

echo "[2/3] Starting Web Monitoring Dashboard..."
(cd "$DIR/web-dashboard" && npm run dev) &

echo "[3/3] Starting Python Sensor Simulator..."
(cd "$DIR/simulator" && python3 simulator.py --interactive --devices incubator_01,incubator_02) &

echo ""
echo "==================================================="
echo "  NeoCare System Running! Visit http://localhost:5173"
echo "==================================================="
wait
