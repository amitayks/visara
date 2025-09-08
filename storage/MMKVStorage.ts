import { MMKV } from 'react-native-mmkv';
import CryptoJS from 'crypto-js';

/**
 * MMKV Storage Implementation
 * 
 * High-performance, memory-efficient replacement for AsyncStorage
 * Uses separate instances for different data types with appropriate encryption
 */

// Generate encryption key from app bundle + salt
const APP_ID = 'com.visara.documentscanner'; // Should match your app's bundle ID
const ENCRYPTION_SALT = 'visara_mmkv_2024_secure';

const generateEncryptionKey = (instanceId: string): string => {
	return CryptoJS.SHA256(APP_ID + instanceId + ENCRYPTION_SALT).toString();
};

// Separate MMKV instances for different data types
export const appStorage = new MMKV({
	id: 'visara-app-storage',
	encryptionKey: generateEncryptionKey('app'), // Encrypted for sensitive data
});

export const scannerStorage = new MMKV({
	id: 'visara-scanner-storage',
	// No encryption for performance - scan data is not sensitive
});

export const cacheStorage = new MMKV({
	id: 'visara-cache-storage',
	// No encryption for performance - cache data is temporary
});

export const tempStorage = new MMKV({
	id: 'visara-temp-storage',
	// No encryption, used for temporary data that can be cleared
});

/**
 * AsyncStorage-compatible interface for easy migration
 */
interface StorageInterface {
	setItem: (key: string, value: string) => Promise<void>;
	getItem: (key: string) => Promise<string | null>;
	removeItem: (key: string) => Promise<void>;
	clear: () => Promise<void>;
	getAllKeys: () => Promise<string[]>;
	multiGet: (keys: string[]) => Promise<Array<[string, string | null]>>;
	multiSet: (keyValuePairs: Array<[string, string]>) => Promise<void>;
	multiRemove: (keys: string[]) => Promise<void>;
}

/**
 * Create AsyncStorage-compatible wrapper for any MMKV instance
 */
const createMMKVStorageInterface = (storage: MMKV): StorageInterface => ({
	setItem: async (key: string, value: string): Promise<void> => {
		try {
			storage.set(key, value);
		} catch (error) {
			console.error(`[MMKV] Error setting ${key}:`, error);
			throw error;
		}
	},

	getItem: async (key: string): Promise<string | null> => {
		try {
			const value = storage.getString(key);
			return value ?? null;
		} catch (error) {
			console.error(`[MMKV] Error getting ${key}:`, error);
			return null;
		}
	},

	removeItem: async (key: string): Promise<void> => {
		try {
			storage.delete(key);
		} catch (error) {
			console.error(`[MMKV] Error removing ${key}:`, error);
			throw error;
		}
	},

	clear: async (): Promise<void> => {
		try {
			storage.clearAll();
		} catch (error) {
			console.error('[MMKV] Error clearing storage:', error);
			throw error;
		}
	},

	getAllKeys: async (): Promise<string[]> => {
		try {
			return storage.getAllKeys();
		} catch (error) {
			console.error('[MMKV] Error getting all keys:', error);
			return [];
		}
	},

	multiGet: async (keys: string[]): Promise<Array<[string, string | null]>> => {
		try {
			return keys.map(key => [key, storage.getString(key) ?? null]);
		} catch (error) {
			console.error('[MMKV] Error in multiGet:', error);
			return keys.map(key => [key, null]);
		}
	},

	multiSet: async (keyValuePairs: Array<[string, string]>): Promise<void> => {
		try {
			keyValuePairs.forEach(([key, value]) => {
				storage.set(key, value);
			});
		} catch (error) {
			console.error('[MMKV] Error in multiSet:', error);
			throw error;
		}
	},

	multiRemove: async (keys: string[]): Promise<void> => {
		try {
			keys.forEach(key => {
				storage.delete(key);
			});
		} catch (error) {
			console.error('[MMKV] Error in multiRemove:', error);
			throw error;
		}
	},
});

/**
 * Enhanced Storage Interface with JSON support and type safety
 */
interface EnhancedStorageInterface extends StorageInterface {
	setObject: <T>(key: string, value: T) => Promise<void>;
	getObject: <T>(key: string) => Promise<T | null>;
	setNumber: (key: string, value: number) => Promise<void>;
	getNumber: (key: string) => Promise<number | null>;
	setBoolean: (key: string, value: boolean) => Promise<void>;
	getBoolean: (key: string) => Promise<boolean | null>;
	contains: (key: string) => boolean;
	size: () => number;
}

/**
 * Create enhanced MMKV interface with type safety and JSON support
 */
const createEnhancedMMKVInterface = (storage: MMKV): EnhancedStorageInterface => {
	const basicInterface = createMMKVStorageInterface(storage);

	return {
		...basicInterface,

		setObject: async <T>(key: string, value: T): Promise<void> => {
			try {
				storage.set(key, JSON.stringify(value));
			} catch (error) {
				console.error(`[MMKV] Error setting object ${key}:`, error);
				throw error;
			}
		},

		getObject: async <T>(key: string): Promise<T | null> => {
			try {
				const value = storage.getString(key);
				return value ? JSON.parse(value) : null;
			} catch (error) {
				console.error(`[MMKV] Error getting object ${key}:`, error);
				return null;
			}
		},

		setNumber: async (key: string, value: number): Promise<void> => {
			try {
				storage.set(key, value);
			} catch (error) {
				console.error(`[MMKV] Error setting number ${key}:`, error);
				throw error;
			}
		},

		getNumber: async (key: string): Promise<number | null> => {
			try {
				const value = storage.getNumber(key);
				return value ?? null;
			} catch (error) {
				console.error(`[MMKV] Error getting number ${key}:`, error);
				return null;
			}
		},

		setBoolean: async (key: string, value: boolean): Promise<void> => {
			try {
				storage.set(key, value);
			} catch (error) {
				console.error(`[MMKV] Error setting boolean ${key}:`, error);
				throw error;
			}
		},

		getBoolean: async (key: string): Promise<boolean | null> => {
			try {
				const value = storage.getBoolean(key);
				return value ?? null;
			} catch (error) {
				console.error(`[MMKV] Error getting boolean ${key}:`, error);
				return null;
			}
		},

		contains: (key: string): boolean => {
			try {
				return storage.contains(key);
			} catch (error) {
				console.error(`[MMKV] Error checking contains ${key}:`, error);
				return false;
			}
		},

		size: (): number => {
			try {
				return storage.getAllKeys().length;
			} catch (error) {
				console.error('[MMKV] Error getting size:', error);
				return 0;
			}
		},
	};
};

// Export enhanced interfaces for different storage types
export const AppStorage = createEnhancedMMKVInterface(appStorage);
export const ScannerStorage = createEnhancedMMKVInterface(scannerStorage);
export const CacheStorage = createEnhancedMMKVInterface(cacheStorage);
export const TempStorage = createEnhancedMMKVInterface(tempStorage);

// Main storage (default) - for backward compatibility
export const MMKVStorage = AppStorage;

/**
 * Storage cleanup utilities
 */
export const StorageCleanup = {
	clearCache: async (): Promise<void> => {
		await CacheStorage.clear();
		console.log('[MMKV] Cache storage cleared');
	},

	clearTemp: async (): Promise<void> => {
		await TempStorage.clear();
		console.log('[MMKV] Temp storage cleared');
	},

	clearAll: async (): Promise<void> => {
		await Promise.all([
			CacheStorage.clear(),
			TempStorage.clear(),
		]);
		console.log('[MMKV] All non-persistent storage cleared');
	},

	getStorageInfo: () => {
		return {
			app: {
				size: AppStorage.size(),
				keys: appStorage.getAllKeys().length,
			},
			scanner: {
				size: ScannerStorage.size(),
				keys: scannerStorage.getAllKeys().length,
			},
			cache: {
				size: CacheStorage.size(),
				keys: cacheStorage.getAllKeys().length,
			},
			temp: {
				size: TempStorage.size(),
				keys: tempStorage.getAllKeys().length,
			},
		};
	},
};

// Initialize storage on module load
console.log('[MMKV] Storage initialized:', StorageCleanup.getStorageInfo());

export default MMKVStorage;