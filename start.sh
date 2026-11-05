#!/usr/bin/env bash
# Serves Kreide on this computer only (not reachable from the network) and opens it.
# Always use the same address (http://localhost:8642) — the browser stores your
# classes per address, so a different port or 127.0.0.1 would show an empty app.
cd "$(dirname "$0")"
PORT="${PORT:-8642}"
URL="http://localhost:$PORT/"

python3 serve.py "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
sleep 0.6
echo "Kreide running at $URL (Ctrl+C to stop)"
(xdg-open "$URL" || open "$URL") >/dev/null 2>&1 &
wait $SERVER
