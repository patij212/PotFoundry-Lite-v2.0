#!/usr/bin/env bash
# Lightweight helper to start the Streamlit app in this workspace.
# Usage: ./start_streamlit.sh
set -euo pipefail
cd "$(dirname "$0")"
# Ensure the workspace is on PYTHONPATH so relative imports work when run from the script
export PYTHONPATH="${PYTHONPATH:-}:${PWD}"
echo "Starting Streamlit from ${PWD} (logs -> /tmp/streamlit.log)"
# Kill any previous Streamlit instances we started (safe — matches python -m streamlit)
pkill -f "python -m streamlit" || true
# Remove old log so tail shows current run only
rm -f /tmp/streamlit.log || true
# Run in background and log to /tmp/streamlit.log
python -m streamlit run app.py &> /tmp/streamlit.log &
sleep 0.5
echo "Streamlit launched (PID: $!). Tail logs with: tail -n +1 -f /tmp/streamlit.log"
