import * as Keychain from "react-native-keychain";
import QuickCrypto from "react-native-quick-crypto";
import { storage } from "@services/storage/mmkv";

const ENCRYPTION_KEY_ALIAS = "visara_encryption_key";
const ENCRYPTION_KEY_GENERATED_FLAG = "encryption_key_generated";

/**
 * EncryptionService handles encryption key generation and secure storage
 * using Keychain (iOS) and Keystore (Android)
 *
 * Note: This service manages the encryption key itself.
 * The actual encryption of WatermelonDB data is handled by WatermelonDB's
 * built-in encryption using SQLCipher.
 */
export class EncryptionService {
	private static encryptionKey: string | null = null;
	private static isInitialized = false;

	/**
	 * Initialize the encryption service
	 * Generates and stores encryption key on first launch
	 */
	static async initialize(): Promise<void> {
		if (this.isInitialized) return;

		try {
			const keyExists = storage.getBoolean(ENCRYPTION_KEY_GENERATED_FLAG);

			if (!keyExists) {
				// First launch - generate and store new encryption key
				await this.generateAndStoreKey();
			} else {
				// Load existing key from Keychain/Keystore
				await this.loadKey();
			}

			this.isInitialized = true;
		} catch (error) {
			console.error("EncryptionService.initialize error:", error);
			throw new Error("Failed to initialize encryption service");
		}
	}

	/**
	 * Generate a new encryption key and store it securely
	 */
	private static async generateAndStoreKey(): Promise<void> {
		try {
			// Generate a random 256-bit (32 bytes) key
			const key = this.generateRandomKey(32);

			// Store in Keychain (iOS) or Keystore (Android)
			await Keychain.setGenericPassword(ENCRYPTION_KEY_ALIAS, key, {
				service: ENCRYPTION_KEY_ALIAS,
				accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
				accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
				securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
			});

			// Mark that key has been generated
			storage.set(ENCRYPTION_KEY_GENERATED_FLAG, true);

			// Cache the key in memory
			this.encryptionKey = key;

			console.log("Encryption key generated and stored successfully");
		} catch (error) {
			console.error("Failed to generate and store encryption key:", error);
			throw error;
		}
	}

	/**
	 * Load existing encryption key from secure storage
	 */
	private static async loadKey(): Promise<void> {
		try {
			const credentials = await Keychain.getGenericPassword({
				service: ENCRYPTION_KEY_ALIAS,
			});

			if (credentials && typeof credentials !== "boolean") {
				this.encryptionKey = credentials.password;
				console.log("Encryption key loaded successfully");
			} else {
				throw new Error("Encryption key not found in secure storage");
			}
		} catch (error) {
			console.error("Failed to load encryption key:", error);
			throw error;
		}
	}

	/**
	 * Get the encryption key
	 * Used by WatermelonDB for database encryption
	 */
	static async getEncryptionKey(): Promise<string> {
		await this.ensureInitialized();

		if (!this.encryptionKey) {
			throw new Error("Encryption key not available");
		}

		return this.encryptionKey;
	}

	/**
	 * Generate a cryptographically secure random encryption key
	 */
	private static generateRandomKey(length: number): string {
		try {
			const bytes = QuickCrypto.randomBytes(length);
			const hexKey = bytes.toString("hex");

			return hexKey;
		} catch (error) {
			console.error("Failed to generate secure random key:", error);
			throw new Error("Failed to generate encryption key");
		}
	}

	/**
	 * Check if encryption key exists
	 */
	static async hasEncryptionKey(): Promise<boolean> {
		try {
			const keyExists = storage.getBoolean(ENCRYPTION_KEY_GENERATED_FLAG);
			return keyExists ?? false;
		} catch (error) {
			console.error("Failed to check encryption key existence:", error);
			return false;
		}
	}

	/**
	 * Delete the encryption key (used when user deletes all data)
	 */
	static async deleteEncryptionKey(): Promise<void> {
		try {
			// Remove from Keychain/Keystore
			await Keychain.resetGenericPassword({
				service: ENCRYPTION_KEY_ALIAS,
			});

			// Remove flag from MMKV
			storage.delete(ENCRYPTION_KEY_GENERATED_FLAG);

			// Clear cached key
			this.encryptionKey = null;
			this.isInitialized = false;

			console.log("Encryption key deleted successfully");
		} catch (error) {
			console.error("Failed to delete encryption key:", error);
			throw error;
		}
	}

	/**
	 * Regenerate encryption key (for advanced use cases)
	 * WARNING: This will make existing encrypted data unreadable
	 */
	static async regenerateKey(): Promise<void> {
		try {
			// Delete existing key
			await this.deleteEncryptionKey();

			// Generate new key
			await this.generateAndStoreKey();

			console.log("Encryption key regenerated successfully");
		} catch (error) {
			console.error("Failed to regenerate encryption key:", error);
			throw error;
		}
	}

	/**
	 * Check if Keychain/Keystore is available
	 */
	static async isKeychainAvailable(): Promise<boolean> {
		try {
			await Keychain.getSupportedBiometryType();
			return true; // If no error, Keychain/Keystore is available
		} catch (error) {
			console.error("Keychain/Keystore not available:", error);
			return false;
		}
	}

	/**
	 * Get security information about stored credentials
	 */
	static async getSecurityInfo(): Promise<{
		isKeychainAvailable: boolean;
		hasEncryptionKey: boolean;
		biometryType: string | null;
	}> {
		try {
			const [isAvailable, hasKey, biometryType] = await Promise.all([
				this.isKeychainAvailable(),
				this.hasEncryptionKey(),
				Keychain.getSupportedBiometryType(),
			]);

			return {
				isKeychainAvailable: isAvailable,
				hasEncryptionKey: hasKey,
				biometryType: biometryType || null,
			};
		} catch (error) {
			console.error("Failed to get security info:", error);
			return {
				isKeychainAvailable: false,
				hasEncryptionKey: false,
				biometryType: null,
			};
		}
	}

	/**
	 * Ensure service is initialized
	 */
	private static async ensureInitialized(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize();
		}
	}

	/**
	 * Clear cached encryption key from memory
	 * (for security when app goes to background)
	 */
	static clearMemoryCache(): void {
		this.encryptionKey = null;
	}

	/**
	 * Reload encryption key from secure storage
	 * (after clearing memory cache)
	 */
	static async reloadKey(): Promise<void> {
		if (this.isInitialized) {
			await this.loadKey();
		} else {
			await this.initialize();
		}
	}
}
