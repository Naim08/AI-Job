import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron';
import path from 'node:path';

// Disable hardware acceleration early, before app is ready
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null;

// These globals are declared by '@electron-forge/plugin-vite/forge-vite-env'
// and are available in the main process thanks to forge.env.d.ts
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string; // Though we might not use this one directly for loading URL

console.log(`[Main Process] Attempting to use MAIN_WINDOW_VITE_DEV_SERVER_URL: ${typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : 'not defined (global)'}`);

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // Check if the Vite dev server URL is available (set by Electron Forge Vite plugin)
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    console.log(`[Main Process] Loading from Vite dev server: ${MAIN_WINDOW_VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    console.log('[Main Process] Vite dev server URL not found, loading index.html from file system.');
    // This path assumes 'index.html' is in the project root, two levels up from .vite/build/
    // It also assumes your MAIN_WINDOW_VITE_NAME would be part of a path like '../renderer/main_window/index.html'
    // For simplicity with current setup, let's stick to the direct path to root index.html if not using dev server.
    // The original code from your src/main.ts was: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    // Our current main.js is at .vite/build/main.js. The root index.html is at ../../index.html from there.
    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('pause-agent', async () => {
    console.debug('[Main Process] IPC: pause-agent invoked.');
    return { status: 'Agent pause signal received' };
  });

  ipcMain.handle('open-captcha', async () => {
    console.debug('[Main Process] IPC: open-captcha invoked. Opening https://www.linkedin.com');
    try {
      await shell.openExternal('https://www.linkedin.com');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Main Process] Failed to open external URL:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('notify', async (_event, message: string) => {
    console.debug(`[Main Process] IPC: notify invoked with message: "${message}"`);
    if (!Notification.isSupported()) {
      console.warn('[Main Process] Notifications are not supported on this system.');
      return { success: false, error: 'Notifications not supported on this system.' };
    }
    new Notification({
      title: 'Notification',
      body: message,
    }).show();
    return { success: true };
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 