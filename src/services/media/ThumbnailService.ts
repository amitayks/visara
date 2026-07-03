import ImageResizer from "@bam.tech/react-native-image-resizer";
import RNFS from "@dr.pogodin/react-native-fs";
import { storage } from "@services/storage/mmkv";

// Constants
const MEMORY_CACHE_SIZE_MB = 50;
const DISK_CACHE_SIZE_MB = 500;
const MEMORY_CACHE_SIZE_BYTES = MEMORY_CACHE_SIZE_MB * 1024 * 1024;
const DISK_CACHE_SIZE_BYTES = DISK_CACHE_SIZE_MB * 1024 * 1024;

const THUMBNAIL_DIMENSIONS = {
	small: { width: 200, height: 200 },
	medium: { width: 400, height: 400 },
	large: { width: 800, height: 800 },
} as const;

export type ThumbnailSize = keyof typeof THUMBNAIL_DIMENSIONS;

interface CacheEntry {
	uri: string;
	size: number;
	lastAccessed: number;
}

interface DiskCacheMetadata {
	[key: string]: {
		path: string;
		size: number;
		lastAccessed: number;
	};
}

/**
 * ThumbnailService provides 3-tier caching for media thumbnails:
 * 1. Memory cache (50MB, LRU)
 * 2. Disk cache (500MB, persistent)
 * 3. On-demand generation (fallback)
 */
export class ThumbnailService {
	// Tier 1: Memory cache (LRU)
	private static memoryCache = new Map<string, CacheEntry>();
	private static memoryCacheSize = 0;
	private static accessOrder: string[] = [];

	// Tier 2: Disk cache directory
	private static diskCacheDir = `${RNFS.CachesDirectoryPath}/thumbnails`;
	private static diskCacheMetadataKey = "thumbnail_disk_cache_metadata";

	// Initialization flag
	private static initialized = false;

	/**
	 * Initialize thumbnail service
	 */
	static async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Create disk cache directory if it doesn't exist
			const dirExists = await RNFS.exists(this.diskCacheDir);
			if (!dirExists) {
				await RNFS.mkdir(this.diskCacheDir);
			}

			// Load disk cache metadata from MMKV
			const metadataJson = storage.getString(this.diskCacheMetadataKey);
			if (metadataJson) {
				const metadata: DiskCacheMetadata = JSON.parse(metadataJson);
				// Verify files still exist and clean up stale entries
				await this.cleanupStaleEntries(metadata);
			}

			this.initialized = true;
		} catch (error) {
			console.error("ThumbnailService.initialize error:", error);
			throw new Error("Failed to initialize ThumbnailService");
		}
	}

	/**
	 * Get thumbnail URI for a media file
	 * Checks all 3 cache tiers before generating
	 */
	static async getThumbnail(
		originalUri: string,
		size: ThumbnailSize = "medium",
	): Promise<string> {
		await this.ensureInitialized();

		const cacheKey = this.getCacheKey(originalUri, size);

		// Tier 1: Check memory cache
		const memoryEntry = this.getFromMemoryCache(cacheKey);
		if (memoryEntry) {
			return memoryEntry.uri;
		}

		// Tier 2: Check disk cache
		const diskEntry = await this.getFromDiskCache(cacheKey);
		if (diskEntry) {
			// Ensure path has file:// prefix
			const uri = diskEntry.path.startsWith("file://")
				? diskEntry.path
				: `file://${diskEntry.path}`;
			// Promote to memory cache
			this.addToMemoryCache(cacheKey, uri, diskEntry.size);
			return uri;
		}

		// Tier 3: Generate thumbnail on-demand
		const thumbnailUri = await this.generateThumbnail(originalUri, size);

		// Get actual file size for cache management
		const fileSize = await this.getFileSize(thumbnailUri);

		// Store in both caches
		this.addToMemoryCache(cacheKey, thumbnailUri, fileSize);
		await this.addToDiskCache(cacheKey, thumbnailUri);

		return thumbnailUri;
	}

	/**
	 * Tier 1: Get from memory cache
	 */
	private static getFromMemoryCache(key: string): CacheEntry | null {
		const entry = this.memoryCache.get(key);
		if (!entry) return null;

		// Update last accessed time and access order
		entry.lastAccessed = Date.now();
		this.updateAccessOrder(key);

		return entry;
	}

	/**
	 * Tier 1: Add to memory cache with LRU eviction
	 */
	private static addToMemoryCache(
		key: string,
		uri: string,
		size: number,
	): void {
		// If entry exists, update it
		if (this.memoryCache.has(key)) {
			const entry = this.memoryCache.get(key)!;
			entry.lastAccessed = Date.now();
			this.updateAccessOrder(key);
			return;
		}

		// Evict entries if we exceed memory limit
		while (
			this.memoryCacheSize + size > MEMORY_CACHE_SIZE_BYTES &&
			this.memoryCache.size > 0
		) {
			this.evictOldestMemoryEntry();
		}

		// Add new entry
		const entry: CacheEntry = {
			uri,
			size,
			lastAccessed: Date.now(),
		};

		this.memoryCache.set(key, entry);
		this.accessOrder.push(key);
		this.memoryCacheSize += size;
	}

	/**
	 * Tier 1: Evict oldest entry from memory cache (LRU)
	 */
	private static evictOldestMemoryEntry(): void {
		if (this.accessOrder.length === 0) return;

		const oldestKey = this.accessOrder.shift()!;
		const entry = this.memoryCache.get(oldestKey);

		if (entry) {
			this.memoryCacheSize -= entry.size;
			this.memoryCache.delete(oldestKey);
		}
	}

	/**
	 * Tier 1: Update access order for LRU
	 */
	private static updateAccessOrder(key: string): void {
		const index = this.accessOrder.indexOf(key);
		if (index > -1) {
			this.accessOrder.splice(index, 1);
		}
		this.accessOrder.push(key);
	}

	/**
	 * Tier 2: Get from disk cache
	 */
	private static async getFromDiskCache(
		key: string,
	): Promise<{ path: string; size: number } | null> {
		try {
			const metadata = this.getDiskCacheMetadata();
			const entry = metadata[key];

			if (!entry) return null;

			// Verify file still exists
			const exists = await RNFS.exists(entry.path);
			if (!exists) {
				// Clean up stale entry
				delete metadata[key];
				this.saveDiskCacheMetadata(metadata);
				return null;
			}

			// Update last accessed time
			entry.lastAccessed = Date.now();
			this.saveDiskCacheMetadata(metadata);

			return { path: entry.path, size: entry.size };
		} catch (error) {
			console.error("ThumbnailService.getFromDiskCache error:", error);
			return null;
		}
	}

	/**
	 * Tier 2: Add to disk cache
	 */
	private static async addToDiskCache(
		key: string,
		sourceUri: string,
	): Promise<void> {
		try {
			const metadata = this.getDiskCacheMetadata();

			// Get file size
			const fileSize = await this.getFileSize(sourceUri);

			// Calculate current total disk cache size
			let totalSize = Object.values(metadata).reduce(
				(sum, entry) => sum + entry.size,
				0,
			);

			// Evict oldest entries if we exceed disk limit
			while (
				totalSize + fileSize > DISK_CACHE_SIZE_BYTES &&
				Object.keys(metadata).length > 0
			) {
				const evictedSize = await this.evictOldestDiskEntry(metadata);
				totalSize -= evictedSize;
			}

			// The thumbnail is already generated and saved by ImageResizer
			// to the disk cache directory with the key as filename
			// We just need to track it in metadata
			const filePath = sourceUri.replace("file://", "");

			// Verify the file exists
			const exists = await RNFS.exists(filePath);
			if (!exists) {
				console.warn(`Thumbnail file not found: ${filePath}`);
				return;
			}

			// Add to metadata
			metadata[key] = {
				path: filePath,
				size: fileSize,
				lastAccessed: Date.now(),
			};

			this.saveDiskCacheMetadata(metadata);
		} catch (error) {
			console.error("ThumbnailService.addToDiskCache error:", error);
		}
	}

	/**
	 * Tier 2: Evict oldest entry from disk cache
	 */
	private static async evictOldestDiskEntry(
		metadata: DiskCacheMetadata,
	): Promise<number> {
		const entries = Object.entries(metadata);
		if (entries.length === 0) return 0;

		// Find oldest entry
		let oldestKey = entries[0][0];
		let oldestTime = entries[0][1].lastAccessed;

		for (const [key, entry] of entries) {
			if (entry.lastAccessed < oldestTime) {
				oldestKey = key;
				oldestTime = entry.lastAccessed;
			}
		}

		const entry = metadata[oldestKey];
		const size = entry.size;

		// Delete file
		try {
			const exists = await RNFS.exists(entry.path);
			if (exists) {
				await RNFS.unlink(entry.path);
			}
		} catch (error) {
			console.warn("Failed to delete cached thumbnail:", error);
		}

		// Remove from metadata
		delete metadata[oldestKey];

		return size;
	}

	/**
	 * Tier 3: Generate thumbnail on-demand
	 */
	private static async generateThumbnail(
		originalUri: string,
		size: ThumbnailSize,
	): Promise<string> {
		try {
			// Check if file is a PDF - ImageResizer can't handle PDFs
			if (this.isPdfFile(originalUri)) {
				// For PDFs, return original URI
				// TODO: Implement PDF thumbnail generation using a PDF library
				// like react-native-pdf or native PDF rendering APIs
				console.warn("PDF thumbnail generation not yet implemented");
				return originalUri;
			}

			const dimensions = THUMBNAIL_DIMENSIONS[size];
			const cacheKey = this.getCacheKey(originalUri, size);
			const outputPath = `${this.diskCacheDir}/${cacheKey}.jpg`;

			// Ensure disk cache directory exists
			const dirExists = await RNFS.exists(this.diskCacheDir);
			if (!dirExists) {
				await RNFS.mkdir(this.diskCacheDir);
			}

			// Use ImageResizer to create thumbnail
			// - mode: 'contain' maintains aspect ratio and fits within dimensions
			// - compressFormat: 'JPEG' for smaller file sizes
			// - quality: 80 provides good balance between quality and size
			// - keepMeta: false to reduce file size
			// - onlyScaleDown: true prevents upscaling small images
			const response = await ImageResizer.createResizedImage(
				originalUri,
				dimensions.width,
				dimensions.height,
				"JPEG",
				80, // quality
				0, // rotation
				outputPath,
				false, // keepMeta
				{
					mode: "contain",
					onlyScaleDown: true,
				},
			);

			// Return the generated thumbnail path
			return response.uri;
		} catch (error) {
			console.error("ThumbnailService.generateThumbnail error:", error);
			// Fallback to original URI if resizing fails
			return originalUri;
		}
	}

	/**
	 * Check if a file is a PDF based on URI
	 */
	private static isPdfFile(uri: string): boolean {
		return uri.toLowerCase().endsWith(".pdf");
	}

	/**
	 * Get disk cache metadata from MMKV
	 */
	private static getDiskCacheMetadata(): DiskCacheMetadata {
		try {
			const metadataJson = storage.getString(this.diskCacheMetadataKey);
			return metadataJson ? JSON.parse(metadataJson) : {};
		} catch (error) {
			console.error("Failed to load disk cache metadata:", error);
			return {};
		}
	}

	/**
	 * Save disk cache metadata to MMKV
	 */
	private static saveDiskCacheMetadata(metadata: DiskCacheMetadata): void {
		try {
			storage.set(this.diskCacheMetadataKey, JSON.stringify(metadata));
		} catch (error) {
			console.error("Failed to save disk cache metadata:", error);
		}
	}

	/**
	 * Generate cache key from original URI and size
	 */
	private static getCacheKey(uri: string, size: ThumbnailSize): string {
		// Create a simple hash from the URI and size
		const hash = this.simpleHash(`${uri}_${size}`);
		return `thumb_${size}_${hash}`;
	}

	/**
	 * Simple string hash function
	 */
	private static simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * Get file size in bytes
	 */
	private static async getFileSize(uri: string): Promise<number> {
		try {
			const path = uri.replace("file://", "");
			const stat = await RNFS.stat(path);
			return Number(stat.size);
		} catch (error) {
			console.warn("Failed to get file size:", error);
			// Estimate based on typical thumbnail size
			return 100 * 1024; // 100KB estimate
		}
	}

	/**
	 * Clean up stale entries that no longer exist on disk
	 */
	private static async cleanupStaleEntries(
		metadata: DiskCacheMetadata,
	): Promise<void> {
		const keys = Object.keys(metadata);
		let modified = false;

		for (const key of keys) {
			const entry = metadata[key];
			try {
				const exists = await RNFS.exists(entry.path);
				if (!exists) {
					delete metadata[key];
					modified = true;
				}
			} catch (_error) {
				// If we can't check, assume it's stale
				delete metadata[key];
				modified = true;
			}
		}

		if (modified) {
			this.saveDiskCacheMetadata(metadata);
		}
	}

	/**
	 * Clear all caches
	 */
	static async clearAllCaches(): Promise<void> {
		await this.ensureInitialized();

		try {
			// Clear memory cache
			this.memoryCache.clear();
			this.accessOrder = [];
			this.memoryCacheSize = 0;

			// Clear disk cache
			const metadata = this.getDiskCacheMetadata();
			for (const entry of Object.values(metadata)) {
				try {
					const exists = await RNFS.exists(entry.path);
					if (exists) {
						await RNFS.unlink(entry.path);
					}
				} catch (error) {
					console.warn("Failed to delete cached thumbnail:", error);
				}
			}

			// Clear metadata
			this.saveDiskCacheMetadata({});
		} catch (error) {
			console.error("ThumbnailService.clearAllCaches error:", error);
			throw new Error("Failed to clear thumbnail caches");
		}
	}

	/**
	 * Get cache statistics
	 */
	static async getCacheStats(): Promise<{
		memoryCache: { count: number; sizeBytes: number; sizeMB: number };
		diskCache: { count: number; sizeBytes: number; sizeMB: number };
	}> {
		await this.ensureInitialized();

		const metadata = this.getDiskCacheMetadata();
		const diskCacheSize = Object.values(metadata).reduce(
			(sum, entry) => sum + entry.size,
			0,
		);

		return {
			memoryCache: {
				count: this.memoryCache.size,
				sizeBytes: this.memoryCacheSize,
				sizeMB: this.memoryCacheSize / (1024 * 1024),
			},
			diskCache: {
				count: Object.keys(metadata).length,
				sizeBytes: diskCacheSize,
				sizeMB: diskCacheSize / (1024 * 1024),
			},
		};
	}

	/**
	 * Preload thumbnails for multiple URIs
	 */
	static async preloadThumbnails(
		uris: string[],
		size: ThumbnailSize = "medium",
	): Promise<void> {
		await this.ensureInitialized();

		// Process in batches to avoid overwhelming the system
		const batchSize = 10;
		for (let i = 0; i < uris.length; i += batchSize) {
			const batch = uris.slice(i, i + batchSize);
			await Promise.all(
				batch.map((uri) =>
					this.getThumbnail(uri, size).catch((error) => {
						console.warn(`Failed to preload thumbnail for ${uri}:`, error);
					}),
				),
			);
		}
	}

	/**
	 * Ensure service is initialized
	 */
	private static async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}
}
