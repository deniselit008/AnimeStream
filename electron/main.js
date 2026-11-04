/**
 * Electron Main Process for AnimeStream
 * Manages native desktop window, tray, and auto-starts local Express server.
 */
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function logDebug(msg) {
  try {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
      if (app && app.isReady && app.isReady()) {
        fs.appendFileSync(path.join(app.getPath('userData'), 'app-debug.log'), line);
      }
    } catch (e) {}
    console.log(msg);
  } catch (e) {}
}

logDebug('Electron main script loaded');

let mainWindow = null;
let serverInstance = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
logDebug(`Got single instance lock: ${gotLock}`);

if (!gotLock) {
  logDebug('Did not get single instance lock, another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    logDebug('Second instance event received, focusing existing window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function createWindow(serverUrl) {
  logDebug(`Creating BrowserWindow for ${serverUrl}...`);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'AnimeStream - Agregador & Reproductor en Tiempo Real',
    backgroundColor: '#07090e',
    show: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Enables iframe playback of all external video hosts without CORS blocks
    }
  });

  // Build minimalist menu
  const menuTemplate = [
    {
      label: 'AnimeStream',
      submenu: [
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
        { label: 'Forzar recarga', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: 'Pantalla completa', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Herramientas de desarrollador', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Navegación',
      submenu: [
        { label: 'Inicio', click: () => mainWindow.loadURL(`${serverUrl}/#/`) },
        { label: 'Directorio', click: () => mainWindow.loadURL(`${serverUrl}/#/directory`) },
        { label: 'Mi Lista', click: () => mainWindow.loadURL(`${serverUrl}/#/library`) },
        { label: 'Favoritos', click: () => mainWindow.loadURL(`${serverUrl}/#/favorites`) },
        { label: 'Historial', click: () => mainWindow.loadURL(`${serverUrl}/#/history`) }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // CRITICAL: Register ready-to-show BEFORE loadURL so it doesn't miss the event!
  mainWindow.once('ready-to-show', () => {
    logDebug('ready-to-show event fired! Calling mainWindow.show()');
    mainWindow.show();
  });

  // Fallback timer: Force window visibility if ready-to-show doesn't trigger within 1.5s
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logDebug('Fallback timer: mainWindow was not visible yet, forcing show()');
      mainWindow.show();
    }
  }, 1500);

  // Forward external links to OS default browser if appropriate
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('maximize-change', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load local server URL
  try {
    logDebug(`Calling mainWindow.loadURL(${serverUrl})...`);
    await mainWindow.loadURL(serverUrl);
    logDebug('mainWindow.loadURL() resolved successfully');
  } catch (err) {
    logDebug(`mainWindow.loadURL() failed: ${err.message}`);
    // If it failed to load, show window anyway so the user sees something
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  }
}

// IPC Handlers
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.on('open-external', (_, url) => {
  if (url && typeof url === 'string') {
    shell.openExternal(url);
  }
});

app.whenReady().then(async () => {
  logDebug('app.whenReady fired');
  try {
    const { startServer } = require('../server/index');
    logDebug('Starting Express server on port 3000...');
    const { localUrl, server } = await startServer(3000);
    serverInstance = server;
    logDebug(`Server successfully started at ${localUrl}`);
    await createWindow(localUrl);
  } catch (err) {
    logDebug(`FATAL: Error starting server or window: ${err.stack || err.message}`);
    try {
      dialog.showErrorBox(
        'Error al iniciar AnimeStream',
        `No se pudo iniciar el servidor local de AnimeStream:\n\n${err.message}\n\nRevisa si otra aplicación está usando el puerto 3000.`
      );
    } catch (e) {}
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverInstance) {
      createWindow(`http://localhost:${serverInstance.address().port}`);
    }
  });
});

app.on('window-all-closed', () => {
  logDebug('window-all-closed fired');
  if (process.platform !== 'darwin') {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});
