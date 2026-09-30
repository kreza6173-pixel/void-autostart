#!/system/bin/sh
# void-autostart — Action button summary. Read-only: prints current state.

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

if [ -f "$DENYLIST_FILE" ]; then
  json="$(cat "$DENYLIST_FILE" 2>/dev/null)"
else
  json=""
fi
[ -n "$json" ] || json='{}'

# Components: count quoted "pkg/Class" entries inside the components array.
comp_blob="$(printf '%s' "$json" | sed -n 's/.*"components":\[//p' | sed 's/].*//')"
if [ -z "$comp_blob" ]; then
  comp_count=0
else
  comp_count=$(printf '%s' "$comp_blob" | grep -o '"' | wc -l)
  comp_count=$((comp_count / 2))
fi

# AppOps: count {"pkg":...} objects inside the appops array.
appops_blob="$(printf '%s' "$json" | sed -n 's/.*"appops":\[//p' | sed 's/].*//')"
if [ -z "$appops_blob" ]; then
  appops_count=0
else
  appops_count=$(printf '%s\n' "$appops_blob" | sed 's/},{/}\n{/g' | grep -c '{"pkg":')
fi

uid_line="$(id 2>/dev/null)"
case "$uid_line" in
  *"uid=0(root)"*) mode_label="root" ;;
  *) mode_label="adb/shell" ;;
esac

echo "Mode: $mode_label"
echo "Disabled boot receivers (saved): ~$comp_count"
echo "AppOps denylist entries (saved): ~$appops_count"
echo "Denylist file: $DENYLIST_FILE"
