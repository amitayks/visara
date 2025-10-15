/**
 * CleanupService
 *
 * Automatic cleanup service for temporary files and deleted media thumbnails.
 * Per spec FR-075: "System MUST implement automatic cleanup of temporary files
 * created during processing"
 *
 * **Responsibilities:**
 * 1. Clean up orphaned thumbnails (media file deleted but thumbnail remains)
 * 2. Clean up temporary processing files
 * 3. Clean up old cache files
 * 4. Schedule periodic cleanup tasks
 *
 * **Usage:**
 * ```ts
 * // Start automatic cleanup (runs periodically)
 * CleanupService.startAutoCleanup();
 *
 * // Manual cleanup
 * await CleanupService.cleanupOrphanedThumbnails();
 * await CleanupService.cleanupTempFiles();
 *
 * // Stop automatic cleanup
 * CleanupService.stopAutoCleanup();
 * ```
 */

import { MediaFileRepository } from "@services/database/MediaFileRepository";
import RNFS from "react-native-fs";

export interface CleanupStats {
	orphanedThumbnails: number;
	tempFiles: number;
	cacheFiles: number;
	totalBytesFreed: number;
}

export interface CleanupConfig {
	/**
	 * Interval between automatic cleanup runs (milliseconds)
	 * Default: 1 hour (3600000ms)
	 */
	cleanupInterval?: number;

	/**
	 * Age threshold for cache files to be deleted (milliseconds)
	 * Default: 7 days (604800000ms)
	 */
	cacheMaxAge?: number;

	/**
	 * Enable logging
	 * Default: true
	 */
	enableLogging?: boolean;
}

export class CleanupService {
	private static cleanupTimer: NodeJS.Timeout | null = null;
	private static isRunning = false;
	private static config: Required<CleanupConfig> = {
		cleanupInterval: 3600000, // 1 hour
		cacheMaxAge: 604800000, // 7 days
		enableLogging: true,
	};

	/**
	 * Start automatic cleanup with configurable interval
	 */
	static startAutoCleanup(config?: CleanupConfig): void {
		if (this.cleanupTimer) {
			this.log("Auto cleanup already running");
			return;
		}

		// Merge config
		this.config = { ...this.config, ...config };

		this.log("Starting auto cleanup service...");

		// Run immediately
		this.runCleanup();

		// Then run periodically
		this.cleanupTimer = setInterval(() => {
			this.runCleanup();
		}, this.config.cleanupInterval);
	}

	/**
	 * Stop automatic cleanup
	 */
	static stopAutoCleanup(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
			this.log("Auto cleanup stopped");
		}
	}

	/**
	 * Run full cleanup process
	 */
	private static async runCleanup(): Promise<void> {
		if (this.isRunning) {
			this.log("Cleanup already in progress, skipping...");
			return;
		}

		this.isRunning = true;
		this.log("Running cleanup...");

		try {
			const stats: CleanupStats = {
				orphanedThumbnails: 0,
				tempFiles: 0,
				cacheFiles: 0,
				totalBytesFreed: 0,
			};

			// Clean up orphaned thumbnails
			const thumbnailStats = await this.cleanupOrphanedThumbnails();
			stats.orphanedThumbnails = thumbnailStats.count;
			stats.totalBytesFreed += thumbnailStats.bytesFreed;

			// Clean up temp files
			const tempStats = await this.cleanupTempFiles();
			stats.tempFiles = tempStats.count;
			stats.totalBytesFreed += tempStats.bytesFreed;

			// Clean up old cache
			const cacheStats = await this.cleanupOldCache();
			stats.cacheFiles = cacheStats.count;
			stats.totalBytesFreed += cacheStats.bytesFreed;

			this.log(
				`Cleanup complete: ${stats.orphanedThumbnails} thumbnails, ${stats.tempFiles} temp files, ${stats.cacheFiles} cache files removed. ${this.formatBytes(stats.totalBytesFreed)} freed.`,
			);
		} catch (error) {
			console.error("Cleanup error:", error);
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Clean up orphaned thumbnails
	 * (thumbnails for media files that no longer exist in database)
	 */
	static async cleanupOrphanedThumbnails(): Promise<{
		count: number;
		bytesFreed: number;
	}> {
		let count = 0;
		let bytesFreed = 0;

		try {
			const thumbnailDir = `${RNFS.CachesDirectoryPath}/thumbnails`;

			// Check if directory exists
			const exists = await RNFS.exists(thumbnailDir);
			if (!exists) {
				this.log("Thumbnail directory does not exist");
				return { count, bytesFreed };
			}

			// Get all thumbnail files
			const files = await RNFS.readDir(thumbnailDir);

			// Get all media files from database
			const mediaFiles = await MediaFileRepository.getAll();
			const validThumbnailUris = new Set(
				mediaFiles.filter((m) => m.thumbnailUri).map((m) => m.thumbnailUri),
			);

			// Check each thumbnail file
			for (const file of files) {
				const thumbnailUri = `file://${file.path}`;

				// If thumbnail not in database, delete it
				if (!validThumbnailUris.has(thumbnailUri)) {
					const stat = await RNFS.stat(file.path);
					await RNFS.unlink(file.path);
					count++;
					bytesFreed += Number(stat.size);
					this.log(`Deleted orphaned thumbnail: ${file.name}`);
				}
			}
		} catch (error) {
			console.error("Error cleaning orphaned thumbnails:", error);
		}

		return { count, bytesFreed };
	}

	/**
	 * Clean up temporary processing files
	 */
	static async cleanupTempFiles(): Promise<{
		count: number;
		bytesFreed: number;
	}> {
		let count = 0;
		let bytesFreed = 0;

		try {
			const tempDir = RNFS.TemporaryDirectoryPath;

			// Get all temp files
			const files = await RNFS.readDir(tempDir);

			// Delete files related to our app (prefix: visara_)
			for (const file of files) {
				if (file.name.startsWith("visara_")) {
					const stat = await RNFS.stat(file.path);
					await RNFS.unlink(file.path);
					count++;
					bytesFreed += Number(stat.size);
					this.log(`Deleted temp file: ${file.name}`);
				}
			}
		} catch (error) {
			console.error("Error cleaning temp files:", error);
		}

		return { count, bytesFreed };
	}

	/**
	 * Clean up old cache files
	 * (files older than cacheMaxAge)
	 */
	static async cleanupOldCache(): Promise<{
		count: number;
		bytesFreed: number;
	}> {
		let count = 0;
		let bytesFreed = 0;

		try {
			const cacheDir = RNFS.CachesDirectoryPath;

			// Get all cache files
			const files = await RNFS.readDir(cacheDir);

			const now = Date.now();
			const maxAge = this.config.cacheMaxAge;

			// Check each file
			for (const file of files) {
				// Skip thumbnail directory
				if (file.isDirectory() && file.name === "thumbnails") {
					continue;
				}

				// Check age
				const stat = await RNFS.stat(file.path);
				const age = now - new Date(stat.mtime).getTime();

				if (age > maxAge) {
					if (file.isFile()) {
						await RNFS.unlink(file.path);
						count++;
						bytesFreed += Number(stat.size);
						this.log(
							`Deleted old cache file: ${file.name} (age: ${Math.round(age / 86400000)} days)`,
						);
					}
				}
			}
		} catch (error) {
			console.error("Error cleaning old cache:", error);
		}

		return { count, bytesFreed };
	}

	/**
	 * Clean up all thumbnails
	 * WARNING: This deletes ALL thumbnails, forcing regeneration
	 */
	static async cleanupAllThumbnails(): Promise<number> {
		let count = 0;

		try {
			const thumbnailDir = `${RNFS.CachesDirectoryPath}/thumbnails`;

			const exists = await RNFS.exists(thumbnailDir);
			if (!exists) {
				return 0;
			}

			const files = await RNFS.readDir(thumbnailDir);

			for (const file of files) {
				await RNFS.unlink(file.path);
				count++;
			}

			this.log(`Deleted all thumbnails: ${count} files`);
		} catch (error) {
			console.error("Error cleaning all thumbnails:", error);
		}

		return count;
	}

	/**
	 * Clean up all cache
	 * WARNING: This deletes ALL cache, including thumbnails
	 */
	static async cleanupAllCache(): Promise<number> {
		let count = 0;

		try {
			const cacheDir = RNFS.CachesDirectoryPath;

			// Delete entire cache directory
			const exists = await RNFS.exists(cacheDir);
			if (exists) {
				await RNFS.unlink(cacheDir);
				// Recreate cache directory
				await RNFS.mkdir(cacheDir);
				this.log("Deleted all cache");
			}
		} catch (error) {
			console.error("Error cleaning all cache:", error);
		}

		return count;
	}

	/**
	 * Get cleanup statistics without performing cleanup
	 */
	static async getCleanupStats(): Promise<CleanupStats> {
		const stats: CleanupStats = {
			orphanedThumbnails: 0,
			tempFiles: 0,
			cacheFiles: 0,
			totalBytesFreed: 0,
		};

		try {
			// Count orphaned thumbnails
			const thumbnailDir = `${RNFS.CachesDirectoryPath}/thumbnails`;
			if (await RNFS.exists(thumbnailDir)) {
				const files = await RNFS.readDir(thumbnailDir);
				const mediaFiles = await MediaFileRepository.getAll();
				const validThumbnailUris = new Set(
					mediaFiles.filter((m) => m.thumbnailUri).map((m) => m.thumbnailUri),
				);

				for (const file of files) {
					const thumbnailUri = `file://${file.path}`;
					if (!validThumbnailUris.has(thumbnailUri)) {
						stats.orphanedThumbnails++;
						const stat = await RNFS.stat(file.path);
						stats.totalBytesFreed += Number(stat.size);
					}
				}
			}

			// Count temp files
			const tempDir = RNFS.TemporaryDirectoryPath;
			const tempFiles = await RNFS.readDir(tempDir);
			for (const file of tempFiles) {
				if (file.name.startsWith("visara_")) {
					stats.tempFiles++;
					const stat = await RNFS.stat(file.path);
					stats.totalBytesFreed += Number(stat.size);
				}
			}

			// Count old cache files
			const cacheDir = RNFS.CachesDirectoryPath;
			const cacheFiles = await RNFS.readDir(cacheDir);
			const now = Date.now();
			const maxAge = this.config.cacheMaxAge;

			for (const file of cacheFiles) {
				if (file.isDirectory() && file.name === "thumbnails") {
					continue;
				}

				const stat = await RNFS.stat(file.path);
				const age = now - new Date(stat.mtime).getTime();

				if (age > maxAge && file.isFile()) {
					stats.cacheFiles++;
					stats.totalBytesFreed += Number(stat.size);
				}
			}
		} catch (error) {
			console.error("Error getting cleanup stats:", error);
		}

		return stats;
	}

	/**
	 * Format bytes to human-readable string
	 */
	private static formatBytes(bytes: number): string {
		if (bytes === 0) return "0 Bytes";

		const k = 1024;
		const sizes = ["Bytes", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
	}

	/**
	 * Log message if logging enabled
	 */
	private static log(message: string): void {
		if (this.config.enableLogging) {
			console.log(`[CleanupService] ${message}`);
		}
	}
}
