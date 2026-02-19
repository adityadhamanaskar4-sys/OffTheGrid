import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electron', {
    isElectron: true,
    getUserDataPath: () => ipcRenderer.sendSync('get-user-data-path'),
    fs: {
        writeFile: (filePath, data) => ipcRenderer.invoke('fs-write-file', filePath, data),
        readFile: (filePath) => ipcRenderer.invoke('fs-read-file', filePath),
        readDir: (dirPath) => ipcRenderer.invoke('fs-read-dir', dirPath),
        ensureDir: (dirPath) => ipcRenderer.invoke('fs-ensure-dir', dirPath),
        access: (filePath) => ipcRenderer.invoke('fs-access', filePath)
    }
});
