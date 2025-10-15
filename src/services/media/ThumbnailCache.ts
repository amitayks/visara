/**
 * ThumbnailCache - LRU (Least Recently Used) cache for thumbnail URIs
 *
 * Implements an efficient in-memory LRU cache with:
 * - 50MB memory limit (configurable)
 * - O(1) get/set operations using Map + doubly linked list
 * - Automatic eviction of least recently used entries
 * - Memory usage tracking based on estimated thumbnail sizes
 * - Thread-safe operations
 *
 * Constitutional Alignment:
 * - Performance Standards: <16ms frame budget for thumbnails
 * - Memory Management: Part of <200MB baseline, <500MB during processing
 * - Efficient rendering: Instant UI responsiveness
 *
 * Usage:
 * ```typescript
 * // Initialize with 50MB limit
 * const cache = new ThumbnailCache(50 * 1024 * 1024);
 *
 * // Add thumbnail to cache
 * cache.set('image_key_123', 'file:///path/to/thumbnail.jpg', 150000);
 *
 * // Get thumbnail from cache
 * const uri = cache.get('image_key_123');
 *
 * // Check cache statistics
 * const stats = cache.getStats();
 * ```
 */

export interface CacheEntry {
	key: string;
	uri: string;
	size: number;
	timestamp: number;
}

export interface CacheNode {
	key: string;
	value: CacheEntry;
	prev: CacheNode | null;
	next: CacheNode | null;
}

export interface CacheStats {
	size: number;
	count: number;
	maxSize: number;
	hitRate: number;
	missRate: number;
	evictions: number;
}

/**
 * ThumbnailCache - Efficient LRU cache for thumbnails
 */
export class ThumbnailCache {
	private maxSize: number;
	private currentSize: number;
	private cache: Map<string, CacheNode>;
	private head: CacheNode | null;
	private tail: CacheNode | null;

	// Statistics
	private hits: number;
	private misses: number;
	private evictions: number;

	constructor(maxSizeBytes: number = 50 * 1024 * 1024) {
		this.maxSize = maxSizeBytes;
		this.currentSize = 0;
		this.cache = new Map();
		this.head = null;
		this.tail = null;
		this.hits = 0;
		this.misses = 0;
		this.evictions = 0;
	}

	/**
	 * Get a thumbnail from cache
	 * Returns null if not found
	 * Moves accessed node to front (most recently used)
	 */
	get(key: string): string | null {
		const node = this.cache.get(key);

		if (!node) {
			this.misses++;
			return null;
		}

		// Move to front (most recently used)
		this.moveToFront(node);
		this.hits++;

		// Update timestamp
		node.value.timestamp = Date.now();

		return node.value.uri;
	}

	/**
	 * Set a thumbnail in cache
	 * Automatically evicts LRU entries if size limit is exceeded
	 */
	set(key: string, uri: string, sizeBytes: number): void {
		// Check if entry already exists
		const existingNode = this.cache.get(key);

		if (existingNode) {
			// Update existing entry
			this.currentSize -= existingNode.value.size;
			existingNode.value.uri = uri;
			existingNode.value.size = sizeBytes;
			existingNode.value.timestamp = Date.now();
			this.currentSize += sizeBytes;

			// Move to front
			this.moveToFront(existingNode);
			return;
		}

		// Evict entries if necessary to make room
		while (this.currentSize + sizeBytes > this.maxSize && this.tail) {
			this.evictLRU();
		}

		// If single entry is larger than max size, don't cache it
		if (sizeBytes > this.maxSize) {
			console.warn(
				`ThumbnailCache: Entry size (${sizeBytes}) exceeds max cache size (${this.maxSize}). Skipping cache.`,
			);
			return;
		}

		// Create new entry
		const entry: CacheEntry = {
			key,
			uri,
			size: sizeBytes,
			timestamp: Date.now(),
		};

		// Create new node
		const newNode: CacheNode = {
			key,
			value: entry,
			prev: null,
			next: this.head,
		};

		// Add to cache map
		this.cache.set(key, newNode);

		// Update linked list
		if (this.head) {
			this.head.prev = newNode;
		}
		this.head = newNode;

		if (!this.tail) {
			this.tail = newNode;
		}

		// Update size
		this.currentSize += sizeBytes;
	}

	/**
	 * Check if key exists in cache
	 */
	has(key: string): boolean {
		return this.cache.has(key);
	}

	/**
	 * Remove entry from cache
	 */
	remove(key: string): boolean {
		const node = this.cache.get(key);
		if (!node) return false;

		this.removeNode(node);
		this.cache.delete(key);
		this.currentSize -= node.value.size;

		return true;
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		this.cache.clear();
		this.head = null;
		this.tail = null;
		this.currentSize = 0;
		this.hits = 0;
		this.misses = 0;
		this.evictions = 0;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const totalRequests = this.hits + this.misses;
		const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
		const missRate = totalRequests > 0 ? this.misses / totalRequests : 0;

		return {
			size: this.currentSize,
			count: this.cache.size,
			maxSize: this.maxSize,
			hitRate,
			missRate,
			evictions: this.evictions,
		};
	}

	/**
	 * Get all cached keys
	 */
	keys(): string[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * Get number of cached entries
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Get current memory usage in bytes
	 */
	getCurrentSize(): number {
		return this.currentSize;
	}

	/**
	 * Get max cache size in bytes
	 */
	getMaxSize(): number {
		return this.maxSize;
	}

	/**
	 * Update max cache size
	 * If new size is smaller, evict entries to fit
	 */
	setMaxSize(newMaxSize: number): void {
		this.maxSize = newMaxSize;

		// Evict entries if current size exceeds new max
		while (this.currentSize > this.maxSize && this.tail) {
			this.evictLRU();
		}
	}

	/**
	 * Get cache usage percentage
	 */
	getUsagePercentage(): number {
		return this.maxSize > 0 ? (this.currentSize / this.maxSize) * 100 : 0;
	}

	/**
	 * Get formatted stats for logging
	 */
	getFormattedStats(): string {
		const stats = this.getStats();
		return `ThumbnailCache Stats:
  Entries: ${stats.count}
  Size: ${this.formatBytes(stats.size)} / ${this.formatBytes(stats.maxSize)} (${this.getUsagePercentage().toFixed(1)}%)
  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%
  Miss Rate: ${(stats.missRate * 100).toFixed(1)}%
  Evictions: ${stats.evictions}`;
	}

	/**
	 * Move node to front of list (most recently used)
	 */
	private moveToFront(node: CacheNode): void {
		if (node === this.head) return;

		// Remove from current position
		this.removeNode(node);

		// Add to front
		node.prev = null;
		node.next = this.head;

		if (this.head) {
			this.head.prev = node;
		}

		this.head = node;

		if (!this.tail) {
			this.tail = node;
		}
	}

	/**
	 * Remove node from linked list
	 */
	private removeNode(node: CacheNode): void {
		if (node.prev) {
			node.prev.next = node.next;
		} else {
			this.head = node.next;
		}

		if (node.next) {
			node.next.prev = node.prev;
		} else {
			this.tail = node.prev;
		}
	}

	/**
	 * Evict least recently used entry (tail)
	 */
	private evictLRU(): void {
		if (!this.tail) return;

		const evictedNode = this.tail;
		this.removeNode(evictedNode);
		this.cache.delete(evictedNode.key);
		this.currentSize -= evictedNode.value.size;
		this.evictions++;
	}

	/**
	 * Format bytes to human-readable string
	 */
	private formatBytes(bytes: number): string {
		if (bytes === 0) return "0 B";

		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
	}

	/**
	 * Trim cache to specific size by evicting LRU entries
	 */
	trim(targetSize: number): number {
		let evictedCount = 0;

		while (this.currentSize > targetSize && this.tail) {
			this.evictLRU();
			evictedCount++;
		}

		return evictedCount;
	}

	/**
	 * Get entries older than specified age (milliseconds)
	 */
	getStaleEntries(maxAgeMs: number): string[] {
		const now = Date.now();
		const staleKeys: string[] = [];

		for (const [key, node] of this.cache.entries()) {
			if (now - node.value.timestamp > maxAgeMs) {
				staleKeys.push(key);
			}
		}

		return staleKeys;
	}

	/**
	 * Remove entries older than specified age
	 */
	removeStaleEntries(maxAgeMs: number): number {
		const staleKeys = this.getStaleEntries(maxAgeMs);

		for (const key of staleKeys) {
			this.remove(key);
		}

		return staleKeys.length;
	}

	/**
	 * Prefetch multiple entries into cache
	 * Useful for preloading thumbnails before they're needed
	 */
	batchSet(entries: Array<{ key: string; uri: string; size: number }>): void {
		for (const entry of entries) {
			this.set(entry.key, entry.uri, entry.size);
		}
	}

	/**
	 * Get multiple entries from cache
	 */
	batchGet(keys: string[]): Map<string, string> {
		const results = new Map<string, string>();

		for (const key of keys) {
			const uri = this.get(key);
			if (uri) {
				results.set(key, uri);
			}
		}

		return results;
	}

	/**
	 * Reset statistics without clearing cache
	 */
	resetStats(): void {
		this.hits = 0;
		this.misses = 0;
		this.evictions = 0;
	}
}

/**
 * Singleton instance for global thumbnail cache
 */
let globalCacheInstance: ThumbnailCache | null = null;

/**
 * Get or create global thumbnail cache instance
 */
export function getGlobalThumbnailCache(): ThumbnailCache {
	if (!globalCacheInstance) {
		globalCacheInstance = new ThumbnailCache(50 * 1024 * 1024); // 50MB
	}
	return globalCacheInstance;
}

/**
 * Reset global thumbnail cache instance
 */
export function resetGlobalThumbnailCache(): void {
	if (globalCacheInstance) {
		globalCacheInstance.clear();
	}
	globalCacheInstance = null;
}
