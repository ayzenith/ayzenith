const { app, BrowserWindow, shell, Menu } = require("electron");

// Point straight at Business OS. The middleware redirects an unauthenticated
// visit to /admin/login?from=/os, and the login form carries that "from"
// value through — so signing in here lands the user on /os, not the CMS.
const START_URL = "https://www.ayzenith.com/os";
// Anything not on the AYZENITH domain opens in the system browser instead of
// navigating inside the app window — this window exists to show one site, not
// to become a general-purpose browser.
const ALLOWED_HOST = "ayzenith.com";

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: "AYZENITH Panel",
    icon: `${__dirname}/icon.png`,
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

  win.loadURL(START_URL);
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
