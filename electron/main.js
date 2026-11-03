/**
 * Electron Main Process for AnimeStream
 * Manages native desktop window, tray, and auto-starts local Express server.
 */
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const { startServer } = require('../server/index');

let mainWindow = null;
let serverInstance = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow(serverUrl) {
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

  // Load local server URL
  await mainWindow.loadURL(serverUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

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
  try {
    const { localUrl, server } = await startServer(3000);
    serverInstance = server;
    console.log(`[Electron] Servidor Express corriendo en ${localUrl}`);
    await createWindow(localUrl);
  } catch (err) {
    console.error('[Electron] Error iniciando servidor o ventana:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverInstance) {
      createWindow(`http://localhost:${serverInstance.address().port}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});
