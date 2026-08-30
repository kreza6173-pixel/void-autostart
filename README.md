# VOID//AUTOSTART

**Autostart & Boot Manager** — a Shevery ADB module for stopping apps from
launching themselves at boot or via background broadcasts, the clean
open-source way. No root required.

This category is common on Chinese OEM ROMs (自启动管理) but rarely exists
as a clean, open-source, no-root implementation for a global audience —
that's the gap this fills.

## Two independent control layers

This module doesn't pretend there's one silver-bullet command for
"autostart." There are two real, distinct Android mechanisms, and it's
honest about what each one actually does:

1. **Boot Receivers** (surgical) — disables the *specific component* an app
   registered for `BOOT_COMPLETED` and similar broadcasts, via
   `pm disable <pkg>/<Receiver>`. The rest of the app keeps working
   normally; it just can't react to that broadcast anymore.
2. **Background Execution / AppOps** (broad) — denies `RUN_IN_BACKGROUND`
   and/or `RUN_ANY_IN_BACKGROUND` for an app via `cmd appops set`. This is
   blunter: it affects the app's ability to run *anything* in the
   background, not just its boot receiver, but needs no per-app detective
   work to use.

Use receiver disabling when you want to be surgical about one specific app.
Use AppOps denial when you want a broad "keep this app foreground-only"
rule and don't care about the distinction.
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/3cd5fa3b-44db-40f3-968d-f76242add4ad" />
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/e07b868e-b792-4f0a-bfb4-ecf59631dd58" />
<img width="1080" height="2400" alt="Image" src="https://github.com/user-attachments/assets/b41b7bda-4627-4d5e-9d79-8286c35ef662" />

## Features

- 🔍 **Best-effort boot receiver scanner** — greps `dumpsys package` for
  receivers near a `BOOT_COMPLETED`-family action string, so you don't have
  to read raw dumps yourself. Falls back honestly to raw output + a manual
  "add component" field when detection comes up empty.
- 🚫 **Per-app AppOps background-execution control** — scan every installed
  app's `RUN_IN_BACKGROUND` / `RUN_ANY_IN_BACKGROUND` state, toggle either.
- 💾 **Saved denylist, reapplied on boot** — every receiver you disable and
  every AppOps denial you set is remembered and automatically reapplied
  when Shevery starts this module's session, as a safety net against OEM
  ROMs or app updates that quietly reset these settings. A manual
  "Reapply now" button does the same on demand.
- 🖥 **Console drawer** — every shell command this module runs, and its raw
  output, is visible in-app.

## Requirements

- [Shevery](https://github.com/HmnDev-Tech/shevery) with this module's
  access mode set to **Full**, or **Custom** with "WebUI shell bridge"
  enabled.
- No root needed — both `pm disable`/`pm enable` and `cmd appops set` work
  over plain ADB/Shizuku shell access.

## Install

**From a release ZIP:** ADB Modules → Import → select the ZIP.
**Important:** `module.prop` must sit at the *root* of the ZIP:

```bash
git clone https://github.com/kreza6173-pixel/void-autostart.git
cd void-autostart
zip -r ../void-autostart.zip . -x ".git/*"
```

## Architecture

```
void-autostart/
├── module.prop      # Module manifest (usesShellBridge=true)
├── lib.sh            # Shared shell helpers (protected-package guard, denylist path)
├── action.sh          # Read-only summary shown on the module's Action button
├── service.sh          # Reapplies the saved denylist on boot/session start
├── webui/
│   ├── index.html        # Boot Receivers / Background Exec / Denylist tabs
│   ├── style.css           # Dark theme, matches the VOID module series
│   └── script.js             # window.Shizuku.exec() shell bridge + all UI logic
├── LICENSE
└── README.md
```

## How it works

| Feature | Shell mechanism |
|---|---|
| Boot receiver scan | `dumpsys package <pkg>`, grepped for `BOOT_COMPLETED`/`LOCKED_BOOT_COMPLETED`/`QUICKBOOT_POWERON`/`MY_PACKAGE_REPLACED` near a component name |
| Disable / re-enable receiver | `pm disable <pkg>/<Component>` / `pm enable <pkg>/<Component>` |
| Background exec read | `cmd appops get <pkg> RUN_IN_BACKGROUND` / `RUN_ANY_IN_BACKGROUND` |
| Background exec write | `cmd appops set <pkg> <op> <allow\|deny>` |
| Denylist | JSON file at `/data/local/tmp/.void-autostart-denylist.json`, written by the WebUI, reapplied by `service.sh` and mirrored by the "Reapply now" button |

## Safety architecture

| Guard | What it does |
|---|---|
| Protected-package list | Core system/Shizuku/Shevery packages are excluded — `service.sh` skips them even if they somehow ended up in a saved denylist (`lib.sh:PROTECTED_PACKAGES`) |
| Explicit confirmation | Disabling a receiver shows a confirm dialog explaining exactly what it does and that it's reversible; re-enabling and toggling AppOps don't need one since they're just as reversible in the other direction |
| No hidden state | Every exec()'d command and its raw stdout/stderr is logged to the in-app console drawer |
| Manifest-driven reapply | `service.sh` only ever acts on entries that are actually in the saved denylist — it never guesses |

## Known limitations

- **Boot receiver detection is heuristic, not a manifest parser.** It greps
  `dumpsys package` output for a component name near a boot-related action
  string — this works for most apps, but dump formatting has some
  variance across Android versions/OEMs. When it comes up empty, the raw
  dump is in the console drawer, and the manual "Add to disable list"
  field lets you enter a known component directly.
- **AppOps denial is coarse.** `RUN_IN_BACKGROUND`/`RUN_ANY_IN_BACKGROUND`
  affects *all* background activity for an app, not just its boot
  behavior — a messaging app denied this way may also stop delivering
  notifications promptly. Prefer receiver-level disabling when you only
  want to stop autostart specifically.
- **This isn't a full manifest/component editor.** It only manages
  enabled-state for components you've found or entered — it doesn't list
  or explain every component an app has.

## License

MIT — see [LICENSE](LICENSE).
