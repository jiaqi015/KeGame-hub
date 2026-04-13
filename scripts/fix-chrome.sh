#!/usr/bin/env bash

set -euo pipefail

CHROME_APP="/Applications/Google Chrome.app"
STALE_PATTERN="playwright_chromiumdev_profile"

if [[ ! -d "$CHROME_APP" ]]; then
  echo "Google Chrome.app not found in /Applications"
  exit 1
fi

echo "Checking for stale Playwright Chrome processes..."
stale_processes="$(ps aux | grep -i 'Google Chrome' | grep "$STALE_PATTERN" || true)"

if [[ -n "$stale_processes" ]]; then
  echo "Found stale automation Chrome processes. Cleaning them up..."
  printf '%s\n' "$stale_processes"
  pkill -f "$STALE_PATTERN" || true
  sleep 1
else
  echo "No stale Playwright Chrome processes found."
fi

echo "Launching Google Chrome..."
open -a "Google Chrome"

osascript >/dev/null <<'APPLESCRIPT'
tell application "Google Chrome"
  activate
  if (count of windows) is 0 then
    make new window
  end if
end tell
APPLESCRIPT

window_count="$(osascript -e 'tell application "Google Chrome" to count of windows' 2>/dev/null || echo 0)"
echo "Chrome is ready. Visible windows: ${window_count}"
