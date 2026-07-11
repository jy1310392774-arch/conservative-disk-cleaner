const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diskCleaner", {
  listReports: () => ipcRenderer.invoke("disk:listReports"),
  listDrives: () => ipcRenderer.invoke("disk:listDrives"),
  scan: (options) => ipcRenderer.invoke("disk:scan", options),
  executeLowRisk: (options) => ipcRenderer.invoke("disk:executeLowRisk", options),
  deleteSelectedToRecycleBin: (paths) => ipcRenderer.invoke("disk:deleteSelectedToRecycleBin", paths),
  openReports: () => ipcRenderer.invoke("disk:openReports"),
  openPath: (targetPath) => ipcRenderer.invoke("disk:openPath", targetPath),
  onLog: (callback) => {
    const listener = (_event, text) => callback(text);
    ipcRenderer.on("disk:log", listener);
    return () => ipcRenderer.removeListener("disk:log", listener);
  },
  listInstalledApps: () => ipcRenderer.invoke("uninstall:listApps"),
  runUninstaller: (appId) => ipcRenderer.invoke("uninstall:run", appId),
  scanUninstallResiduals: (appId) => ipcRenderer.invoke("uninstall:scanResiduals", appId),
  removeUninstallResiduals: (appId, candidateIds) => ipcRenderer.invoke("uninstall:removeResiduals", appId, candidateIds)
});
