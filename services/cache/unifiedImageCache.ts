import RNFS from "react-native-fs";
import { memoryManager } from "../memory/memoryManager";
import { formatBytes } from "../../utils/heapMonitor";

interface CacheEntry {
	key: string;
	uri: string;
	size: number;
	lastAccessed: number;
	createdAt: number;
	accessCount: number;
	source: string;
}

interface CacheStats {
	entries: number;
	totalSize: number;
	hitRate: number;
	oldestEntry: number;
	mostAccessed: string | null;
}

/**
 * Unified image cache for all services
 * Memory-aware with automatic cleanup
 */
export class UnifiedImageCache {
	private static instance: UnifiedImageCache;

	private cache = new Map<string, CacheEntry>();
	private totalSize = 0;
	private readonly maxSize: number;
	private readonly maxAge: number;
	private hits = 0;
	private misses = 0;
	private cleanupInProgress = false;

	// Configurable limits
	private readonly DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
	private readonly CRITICAL_SIZE = 75 * 1024 * 1024; // 75MB
	private readonly MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
	private readonly MIN_ENTRIES = 10; // Keep at least 10 entries

	private constructor(maxSizeMB: number = 50) {
		this.maxSize = maxSizeMB * 1024 * 1024;
		this.maxAge = this.MAX_AGE_MS;

		// Register with memory manager for cleanup
		this.registerMemoryPressureHandler();

		console.log(
			`[UnifiedImageCache] Initialized with max size: ${formatBytes(this.maxSize)}`,
		);
	}

	static getInstance(maxSizeMB?: number): UnifiedImageCache {
		if (!UnifiedImageCache.instance) {
			UnifiedImageCache.instance = new UnifiedImageCache(maxSizeMB);
		}
		return UnifiedImageCache.instance;
	}

	/**
	 * Register memory pressure handler
	 */
	private registerMemoryPressureHandler(): void {
		memoryManager.onMemoryPressure(async () => {
			console.log(
				"[UnifiedImageCache] Memory pressure detected, reducing cache",
			);
			// Reduce cache to 30% of max size under memory pressure
			await this.trimToSize(this.maxSize * 0.3);
		});
	}

	/**
	 * Get a cached image
	 */
	async get(key: string): Promise<string | null> {
		const entry = this.cache.get(key);

		if (!entry) {
			this.misses++;
			return null;
		}

		// Check if file still exists
		try {
			const exists = await RNFS.exists(entry.uri);
			if (!exists) {
				console.warn(`[UnifiedImageCache] Cached file missing: ${key}`);
				this.remove(key);
				this.misses++;
				return null;
			}
		} catch (error) {
			console.warn(
				`[UnifiedImageCache] Error checking cached file: ${key}`,
				error,
			);
			this.remove(key);
			this.misses++;
			return null;
		}

		// Update access info
		entry.lastAccessed = Date.now();
		entry.accessCount++;
		this.hits++;

		// Check if entry is too old
		const age = Date.now() - entry.createdAt;
		if (age > this.maxAge) {
			console.log(`[UnifiedImageCache] Entry expired: ${key}`);
			await this.remove(key);
			this.misses++;
			return null;
		}

		return entry.uri;
	}

	/**
	 * Add an image to cache
	 */
	async set(
		key: string,
		uri: string,
		size: number = 0,
		source: string = "unknown",
	): Promise<void> {
		// Check if we're already at critical size
		if (this.totalSize > this.CRITICAL_SIZE) {
			console.warn(
				"[UnifiedImageCache] Cache at critical size, emergency cleanup",
			);
			await this.trimToSize(this.maxSize * 0.5);
		}

		// Remove existing entry if present
		if (this.cache.has(key)) {
			await this.remove(key);
		}

		// Get actual file size if not provided
		if (size === 0) {
			try {
				const stat = await RNFS.stat(uri);
				size = stat.size;
			} catch (error) {
				console.warn(`[UnifiedImageCache] Could not stat file: ${uri}`);
				size = 100000; // Assume 100KB if we can't stat
			}
		}

		// Check if single item is too large
		if (size > this.maxSize * 0.5) {
			console.warn(
				`[UnifiedImageCache] Item too large (${formatBytes(size)}), not caching`,
			);
			return;
		}

		// Make room if needed
		if (this.totalSize + size > this.maxSize) {
			await this.makeRoom(size);
		}

		// Add to cache
		const entry: CacheEntry = {
			key,
			uri,
			size,
			lastAccessed: Date.now(),
			createdAt: Date.now(),
			accessCount: 1,
			source,
		};

		this.cache.set(key, entry);
		this.totalSize += size;

		console.log(
			`[UnifiedImageCache] Cached ${key} from ${source} ` +
				`(${formatBytes(size)}), total: ${formatBytes(this.totalSize)}`,
		);
	}

	/**
	 * Remove an entry from cache
	 */
	async remove(key: string): Promise<void> {
		const entry = this.cache.get(key);
		if (!entry) return;

		// Try to delete the file
		try {
			const exists = await RNFS.exists(entry.uri);
			if (exists) {
				await RNFS.unlink(entry.uri);
			}
		} catch (error) {
			console.warn(
				`[UnifiedImageCache] Failed to delete cached file: ${entry.uri}`,
			);
		}

		this.totalSize -= entry.size;
		this.cache.delete(key);

		console.log(
			`[UnifiedImageCache] Removed ${key}, freed ${formatBytes(entry.size)}`,
		);
	}

	/**
	 * Make room for new entry by removing old entries
	 */
	private async makeRoom(requiredSize: number): Promise<void> {
		const targetSize = this.maxSize - requiredSize;

		console.log(
			`[UnifiedImageCache] Making room for ${formatBytes(requiredSize)}, ` +
				`target: ${formatBytes(targetSize)}`,
		);

		await this.trimToSize(targetSize);
	}

	/**
	 * Trim cache to target size using LRU strategy
	 */
	async trimToSize(targetSize: number): Promise<void> {
		if (this.cleanupInProgress) {
			console.log("[UnifiedImageCache] Cleanup already in progress");
			return;
		}

		this.cleanupInProgress = true;

		try {
			if (this.totalSize <= targetSize) {
				return;
			}

			console.log(
				`[UnifiedImageCache] Trimming from ${formatBytes(this.totalSize)} ` +
					`to ${formatBytes(targetSize)}`,
			);

			// Sort entries by access time (LRU) and access count
			const entries = Array.from(this.cache.values()).sort((a, b) => {
				// First by access count (less accessed = higher priority for removal)
				if (a.accessCount !== b.accessCount) {
					return a.accessCount - b.accessCount;
				}
				// Then by last access time
				return a.lastAccessed - b.lastAccessed;
			});

			// Keep minimum entries
			const entriesToRemove = Math.max(0, entries.length - this.MIN_ENTRIES);
			let removed = 0;

			for (let i = 0; i < entriesToRemove && this.totalSize > targetSize; i++) {
				const entry = entries[i];
				await this.remove(entry.key);
				removed++;
			}

			console.log(
				`[UnifiedImageCache] Removed ${removed} entries, ` +
					`new size: ${formatBytes(this.totalSize)}`,
			);
		} finally {
			this.cleanupInProgress = false;
		}
	}

	/**
	 * Clear all cache entries
	 */
	async clearAll(): Promise<void> {
		console.log("[UnifiedImageCache] Clearing all cache");

		const keys = Array.from(this.cache.keys());

		for (const key of keys) {
			await this.remove(key);
		}

		this.cache.clear();
		this.totalSize = 0;
		this.hits = 0;
		this.misses = 0;

		console.log("[UnifiedImageCache] Cache cleared");
	}

	/**
	 * Clean expired entries
	 */
	async cleanExpired(): Promise<number> {
		const now = Date.now();
		const expired: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.createdAt > this.maxAge) {
				expired.push(key);
			}
		}

		for (const key of expired) {
			await this.remove(key);
		}

		if (expired.length > 0) {
			console.log(
				`[UnifiedImageCache] Cleaned ${expired.length} expired entries`,
			);
		}

		return expired.length;
	}

	/**
	 * Handle memory pressure
	 */
	async handleMemoryPressure(): Promise<void> {
		console.warn("[UnifiedImageCache] Handling memory pressure");

		// First clean expired
		await this.cleanExpired();

		// Then trim to 30% of max size
		await this.trimToSize(this.maxSize * 0.3);

		// Log new state
		const stats = this.getStats();
		console.log(
			`[UnifiedImageCache] After pressure cleanup: ${stats.entries} entries, ` +
				`${formatBytes(stats.totalSize)}`,
		);
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		let oldestEntry = Date.now();
		let mostAccessed: string | null = null;
		let maxAccessCount = 0;

		for (const entry of this.cache.values()) {
			if (entry.createdAt < oldestEntry) {
				oldestEntry = entry.createdAt;
			}
			if (entry.accessCount > maxAccessCount) {
				maxAccessCount = entry.accessCount;
				mostAccessed = entry.key;
			}
		}

		const total = this.hits + this.misses;
		const hitRate = total > 0 ? this.hits / total : 0;

		return {
			entries: this.cache.size,
			totalSize: this.totalSize,
			hitRate,
			oldestEntry: Date.now() - oldestEntry,
			mostAccessed,
		};
	}

	/**
	 * Migrate from old cache system
	 */
	async migrateFromOldCache(oldCachePath: string): Promise<void> {
		try {
			const exists = await RNFS.exists(oldCachePath);
			if (!exists) return;

			const files = await RNFS.readDir(oldCachePath);
			let migrated = 0;

			for (const file of files) {
				if (file.isFile()) {
					// Generate key from filename
					const key = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
					await this.set(key, file.path, file.size, "migration");
					migrated++;
				}
			}

			console.log(
				`[UnifiedImageCache] Migrated ${migrated} files from old cache`,
			);
		} catch (error) {
			console.error("[UnifiedImageCache] Migration failed:", error);
		}
	}

	/**
	 * Check if cache contains key
	 */
	has(key: string): boolean {
		return this.cache.has(key);
	}

	/**
	 * Get cache size info
	 */
	getSizeInfo(): {
		current: number;
		max: number;
		percentage: number;
		formatted: string;
	} {
		const percentage = (this.totalSize / this.maxSize) * 100;

		return {
			current: this.totalSize,
			max: this.maxSize,
			percentage,
			formatted: `${formatBytes(this.totalSize)} / ${formatBytes(this.maxSize)} (${percentage.toFixed(1)}%)`,
		};
	}
}

// Export singleton instance
export const unifiedImageCache = UnifiedImageCache.getInstance();
