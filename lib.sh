#!/system/bin/sh
# void-autostart — shared shell helpers.
# Sourced by action.sh and service.sh. The WebUI does its own quoting in
# JS (shq in webui/script.js) since it talks to the device directly
# through window.Shizuku.exec(), not through these files.

PROTECTED_PACKAGES="android com.android.systemui com.android.settings com.google.android.gms com.hamondev.shevery moe.shizuku.privileged.api"

is_protected() {
  pkg="$1"
  for p in $PROTECTED_PACKAGES; do
    [ "$pkg" = "$p" ] && return 0
  done
  return 1
}

DENYLIST_FILE="/data/local/tmp/.void-autostart-denylist.json"
LOG_FILE="/data/local/tmp/.void-autostart.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE" 2>/dev/null
}

# Fast, single-call presence check. `pm path` exits non-zero when the package
# is not installed, so this avoids pulling the whole package list for a lookup.
pkg_installed() {
  pm path "$1" >/dev/null 2>&1
}
