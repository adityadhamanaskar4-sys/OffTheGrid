import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs/promises';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
// Handle IPC for getting user data path
ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData');
});
// Handle file system operations
ipcMain.handle('fs-write-file', async (_event, filePath, data) => {
    try {
        await fs.writeFile(filePath, data, 'utf-8');
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('fs-read-file', async (_event, filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return { success: true, data };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('fs-read-dir', async (_event, dirPath) => {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const result = entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory()
        }));
        return { success: true, data: result };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('fs-ensure-dir', async (_event, dirPath) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('fs-access', async (_event, filePath) => {
    try {
        await fs.access(filePath);
        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});
function createMainWindow() {
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
