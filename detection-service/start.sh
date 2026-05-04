#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "Creating Python venv (using python3.11 — paddlepaddle has no wheels for 3.13/3.14 yet)..."
  python3.11 -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  echo "Installing dependencies (this is the slow part — 5-15 minutes for paddlepaddle + ultralytics)..."
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

echo "Starting detection service on http://localhost:${DETECTION_PORT:-8005}..."
echo "First boot downloads ~500 MB of model weights from HuggingFace; subsequent boots are fast."
python main.py
