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
  },
  crypto: {
    generateKeyPairs: () => ipcRenderer.invoke('crypto-generate-key-pairs'),
    encryptMessage: (message: string, recipientPublicKey: string, senderPrivateKey: string) =>
      ipcRenderer.invoke('crypto-encrypt-message', { message, recipientPublicKey, senderPrivateKey }),
    decryptMessage: (encryptedContent: string, iv: string, senderPublicKey: string, recipientPrivateKey: string) =>
      ipcRenderer.invoke('crypto-decrypt-message', { encryptedContent, iv, senderPublicKey, recipientPrivateKey })
  }
});
