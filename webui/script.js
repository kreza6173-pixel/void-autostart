(() => {
  "use strict";

  const DENYLIST_FILE = "/data/local/tmp/.void-autostart-denylist.json";
  const BOOT_ACTIONS = "BOOT_COMPLETED|LOCKED_BOOT_COMPLETED|QUICKBOOT_POWERON|MY_PACKAGE_REPLACED";

  const el = {
    bridgeWarning: document.getElementById("bridge-warning"),
    bridgeBadge: document.getElementById("bridge-badge"),
    tabs: document.querySelectorAll(".tab"),
    panels: document.querySelectorAll(".panel"),
    scanPkgInput: document.getElementById("scan-pkg-input"),
    scanPkgBtn: document.getElementById("scan-pkg-btn"),
    receiverScanList: document.getElementById("receiver-scan-list"),
    manualComponentInput: document.getElementById("manual-component-input"),
    manualAddBtn: document.getElementById("manual-add-btn"),
    disabledComponentsList: document.getElementById("disabled-components-list"),
    appSearch: document.getElementById("app-search"),
    appScopeUser: document.getElementById("app-scope-user"),
    appopsAppList: document.getElementById("appops-app-list"),
    scanAppopsBtn: document.getElementById("scan-appops-btn"),
    statComponents: document.getElementById("stat-components"),
    statAppops: document.getElementById("stat-appops"),
    reapplyBtn: document.getElementById("reapply-btn"),
    reapplyProgress: document.getElementById("reapply-progress"),
    consoleDrawer: document.getElementById("console-drawer"),
    consoleToggle: document.getElementById("console-toggle"),
    consoleBody: document.getElementById("console-body"),
    consoleCount: document.getElementById("console-count"),
    confirmBackdrop: document.getElementById("confirm-backdrop"),
    confirmTitle: document.getElementById("confirm-title"),
    confirmBody: document.getElementById("confirm-body"),
    confirmOk: document.getElementById("confirm-ok"),
    confirmCancel: document.getElementById("confirm-cancel"),
  };

  let consoleLines = 0;
  let denylist = { components: [], appops: [] }; // appops: [{pkg, op}]
  let appopsScan = []; // {pkg, runInBg: 'allowed'|'denied'|'na', runAnyInBg: same}

  // ---------- shell bridge (real contract: sync call, JSON-string result) ----------

  function bridgeAvailable() {
    return typeof window.Shizuku !== "undefined" && window.Shizuku !== null;
  }

  function shq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function logConsole(text, kind) {
    consoleLines++;
    el.consoleCount.textContent = String(consoleLines);
    const line = document.createElement("div");
    line.className = "console-line" + (kind ? ` ${kind}` : "");
    line.textContent = text;
    el.consoleBody.appendChild(line);
    el.consoleBody.scrollTop = el.consoleBody.scrollHeight;
    while (el.consoleBody.children.length > 300) {
      el.consoleBody.removeChild(el.consoleBody.firstChild);
    }
  }

  async function exec(cmd) {
    logConsole("$ " + cmd.split("\n")[0] + (cmd.indexOf("\n") !== -1 ? " …" : ""));
    if (!bridgeAvailable()) {
      logConsole("window.Shizuku is not available.", "err");
      return { ok: false, exitCode: -1, stdout: "", stderr: "window.Shizuku is not available", timedOut: false };
    }
    let raw;
    try {
      raw = window.Shizuku.exec(cmd);
    } catch (e) {
      logConsole(String(e), "err");
      return { ok: false, exitCode: -1, stdout: "", stderr: String(e), timedOut: false };
    }
    let res;
    try {
      res = JSON.parse(raw);
    } catch (e) {
      logConsole("unparseable bridge response: " + String(raw).slice(0, 200), "err");
      return { ok: false, exitCode: -1, stdout: "", stderr: "unparseable bridge response", timedOut: false };
    }
    if (res.stdout) logConsole(res.stdout.trim(), "ok");
    if (res.stderr) logConsole(res.stderr.trim(), "err");
    return res;
  }

  async function checkBridge() {
    if (!bridgeAvailable()) {
      el.bridgeBadge.textContent = "bridge unavailable";
      el.bridgeBadge.className = "bridge-badge error";
      el.bridgeWarning.classList.remove("hidden");
      return false;
    }
    const res = await exec("echo bridge-ok");
    const ok = !!(res.ok && res.stdout && res.stdout.indexOf("bridge-ok") !== -1);
    el.bridgeBadge.textContent = ok ? "bridge connected" : "bridge unavailable";
    el.bridgeBadge.className = "bridge-badge " + (ok ? "ok" : "error");
    el.bridgeWarning.classList.toggle("hidden", ok);
    return ok;
  }

  // ---------- confirm modal ----------

  function confirmAction(title, body) {
    el.confirmTitle.textContent = title;
    el.confirmBody.textContent = body;
    el.confirmBackdrop.classList.remove("hidden");
    return new Promise((resolve) => {
      const cleanup = (result) => {
        el.confirmBackdrop.classList.add("hidden");
        el.confirmOk.removeEventListener("click", onOk);
        el.confirmCancel.removeEventListener("click", onCancel);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      el.confirmOk.addEventListener("click", onOk);
      el.confirmCancel.addEventListener("click", onCancel);
    });
  }

  // ---------- tabs ----------

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      el.panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  el.consoleToggle.addEventListener("click", () => el.consoleDrawer.classList.toggle("open"));

  // ---------- denylist persistence ----------

  async function loadDenylist() {
    const res = await exec(`cat ${shq(DENYLIST_FILE)} 2>/dev/null`);
    if (res.stdout && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim());
        denylist = { components: parsed.components || [], appops: parsed.appops || [] };
      } catch (e) {
        logConsole("denylist.json is not valid JSON, starting fresh.", "err");
      }
    }
    renderDisabledComponents();
    updateDenylistStats();
  }

  async function saveDenylist() {
    await exec(`printf '%s' ${shq(JSON.stringify(denylist))} > ${shq(DENYLIST_FILE)}`);
    updateDenylistStats();
  }

  function updateDenylistStats() {
    el.statComponents.textContent = String(denylist.components.length);
    el.statAppops.textContent = String(denylist.appops.length);
  }

  // ---------- boot receiver scan ----------

  function renderScanResults(candidates) {
    if (candidates.length === 0) {
      el.receiverScanList.innerHTML = `<div class="empty-state">No boot receiver auto-detected — check the console for the raw dump, or add a component manually below.</div>`;
      return;
    }
    el.receiverScanList.innerHTML = candidates.map((comp) => `
      <div class="grant-row" data-comp="${comp}">
        <span class="grant-name">${comp}</span>
        <button class="btn btn-secondary disable-found-btn">Disable</button>
      </div>
    `).join("");
    el.receiverScanList.querySelectorAll(".disable-found-btn").forEach((btn) => {
      btn.addEventListener("click", () => disableComponent(btn.closest(".grant-row").dataset.comp));
    });
  }

  el.scanPkgBtn.addEventListener("click", async () => {
    const pkg = el.scanPkgInput.value.trim();
    if (!pkg) return;
    el.receiverScanList.innerHTML = `<div class="empty-state">Scanning…</div>`;
    const cmd = `dumpsys package ${shq(pkg)} | grep -B6 -E ${shq(BOOT_ACTIONS)} | grep -Eo ${shq(pkg + "/[A-Za-z0-9_.\\$]+")}`;
    const res = await exec(cmd);
    const candidates = res.stdout
      ? [...new Set(res.stdout.split("\n").map((s) => s.trim()).filter(Boolean))]
      : [];
    renderScanResults(candidates);
  });

  el.manualAddBtn.addEventListener("click", () => {
    const comp = el.manualComponentInput.value.trim();
    if (!comp || comp.indexOf("/") === -1) {
      logConsole("Component must be in package/Class form.", "err");
      return;
    }
    disableComponent(comp);
    el.manualComponentInput.value = "";
  });

  async function disableComponent(comp) {
    const ok = await confirmAction(
      "Disable this receiver?",
      `${comp} will no longer be able to run — including on boot. The rest of the app is unaffected. You can re-enable it any time from the list below.`
    );
    if (!ok) return;
    const res = await exec(`pm disable ${shq(comp)}`);
    if (!res.ok) {
      logConsole(`Failed to disable ${comp}: ${(res.stderr || res.stdout || "").slice(0, 150)}`, "err");
      return;
    }
    if (!denylist.components.includes(comp)) denylist.components.push(comp);
    await saveDenylist();
    renderDisabledComponents();
  }

  function renderDisabledComponents() {
    if (denylist.components.length === 0) {
      el.disabledComponentsList.innerHTML = `<div class="empty-state">None yet.</div>`;
      return;
    }
    el.disabledComponentsList.innerHTML = denylist.components.map((comp) => `
      <div class="grant-row" data-comp="${comp}">
        <span class="grant-name">${comp}</span>
        <button class="btn btn-ghost enable-btn">Re-enable</button>
      </div>
    `).join("");
    el.disabledComponentsList.querySelectorAll(".enable-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const comp = btn.closest(".grant-row").dataset.comp;
        await exec(`pm enable ${shq(comp)}`);
        denylist.components = denylist.components.filter((c) => c !== comp);
        await saveDenylist();
        renderDisabledComponents();
      });
    });
  }

  // ---------- background exec (appops) ----------

  function opStatus(text) {
    if (!text) return "na";
    if (/allow/i.test(text)) return "allowed";
    if (/ignore|deny/i.test(text)) return "denied";
    return "na";
  }

  function isDenied(pkg, op) {
    return denylist.appops.some((e) => e.pkg === pkg && e.op === op);
  }

  function renderAppopsList() {
    const filter = el.appSearch.value.trim().toLowerCase();
    const rows = appopsScan.filter((a) => !filter || a.pkg.toLowerCase().includes(filter));
    if (rows.length === 0) {
      el.appopsAppList.innerHTML = `<div class="empty-state">${appopsScan.length ? "No apps match your filter." : "Run a scan to list installed apps."}</div>`;
      return;
    }
    el.appopsAppList.innerHTML = rows.map((a) => `
      <div class="app-row appops-row" data-pkg="${a.pkg}">
        <div class="app-pkg">${a.pkg}</div>
        <div class="appops-badges">
          <span class="app-status ${a.runInBg === "denied" ? "denied" : a.runInBg === "na" ? "na" : "allowed"}" data-op="RUN_IN_BACKGROUND" title="RUN_IN_BACKGROUND">
            IN_BG: ${a.runInBg === "na" ? "N/A" : a.runInBg}
          </span>
          <span class="app-status ${a.runAnyInBg === "denied" ? "denied" : a.runAnyInBg === "na" ? "na" : "allowed"}" data-op="RUN_ANY_IN_BACKGROUND" title="RUN_ANY_IN_BACKGROUND">
            ANY_BG: ${a.runAnyInBg === "na" ? "N/A" : a.runAnyInBg}
          </span>
        </div>
      </div>
    `).join("");

    el.appopsAppList.querySelectorAll(".app-status").forEach((badge) => {
      badge.addEventListener("click", async () => {
        const row = badge.closest(".app-row");
        const pkg = row.dataset.pkg;
        const op = badge.dataset.op;
        const app = appopsScan.find((a) => a.pkg === pkg);
        const field = op === "RUN_IN_BACKGROUND" ? "runInBg" : "runAnyInBg";
        if (!app || app[field] === "na") return;
        const goingToDeny = app[field] !== "denied";
        await exec(`cmd appops set ${shq(pkg)} ${op} ${goingToDeny ? "deny" : "allow"}`);
        app[field] = goingToDeny ? "denied" : "allowed";
        if (goingToDeny) {
          if (!isDenied(pkg, op)) denylist.appops.push({ pkg, op });
        } else {
          denylist.appops = denylist.appops.filter((e) => !(e.pkg === pkg && e.op === op));
        }
        await saveDenylist();
        renderAppopsList();
      });
    });
  }

  el.appSearch.addEventListener("input", renderAppopsList);

  el.scanAppopsBtn.addEventListener("click", async () => {
    el.scanAppopsBtn.disabled = true;
    el.scanAppopsBtn.textContent = "Scanning…";
    el.appopsAppList.innerHTML = `<div class="empty-state">Scanning…</div>`;
    const scopeFlag = el.appScopeUser.checked ? "-3" : "";
    const cmd = [
      `for p in $(pm list packages ${scopeFlag} | sed 's/^package://'); do`,
      `  r1=$(cmd appops get "$p" RUN_IN_BACKGROUND 2>/dev/null | head -n1)`,
      `  r2=$(cmd appops get "$p" RUN_ANY_IN_BACKGROUND 2>/dev/null | head -n1)`,
      `  printf '%s|%s|%s\\n' "$p" "$r1" "$r2"`,
      `done`,
    ].join("\n");
    const res = await exec(cmd);
    const lines = (res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
    appopsScan = lines.map((line) => {
      const parts = line.split("|");
      const pkg = parts[0];
      return {
        pkg,
        runInBg: opStatus(parts[1]),
        runAnyInBg: opStatus(parts[2]),
      };
    }).sort((a, b) => a.pkg.localeCompare(b.pkg));
    el.scanAppopsBtn.disabled = false;
    el.scanAppopsBtn.textContent = "Scan installed apps";
    renderAppopsList();
  });

  // ---------- denylist reapply ----------

  function progressLog(container, text, kind) {
    container.classList.remove("hidden");
    const line = document.createElement("div");
    line.className = "progress-line" + (kind ? ` ${kind}` : "");
    line.textContent = text;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  el.reapplyBtn.addEventListener("click", async () => {
    el.reapplyBtn.disabled = true;
    el.reapplyProgress.innerHTML = "";
    el.reapplyProgress.classList.remove("hidden");
    progressLog(el.reapplyProgress, `Reapplying ${denylist.components.length} receiver(s) and ${denylist.appops.length} appops entrie(s)…`);

    for (const comp of denylist.components) {
      const res = await exec(`pm disable ${shq(comp)}`);
      progressLog(el.reapplyProgress, (res.ok ? "✓ " : "✗ ") + comp, res.ok ? "ok" : "err");
    }
    for (const entry of denylist.appops) {
      const res = await exec(`cmd appops set ${shq(entry.pkg)} ${entry.op} deny`);
      progressLog(el.reapplyProgress, (res.ok ? "✓ " : "✗ ") + `${entry.pkg} ${entry.op}`, res.ok ? "ok" : "err");
    }
    progressLog(el.reapplyProgress, "Done.", "ok");
    el.reapplyBtn.disabled = false;
  });

  // ---------- bridge retry / init ----------

  const bridgeRetryBtn = document.getElementById("bridge-retry-btn");
  if (bridgeRetryBtn) {
    bridgeRetryBtn.addEventListener("click", async () => {
      bridgeRetryBtn.disabled = true;
      bridgeRetryBtn.textContent = "Retrying…";
      const ok = await checkBridge();
      bridgeRetryBtn.disabled = false;
      bridgeRetryBtn.textContent = "Retry connection";
      if (ok) await loadDenylist();
    });
  }

  function init() {
    checkBridge().then((ok) => { if (ok) loadDenylist(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
