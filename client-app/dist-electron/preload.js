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
    },
    crypto: {
        generateKeyPairs: () => ipcRenderer.invoke('crypto-generate-key-pairs'),
        encryptMessage: (message, recipientPublicKey, senderPrivateKey) => ipcRenderer.invoke('crypto-encrypt-message', { message, recipientPublicKey, senderPrivateKey }),
        decryptMessage: (encryptedContent, iv, senderPublicKey, recipientPrivateKey) => ipcRenderer.invoke('crypto-decrypt-message', { encryptedContent, iv, senderPublicKey, recipientPrivateKey })
    }
});
