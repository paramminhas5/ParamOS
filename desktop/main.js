// Param OS desktop wrapper: opens paramminhas.com/paramos in its own window.
// The page keeps a saved copy (service worker + local storage), so it opens and shows your last data with no internet.
const { app, BrowserWindow, ipcMain, safeStorage, Menu, shell } = require("electron");
const fs = require("fs"), path = require("path");
const URL_APP = "https://www.paramminhas.com/paramos";
const credFile = () => path.join(app.getPath("userData"), "cred.bin");

function loadCred() { try { return safeStorage.decryptString(fs.readFileSync(credFile())); } catch { return null; } }
function saveCred(pw) { try { fs.writeFileSync(credFile(), safeStorage.encryptString(pw)); } catch {} }

function askPassword() {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ width: 380, height: 220, resizable: false, title: "Param OS", webPreferences: { preload: path.join(__dirname, "preload.js") } });
    w.setMenu(null);
    w.loadFile("password.html");
    ipcMain.once("pw", (_e, pw) => { resolve(pw); w.destroy(); });
    w.on("closed", () => resolve(null));
  });
}

let main;
function open() {
  main = new BrowserWindow({ width: 1280, height: 900, title: "Param OS", backgroundColor: "#0D0F14", webPreferences: { contextIsolation: true } });
  main.loadURL(URL_APP).catch(() => {});
  main.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  main.webContents.on("will-navigate", (e, url) => {
    if (!/^https:\/\/(www\.)?paramminhas\.com\/(paramos|mermanos)/.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  main.webContents.on("did-fail-load", (_e, code) => {
    if (code === -106 || code === -105 || code === -109) setTimeout(() => main && !main.isDestroyed() && main.loadURL(URL_APP).catch(() => {}), 8000);
  });
}

app.on("login", async (event, _wc, _req, authInfo, callback) => {
  event.preventDefault();
  let pw = loadCred();
  if (!pw || app._pwBad) { pw = await askPassword(); if (pw) saveCred(pw); app._pwBad = false; }
  if (pw) callback("param", pw); else callback();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
    { label: "Param OS", submenu: [
      { label: "Forget saved password", click: () => { try { fs.unlinkSync(credFile()); } catch {} app.relaunch(); app.exit(0); } },
      { label: "Open Merman OS", click: () => main && main.loadURL("https://www.paramminhas.com/mermanos") },
      { label: "Back to Param OS", click: () => main && main.loadURL(URL_APP) } ] },
    { role: "windowMenu" }]));
  open();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) open(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
