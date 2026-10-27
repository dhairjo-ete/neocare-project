const { app, BrowserWindow, shell, ipcMain, Menu } = require("electron");
const path = require("path");

let mainWindow = null;

// Enforce single instance lock for NICU monitoring integrity
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.ico");

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "NeoCare - Neonatal Telemetry & NICU Monitoring System",
    icon: iconPath,
    backgroundColor: "#0b0f19",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Gracefully show window once ready to prevent visual flickering
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Determine target URL: Local dev server or bundled dist build
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Intercept window open / target="_blank" links (opens in user's default browser)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Handle in-page navigations to external sites (opens in user's default browser)
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  createApplicationMenu();
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Toggle NICU Kiosk Fullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About NeoCare",
          click: async () => {
            await shell.openExternal("https://neocaretelemetry.netlify.app/about");
          },
        },
        {
          label: "Support & FAQs",
          click: async () => {
            await shell.openExternal("https://neocaretelemetry.netlify.app/support-faqs");
          },
        },
        {
          label: "NeoCare Official Website",
          click: async () => {
            await shell.openExternal("https://neocaretelemetry.netlify.app");
          },
        },
        { type: "separator" },
        {
          label: "App Information",
          click: () => {
            const { dialog } = require("electron");
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "NeoCare Clinical Workstation",
              message: "NeoCare NICU Management & Telemetry Suite",
              detail: `Version: ${app.getVersion()}\nPlatform: ${process.platform} (${process.arch})\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
