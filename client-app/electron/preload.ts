import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  getUserDataPath: () => ipcRenderer.sendSync('get-user-data-path'),
  fs: {
    writeFile: (filePath: string, data: string) => ipcRenderer.invoke('fs-write-file', filePath, data),
    readFile: (filePath: string) => ipcRenderer.invoke('fs-read-file', filePath),
    readDir: (dirPath: string) => ipcRenderer.invoke('fs-read-dir', dirPath),
    ensureDir: (dirPath: string) => ipcRenderer.invoke('fs-ensure-dir', dirPath),
    access: (filePath: string) => ipcRenderer.invoke('fs-access', filePath)
  }
});
