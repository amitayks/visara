/**
 * Storage Monitoring Utilities
 *
 * Provides functions to check device storage space and determine
 * if processing should continue based on available storage.
 *
 * Constitutional alignment:
 * - Performance & Optimization Standards: Resource constraints
 * - User Experience Excellence: Graceful degradation
 */

import RNFS from "react-native-fs";

export interface StorageInfo {
	totalSpace: number; // Total storage in bytes
	freeSpace: number; // Available storage in bytes
	usedSpace: number; // Used storage in bytes
	freePercentage: number; // 0-1 (0% to 100%)
	usedPercentage: number; // 0-1 (0% to 100%)
}

/**
 * Minimum free storage threshold in bytes (500MB)
 * Processing will pause if free storage falls below this
 */
const MIN_FREE_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB

/**
 * Warning threshold as percentage (10%)
 * Warn when free storage is below 10%
 */
const WARNING_THRESHOLD_PERCENTAGE = 0.1;

/**
 * Get current storage information
 */
export async function getStorageInfo(): Promise<StorageInfo> {
	try {
		const fsInfo = await RNFS.getFSInfo();
		const totalSpace = fsInfo.totalSpace;
		const freeSpace = fsInfo.freeSpace;

		const usedSpace = totalSpace - freeSpace;
		const freePercentage = totalSpace > 0 ? freeSpace / totalSpace : 0;
		const usedPercentage = totalSpace > 0 ? usedSpace / totalSpace : 0;

		return {
			totalSpace,
			freeSpace,
			usedSpace,
			freePercentage,
			usedPercentage,
		};
	} catch (error) {
		console.error("Failed to get storage info:", error);
		// Return safe defaults if storage info is unavailable
		return {
			totalSpace: 0,
			freeSpace: MIN_FREE_STORAGE_BYTES * 2, // Assume enough space
			usedSpace: 0,
			freePercentage: 1.0,
			usedPercentage: 0,
		};
	}
}

/**
 * Check if storage is low (below minimum threshold)
 */
export async function isStorageLow(): Promise<boolean> {
	try {
		const storageInfo = await getStorageInfo();
		return storageInfo.freeSpace < MIN_FREE_STORAGE_BYTES;
	} catch (error) {
		console.error("Failed to check storage level:", error);
		return false; // Assume not low if unavailable
	}
}

/**
 * Check if storage is critically low (below warning threshold percentage)
 */
export async function isStorageCriticallyLow(): Promise<boolean> {
	try {
		const storageInfo = await getStorageInfo();
		return (
			storageInfo.freePercentage < WARNING_THRESHOLD_PERCENTAGE ||
			storageInfo.freeSpace < MIN_FREE_STORAGE_BYTES
		);
	} catch (error) {
		console.error("Failed to check critical storage level:", error);
		return false;
	}
}

/**
 * Check if there's enough storage for processing
 */
export async function hasEnoughStorage(): Promise<boolean> {
	try {
		const storageInfo = await getStorageInfo();
		return storageInfo.freeSpace >= MIN_FREE_STORAGE_BYTES;
	} catch (error) {
		console.error("Failed to check storage availability:", error);
		// On error, allow processing to continue
		return true;
	}
}

/**
 * Get free space in human-readable format
 */
export async function getFormattedFreeSpace(): Promise<string> {
	try {
		const storageInfo = await getStorageInfo();
		return formatBytes(storageInfo.freeSpace);
	} catch (error) {
		console.error("Failed to get formatted free space:", error);
		return "Unknown";
	}
}

/**
 * Get total space in human-readable format
 */
export async function getFormattedTotalSpace(): Promise<string> {
	try {
		const storageInfo = await getStorageInfo();
		return formatBytes(storageInfo.totalSpace);
	} catch (error) {
		console.error("Failed to get formatted total space:", error);
		return "Unknown";
	}
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";

	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get storage warning message if storage is low
 */
export async function getStorageWarningMessage(): Promise<string | null> {
	try {
		const storageInfo = await getStorageInfo();

		if (storageInfo.freeSpace < MIN_FREE_STORAGE_BYTES) {
			const freeFormatted = formatBytes(storageInfo.freeSpace);
			const minFormatted = formatBytes(MIN_FREE_STORAGE_BYTES);
			return `Storage is low (${freeFormatted} free). Processing paused. Please free up space (minimum ${minFormatted} required).`;
		}

		if (storageInfo.freePercentage < WARNING_THRESHOLD_PERCENTAGE) {
			const percentFree = Math.round(storageInfo.freePercentage * 100);
			return `Storage is critically low (${percentFree}% free). Consider freeing up space.`;
		}

		return null;
	} catch (error) {
		console.error("Failed to get storage warning message:", error);
		return null;
	}
}

/**
 * Check if processing should be allowed based on storage
 * Used before starting processing or processing individual items
 */
export async function shouldAllowProcessing(): Promise<{
	allowed: boolean;
	reason?: string;
}> {
	try {
		const storageInfo = await getStorageInfo();

		if (storageInfo.freeSpace < MIN_FREE_STORAGE_BYTES) {
			const freeFormatted = formatBytes(storageInfo.freeSpace);
			const minFormatted = formatBytes(MIN_FREE_STORAGE_BYTES);
			return {
				allowed: false,
				reason: `Insufficient storage: ${freeFormatted} free (minimum ${minFormatted} required)`,
			};
		}

		return { allowed: true };
	} catch (error) {
		console.error("Failed to check if processing should be allowed:", error);
		// On error, allow processing to continue
		return { allowed: true };
	}
}
