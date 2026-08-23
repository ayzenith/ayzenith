const {
  app, BrowserWindow, shell, Menu, Tray, Notification,
  nativeImage, session, globalShortcut,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/**
 * AYZENITH Panel — the desktop shell around Business OS.
 *
 * It is still a single window on the live site, but it is now a resident
 * program rather than a browser tab: it lives in the system tray, keeps asking
 * the cockpit what needs attention, and raises a native Windows notification
 * when that answer changes. Closing the window hides it; only the tray's
 * "Çıkış" actually quits.
 */

const ORIGIN = "https://www.ayzenith.com";
const START_URL = `${ORIGIN}/os`;
const ALERTS_URL = `${ORIGIN}/api/os/alerts`;
// Anything not on the AYZENITH domain opens in the system browser instead of
// navigating inside the app window — this window exists to show one site, not
// to become a general-purpose browser.
const ALLOWED_HOST = "ayzenith.com";

const POLL_MS = 5 * 60 * 1000; // Every 5 minutes; the endpoint is six COUNTs.
const FIRST_POLL_MS = 20 * 1000; // Give the window time to sign in first.
const REPEAT_SILENCE_MS = 60 * 60 * 1000; // Do not re-nag the same alerts.

let win = null;
let tray = null;
let pollTimer = null;
let quitting = false;
/** Signature of the last alert set we notified about, and when. */
let lastNotified = { signature: "", at: 0 };

// ---------------------------------------------------------------------------
// Preferences — a small JSON file in userData. Deliberately not electron-store:
// three booleans do not justify a dependency.
// ---------------------------------------------------------------------------

const PREFS_FILE = () => path.join(app.getPath("userData"), "panel-settings.json");
const DEFAULT_PREFS = { notifications: true, startAtLogin: false, startMinimized: false };
let prefs = { ...DEFAULT_PREFS };

function loadPrefs() {
  try {
    prefs = { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(PREFS_FILE(), "utf8")) };
  } catch {
    prefs = { ...DEFAULT_PREFS }; // Missing or corrupt file → defaults, never a crash.
  }
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_FILE(), JSON.stringify(prefs, null, 2));
  } catch {
    /* A failed preference write must not take the app down. */
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function iconImage() {
  const img = nativeImage.createFromPath(path.join(__dirname, "icon.png"));
  return img.isEmpty() ? null : img;
}

function createWindow({ show = true } = {}) {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show,
    title: "AYZENITH Panel",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    backgroundColor: "#0b1220",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const host = new URL(url).host;
    if (host !== ALLOWED_HOST && !host.endsWith(`.${ALLOWED_HOST}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Closing hides to tray. Without this the notifications would die with the
  // window, which is the whole point of having them.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
    notifyOnce(
      "hidden-to-tray",
      "AYZENITH Panel arka planda",
      "Program kapanmadı — saatin yanındaki simgeden geri açabilirsin.",
    );
  });

  win.on("closed", () => {
    win = null;
  });

  win.loadURL(START_URL);
  return win;
}

/** Bring the window up, creating it if it was closed, optionally at a path. */
function showWindow(routePath) {
  if (!win) createWindow({ show: true });
  if (routePath) win.loadURL(`${ORIGIN}${routePath}`);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWindow() {
  if (win && win.isVisible() && !win.isMinimized() && win.isFocused()) win.hide();
  else showWindow();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** One-off informational toasts (the tray hint), shown at most once per run. */
const shownOnce = new Set();
function notifyOnce(key, title, body) {
  if (shownOnce.has(key) || !Notification.isSupported()) return;
  shownOnce.add(key);
  new Notification({ title, body, icon: iconImage() ?? undefined }).show();
}

function notifyAlerts(items) {
  if (!Notification.isSupported()) return;
  const top = items[0];
  const rest = items.slice(1).map((i) => i.label);
  const href = top.href || "/os";
  const n = new Notification({
    title: `AYZENITH · ${top.label}`,
    body: rest.length ? rest.join(" · ") : "Paneli açmak için tıkla.",
    icon: iconImage() ?? undefined,
    urgency: top.level === "critical" ? "critical" : "normal",
  });
  n.on("click", () => showWindow(href));
  n.show();
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Ask the cockpit what needs attention.
 *
 * The request goes through the app's own session, so it carries the same signed
 * session cookie the window signed in with — there is no second credential and
 * nothing is stored locally. A 401 simply means "not signed in yet".
 */
async function poll() {
  let data;
  try {
    const res = await session.defaultSession.fetch(ALERTS_URL, {
      credentials: "include",
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.status === 401) {
      setTrayState("Oturum kapalı — panelden giriş yap");
      return;
    }
    if (!res.ok) {
      setTrayState(`Bağlantı sorunu (${res.status})`);
      return;
    }
    data = await res.json();
  } catch {
    // Offline laptop, sleeping machine: not an error worth a popup.
    setTrayState("Bağlantı yok");
    return;
  }

  const items = Array.isArray(data?.attention) ? data.attention : [];
  const actionable = items.filter((i) => i.level !== "ok");

  setTrayState(
    actionable.length
      ? actionable.map((i) => i.label).join(" · ")
      : "Bugün acil bir şey yok",
  );

  if (!prefs.notifications || actionable.length === 0) return;

  // Notify when the picture CHANGES, or when an unchanged picture has been
  // sitting there for an hour. Re-announcing the same three numbers every five
  // minutes is how a useful notification becomes one you learn to ignore.
  const signature = actionable.map((i) => `${i.level}:${i.label}`).join("|");
  const stale = Date.now() - lastNotified.at > REPEAT_SILENCE_MS;
  if (signature !== lastNotified.signature || stale) {
    lastNotified = { signature, at: Date.now() };
    notifyAlerts(actionable);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  setTimeout(poll, FIRST_POLL_MS);
  pollTimer = setInterval(poll, POLL_MS);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

let trayStatus = "Yükleniyor…";

function setTrayState(status) {
  trayStatus = status;
  if (!tray) return;
  // Windows truncates tray tooltips around 127 characters.
  tray.setToolTip(`AYZENITH Panel\n${status}`.slice(0, 120));
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: trayStatus, enabled: false },
    { type: "separator" },
    { label: "Paneli aç", click: () => showWindow() },
    {
      label: "Git",
      submenu: [
        { label: "Kokpit", click: () => showWindow("/os") },
        { label: "Satışlar", click: () => showWindow("/os/sales") },
        { label: "Alışlar", click: () => showWindow("/os/purchases") },
        { label: "Ödemeler", click: () => showWindow("/os/payments") },
        { label: "Stok", click: () => showWindow("/os/inventory") },
        { label: "Raporlar", click: () => showWindow("/os/reports") },
      ],
    },
    { type: "separator" },
    { label: "Şimdi kontrol et", click: () => poll() },
    {
      label: "Bildirimler açık",
      type: "checkbox",
      checked: prefs.notifications,
      click: (item) => {
        prefs.notifications = item.checked;
        savePrefs();
      },
    },
    {
      label: "Windows açılışında başlat",
      type: "checkbox",
      checked: prefs.startAtLogin,
      click: (item) => {
        prefs.startAtLogin = item.checked;
        savePrefs();
        applyLoginItem();
      },
    },
    { type: "separator" },
    { label: "Çıkış", click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = iconImage();
  tray = new Tray(img ? img.resize({ width: 16, height: 16 }) : nativeImage.createEmpty());
  tray.setToolTip("AYZENITH Panel");
  tray.on("click", () => toggleWindow());
  tray.on("double-click", () => showWindow());
  buildTrayMenu();
}

/**
 * Launch at login. Passes --hidden so an auto-started copy goes straight to the
 * tray instead of throwing a window in the user's face at every boot.
 */
function applyLoginItem() {
  try {
    app.setLoginItemSettings({
      openAtLogin: prefs.startAtLogin,
      args: ["--hidden"],
    });
  } catch {
    /* Locked-down machines can refuse this; not fatal. */
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// One panel, one tray icon. A second launch just raises the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(() => {
    // Windows attributes notifications to this id rather than to "electron.app".
    app.setAppUserModelId("com.ayzenith.panel");
    loadPrefs();
    applyLoginItem();

    const hidden = process.argv.includes("--hidden") || prefs.startMinimized;
    createWindow({ show: !hidden });
    createTray();
    startPolling();

    globalShortcut.register("Control+Shift+A", () => toggleWindow());

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  // Deliberately does NOT quit when the window closes: the tray icon is the app
  // now, and quitting here would kill the notifications it exists to deliver.
  app.on("window-all-closed", () => {});

  app.on("before-quit", () => {
    quitting = true;
    if (pollTimer) clearInterval(pollTimer);
  });

  app.on("will-quit", () => globalShortcut.unregisterAll());
}
