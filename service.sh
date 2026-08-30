#!/system/bin/sh
# void-autostart — service.sh
#
# Runs once when Shevery starts this module's session (e.g. on boot).
# Re-applies the saved denylist: disables each saved boot-receiver
# component, and re-denies each saved AppOps entry. This exists because
# some OEM ROMs and app updates silently re-enable components or reset
# AppOps state — the WebUI also exposes a manual "Reapply now" button that
# runs this same logic on demand.
#
# denylist.json is always written by the WebUI via JSON.stringify(), so it
# is guaranteed compact single-line JSON with this exact shape:
#   {"components":["pkg/Class","pkg2/Class2"],"appops":[{"pkg":"p","op":"OP"}]}
# The parsing below relies on that exact, controlled format — it is not a
# general-purpose JSON parser.

DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

[ -f "$DENYLIST_FILE" ] || exit 0
json="$(cat "$DENYLIST_FILE" 2>/dev/null)"
[ -n "$json" ] || exit 0

components_blob="$(printf '%s' "$json" | sed -n 's/.*"components":\[\([^]]*\)\].*/\1/p')"
if [ -n "$components_blob" ]; then
  printf '%s\n' "$components_blob" | tr ',' '\n' | sed 's/^"//; s/"$//' | while IFS= read -r comp; do
    [ -n "$comp" ] || continue
    pkg="${comp%%/*}"
    if is_protected "$pkg"; then
      log "skipped protected package in components: $comp"
      continue
    fi
    pm disable "$comp" >/dev/null 2>&1
    log "disabled component: $comp"
  done
fi

appops_blob="$(printf '%s' "$json" | sed -n 's/.*"appops":\[\(.*\)\]}$/\1/p')"
if [ -n "$appops_blob" ]; then
  printf '%s\n' "$appops_blob" | sed 's/},{/}\n{/g' | while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    pkg="$(printf '%s' "$entry" | sed -n 's/.*"pkg":"\([^"]*\)".*/\1/p')"
    op="$(printf '%s' "$entry" | sed -n 's/.*"op":"\([^"]*\)".*/\1/p')"
    [ -n "$pkg" ] && [ -n "$op" ] || continue
    if is_protected "$pkg"; then
      log "skipped protected package in appops: $pkg"
      continue
    fi
    cmd appops set "$pkg" "$op" deny >/dev/null 2>&1
    log "denied appop: $pkg $op"
  done
fi

log "denylist reapplied"
