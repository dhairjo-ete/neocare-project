const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  version: process.versions.electron,
});
