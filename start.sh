#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$ROOT/detection-service/venv" ]; then
  echo "ERROR: Python venv missing for detection-service."
  echo "First-time setup:"
  echo "  cd detection-service"
  echo "  python3.11 -m venv venv"
  echo "  source venv/bin/activate"
  echo "  pip install -r requirements.txt   # 5-15 min, ~3 GB"
  echo "  deactivate"
  exit 1
fi

if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "Installing backend deps..."
  (cd "$ROOT/backend" && npm install)
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend deps..."
  (cd "$ROOT/frontend" && npm install)
fi

echo "Starting detection service on http://localhost:8005..."
(cd "$ROOT/detection-service" && source venv/bin/activate && python main.py) &
DETECT_PID=$!

trap "kill $DETECT_PID 2>/dev/null; pkill -f 'node server.js' 2>/dev/null; pkill -f 'vite' 2>/dev/null" EXIT

echo "Waiting for detection service to be ready (model downloads may take a few minutes on first boot)..."
for i in $(seq 1 240); do
  if curl -s http://localhost:8005/health > /dev/null 2>&1; then
    echo "Detection service is up."
    break
  fi
  sleep 1
done

echo "Starting backend on http://localhost:3011..."
(cd "$ROOT/backend" && npm run dev) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend on http://localhost:5176..."
cd "$ROOT/frontend" && npm run dev
