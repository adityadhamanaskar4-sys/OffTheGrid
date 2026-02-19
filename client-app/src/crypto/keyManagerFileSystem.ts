import path from 'path-browserify';

export interface PublicKeys {
    signingPublicKey: string;
    encryptionPublicKey: string;
    format: string;
}

interface StoredKeyPair {
    publicKey: string;
    privateKey: string;
}

interface StoredKeys {
    username: string;
    createdAt: string;
    format: string;
    signing: StoredKeyPair;
    encryption: StoredKeyPair;
}

export interface LocalInboxItem {
    contact: string;
    last_message_preview: string;
    last_timestamp: string;
    unread_count: number;
}

// Type declaration for electron API
declare global {
    interface Window {
        electron?: {
            getUserDataPath: () => string;
            fs: {
                writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
                readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
                readDir: (dirPath: string) => Promise<{ success: boolean; data?: Array<{ name: string; isDirectory: boolean }>; error?: string }>;
                ensureDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
                access: (filePath: string) => Promise<{ success: boolean; error?: string }>;
            };
        };
    }
}

// Get the user data directory
function getUserDataPath(): string {
    if (typeof window !== 'undefined' && window.electron) {
        return window.electron.getUserDataPath();
    }
    // Fallback for development
    return 'user-data';
}

function getKeysDir(): string {
    return path.join(getUserDataPath(), '.keys');
}

function getMessagesDir(): string {
    return path.join(getUserDataPath(), '.messages');
}

export function normalizeUsername(value: string): string {
    return (value || '').trim().toLowerCase();
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
    if (!window.electron) {
        throw new Error('Electron API not available');
    }
    
    const result = await window.electron.fs.ensureDir(dirPath);
    if (!result.success) {
        throw new Error(result.error || 'Failed to create directory');
    }
}

/**
 * Converts a base64 string to an ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Converts an ArrayBuffer to a base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Generate cryptographic key pairs for signing and encryption
 * Uses EdDSA for signing and X25519 for encryption
 */
export async function generateKeyPair(): Promise<{
    signing: { publicKey: CryptoKey; privateKey: CryptoKey };
    encryption: { publicKey: CryptoKey; privateKey: CryptoKey };
}> {
    const signingPair = await window.crypto.subtle.generateKey(
        {
            name: 'Ed25519',
        },
        true, // extractable
        ['sign', 'verify']
    );

    const encryptionPair = await window.crypto.subtle.generateKey(
        {
            name: 'X25519',
        },
        true, // extractable
        ['deriveKey', 'deriveBits']
    );

    return {
        signing: signingPair as { publicKey: CryptoKey; privateKey: CryptoKey },
        encryption: encryptionPair as { publicKey: CryptoKey; privateKey: CryptoKey },
    };
}

/**
 * Export CryptoKey to base64 format
 */
async function exportKeyToBase64(key: CryptoKey, type: 'public' | 'private'): Promise<string> {
    const format = type === 'public' ? 'spki' : 'pkcs8';
    const exported = await window.crypto.subtle.exportKey(format, key);
    return arrayBufferToBase64(exported);
}

/**
 * Import a base64 key back to CryptoKey format
 */
async function importKeyFromBase64(base64: string, keyType: 'signing' | 'encryption', type: 'public' | 'private'): Promise<CryptoKey> {
    const buffer = base64ToArrayBuffer(base64);
    const format = type === 'public' ? 'spki' : 'pkcs8';
    const algorithm = keyType === 'signing' ? 'Ed25519' : 'X25519';
    const usages = keyType === 'signing' 
        ? (type === 'public' ? ['verify'] : ['sign'])
        : (type === 'public' ? ['deriveKey', 'deriveBits'] : ['deriveKey', 'deriveBits']);
    
    return await window.crypto.subtle.importKey(
        format,
        buffer,
        { name: algorithm },
        true, // extractable
        usages as KeyUsage[]
    );
}

/**
 * Generate key pair for user registration and store in .keys folder
 * Returns only public keys to send to server
 */
export async function generateAndStoreKeys(username: string): Promise<PublicKeys> {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
        throw new Error('Username is required for key generation');
    }

    if (!window.electron) {
        throw new Error('Electron API not available');
    }

    const { signing, encryption } = await generateKeyPair();

    const signingPublicKey = await exportKeyToBase64(signing.publicKey, 'public');
    const signingPrivateKey = await exportKeyToBase64(signing.privateKey, 'private');
    const encryptionPublicKey = await exportKeyToBase64(encryption.publicKey, 'public');
    const encryptionPrivateKey = await exportKeyToBase64(encryption.privateKey, 'private');

    const payload: StoredKeys = {
        username: normalizedUsername,
        createdAt: new Date().toISOString(),
        format: 'spki-pkcs8-base64',
        signing: {
            publicKey: signingPublicKey,
            privateKey: signingPrivateKey,
        },
        encryption: {
            publicKey: encryptionPublicKey,
            privateKey: encryptionPrivateKey,
        },
    };

    // Store keys in .keys folder
    try {
        const keysDir = getKeysDir();
        await ensureDir(keysDir);
        
        const keyFilePath = path.join(keysDir, `${normalizedUsername}.json`);
        const result = await window.electron.fs.writeFile(keyFilePath, JSON.stringify(payload, null, 2));
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to write key file');
        }
    } catch (err) {
        console.warn('Could not store keys in file system:', err);
    }

    return {
        signingPublicKey,
        encryptionPublicKey,
        format: payload.format,
    };
}

/**
 * Load stored keys from .keys folder
 */
export async function loadStoredKeys(username: string): Promise<StoredKeys | null> {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
        throw new Error('Username is required to load keys');
    }

    if (!window.electron) {
        throw new Error('Electron API not available');
    }

    try {
        const keysDir = getKeysDir();
        const keyFilePath = path.join(keysDir, `${normalizedUsername}.json`);
        
        const result = await window.electron.fs.readFile(keyFilePath);
        if (!result.success || !result.data) {
            return null;
        }
        
        return JSON.parse(result.data);
    } catch (err) {
        console.error('Error loading stored keys:', err);
        return null;
    }
}

/**
 * Load stored keys and convert base64 strings to usable CryptoKey objects
 */
export async function loadUsableKeys(username: string): Promise<{
    signing: { publicKey: CryptoKey; privateKey: CryptoKey };
    encryption: { publicKey: CryptoKey; privateKey: CryptoKey };
} | null> {
    const storedKeys = await loadStoredKeys(username);
    if (!storedKeys) {
        return null;
    }

    try {
        const signing = {
            publicKey: await importKeyFromBase64(storedKeys.signing.publicKey, 'signing', 'public'),
            privateKey: await importKeyFromBase64(storedKeys.signing.privateKey, 'signing', 'private'),
        };
        const encryption = {
            publicKey: await importKeyFromBase64(storedKeys.encryption.publicKey, 'encryption', 'public'),
            privateKey: await importKeyFromBase64(storedKeys.encryption.privateKey, 'encryption', 'private'),
        };

        return { signing, encryption };
    } catch (err) {
        console.error('Error loading usable keys:', err);
        return null;
    }
}

/**
 * Save a message locally to the file system
 */
export async function saveMessageLocally(owner: string, message: any): Promise<void> {
    if (!window.electron) {
        throw new Error('Electron API not available');
    }

    try {
        const messagesDir = getMessagesDir();
        await ensureDir(messagesDir);

        const ownerKey = normalizeUsername(owner);
        const sender = typeof message.from === 'string' ? message.from : '';
        const recipient = typeof message.to === 'string' ? message.to : '';

        // Normalize comparisons, preserve original display values.
        const isSentByOwner = normalizeUsername(sender) === ownerKey;
        const chatPartner = isSentByOwner ? recipient : sender;
        const chatPartnerKey = normalizeUsername(chatPartner);

        const entry = {
            ...message,
            owner,
            ownerKey,
            chatPartner,
            chatPartnerKey
        };

        // Create user-specific directory
        const userMessagesDir = path.join(messagesDir, ownerKey);
        await ensureDir(userMessagesDir);

        // Create contact-specific directory
        const contactMessagesDir = path.join(userMessagesDir, chatPartnerKey);
        await ensureDir(contactMessagesDir);

        // Save message as JSON file with message ID as filename
        const messageFilePath = path.join(contactMessagesDir, `${message.id}.json`);
        const result = await window.electron.fs.writeFile(messageFilePath, JSON.stringify(entry, null, 2));
        
        if (!result.success) {
            throw new Error(result.error || 'Failed to save message');
        }
    } catch (err) {
        console.error('Error saving message locally:', err);
    }
}

/**
 * Load local chat history for a contact
 */
export async function loadLocalHistory(owner: string, contact: string): Promise<any[]> {
    if (!window.electron) {
        throw new Error('Electron API not available');
    }

    try {
        const messagesDir = getMessagesDir();
        const ownerKey = normalizeUsername(owner);
        const contactKey = normalizeUsername(contact);

        const contactMessagesDir = path.join(messagesDir, ownerKey, contactKey);
        
        // Check if directory exists
        const accessResult = await window.electron.fs.access(contactMessagesDir);
        if (!accessResult.success) {
            return [];
        }

        const readResult = await window.electron.fs.readDir(contactMessagesDir);
        if (!readResult.success || !readResult.data) {
            return [];
        }

        const messages: any[] = [];

        for (const file of readResult.data) {
            if (!file.isDirectory && file.name.endsWith('.json')) {
                const filePath = path.join(contactMessagesDir, file.name);
                const fileResult = await window.electron.fs.readFile(filePath);
                if (fileResult.success && fileResult.data) {
                    messages.push(JSON.parse(fileResult.data));
                }
            }
        }

        // Sort by timestamp
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        return messages;
    } catch (err) {
        console.error('Error loading local history:', err);
        return [];
    }
}

/**
 * Load local inbox
 */
export async function loadLocalInbox(owner: string): Promise<LocalInboxItem[]> {
    if (!window.electron) {
        throw new Error('Electron API not available');
    }

    try {
        const messagesDir = getMessagesDir();
        const ownerKey = normalizeUsername(owner);
        const userMessagesDir = path.join(messagesDir, ownerKey);

        // Check if directory exists
        const accessResult = await window.electron.fs.access(userMessagesDir);
        if (!accessResult.success) {
            return [];
        }

        const contactDirsResult = await window.electron.fs.readDir(userMessagesDir);
        if (!contactDirsResult.success || !contactDirsResult.data) {
            return [];
        }

        const inbox: LocalInboxItem[] = [];

        for (const contactDir of contactDirsResult.data) {
            if (contactDir.isDirectory) {
                const contactMessagesDir = path.join(userMessagesDir, contactDir.name);
                const filesResult = await window.electron.fs.readDir(contactMessagesDir);
                
                if (!filesResult.success || !filesResult.data) {
                    continue;
                }

                let latestMessage: any = null;
                let latestTimestamp = new Date(0);

                for (const file of filesResult.data) {
                    if (!file.isDirectory && file.name.endsWith('.json')) {
                        const filePath = path.join(contactMessagesDir, file.name);
                        const fileResult = await window.electron.fs.readFile(filePath);
                        
                        if (fileResult.success && fileResult.data) {
                            const message = JSON.parse(fileResult.data);
                            const msgTime = new Date(message.timestamp);

                            if (msgTime > latestTimestamp) {
                                latestTimestamp = msgTime;
                                latestMessage = message;
                            }
                        }
                    }
                }

                if (latestMessage) {
                    inbox.push({
                        contact: latestMessage.chatPartner || '',
                        last_message_preview: latestMessage.content || '',
                        last_timestamp: latestMessage.timestamp || new Date(0).toISOString(),
                        unread_count: 0
                    });
                }
            }
        }

        // Sort by timestamp (newest first)
        inbox.sort((a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime());
        return inbox;
    } catch (err) {
        console.error('Error loading local inbox:', err);
        return [];
    }
}
