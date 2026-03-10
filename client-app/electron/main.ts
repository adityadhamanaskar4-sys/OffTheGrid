import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs/promises';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
  createHash
} from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

// Handle IPC for getting user data path
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

// Handle file system operations
ipcMain.handle('fs-write-file', async (_event, filePath: string, data: string) => {
  try {
    await fs.writeFile(filePath, data, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('fs-read-file', async (_event, filePath: string) => {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('fs-read-dir', async (_event, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory()
    }));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('fs-ensure-dir', async (_event, dirPath: string) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('fs-access', async (_event, filePath: string) => {
  try {
    await fs.access(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

const normalizeBase64 = (value: string): string => (value || '').replace(/\s+/g, '').trim();

ipcMain.handle('crypto-generate-key-pairs', async () => {
  try {
    const signingPair = generateKeyPairSync('ed25519');
    const encryptionPair = generateKeyPairSync('x25519');

    const signingPublicKey = signingPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const signingPrivateKey = signingPair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    const encryptionPublicKey = encryptionPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const encryptionPrivateKey = encryptionPair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

    return {
      success: true,
      keys: {
        signing: { publicKey: signingPublicKey, privateKey: signingPrivateKey },
        encryption: { publicKey: encryptionPublicKey, privateKey: encryptionPrivateKey },
        format: 'spki-pkcs8-base64'
      }
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('crypto-encrypt-message', async (_event, payload: { message: string; recipientPublicKey: string; senderPrivateKey: string }) => {
  try {
    const recipientPub = createPublicKey({
      key: Buffer.from(normalizeBase64(payload.recipientPublicKey), 'base64'),
      format: 'der',
      type: 'spki'
    });
    const senderPriv = createPrivateKey({
      key: Buffer.from(normalizeBase64(payload.senderPrivateKey), 'base64'),
      format: 'der',
      type: 'pkcs8'
    });

    const sharedSecret = diffieHellman({ privateKey: senderPriv, publicKey: recipientPub });
    const aesKey = createHash('sha256').update(sharedSecret).digest();
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(payload.message, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const packed = Buffer.concat([ciphertext, tag]);

    return {
      success: true,
      encryptedContent: packed.toString('base64'),
      iv: iv.toString('base64')
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('crypto-decrypt-message', async (_event, payload: { encryptedContent: string; iv: string; senderPublicKey: string; recipientPrivateKey: string }) => {
  try {
    const senderPub = createPublicKey({
      key: Buffer.from(normalizeBase64(payload.senderPublicKey), 'base64'),
      format: 'der',
      type: 'spki'
    });
    const recipientPriv = createPrivateKey({
      key: Buffer.from(normalizeBase64(payload.recipientPrivateKey), 'base64'),
      format: 'der',
      type: 'pkcs8'
    });

    const sharedSecret = diffieHellman({ privateKey: recipientPriv, publicKey: senderPub });
    const aesKey = createHash('sha256').update(sharedSecret).digest();

    const packed = Buffer.from(normalizeBase64(payload.encryptedContent), 'base64');
    if (packed.length < 17) {
      throw new Error('Encrypted payload is too short');
    }
    const ciphertext = packed.subarray(0, packed.length - 16);
    const tag = packed.subarray(packed.length - 16);
    const iv = Buffer.from(normalizeBase64(payload.iv), 'base64');

    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    return { success: true, content: plaintext };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const rendererPath = path.resolve(__dirname, '../dist/index.html');
  mainWindow.loadFile(rendererPath);
}

app.whenReady().then(() => {
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
