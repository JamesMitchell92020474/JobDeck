const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isDev = !!process.defaultApp || process.env.NODE_ENV === 'development';
const PORT  = process.env.PORT || 3001;

let mainWindow = null;
let tray = null;

// In dev the backend is started separately via `npm run dev:be`.
// In production (packaged) we start it inline.
function startBackend() {
  if (isDev) return;
  try { require('../backend/index'); } catch (e) {
    console.error('[electron] Backend failed to start:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'JobDeck',
    backgroundColor: '#F5F4F8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.ico');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('JobDeck');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open JobDeck', click: () => mainWindow ? mainWindow.show() : createWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(() => {
    createWindow();
    if (!isDev) createTray();
  }, isDev ? 0 : 1500);
});

app.on('window-all-closed', () => {
  // Keep alive in tray on Windows — don't call app.quit()
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});
