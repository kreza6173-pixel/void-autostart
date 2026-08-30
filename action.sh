#!/system/bin/sh
# void-autostart — Action button summary. Read-only: prints current state.

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

if [ -f "$DENYLIST_FILE" ]; then
  comp_count="$(grep -o '"components"[^]]*\]' "$DENYLIST_FILE" 2>/dev/null | grep -o '/' | grep -c .)"
  appops_count="$(grep -o '"appops"[^}]*}' "$DENYLIST_FILE" 2>/dev/null | grep -o ':' | grep -c .)"
else
  comp_count=0
  appops_count=0
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
