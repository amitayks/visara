// services/gallery/FixedImageTracker.ts
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";
import { Image } from "react-native";
import { PhotoIdentifier } from "@react-native-camera-roll/camera-roll";
import { ScannerStorage } from "../../storage/MMKVStorage";

/**
 * Simplified, robust image tracking that actually works
 * Key improvements:
 * - Uses multiple identifiers for reliable lookups
 * - Properly persists to storage
 * - Handles URI format changes
 * - Clear separation of concerns
 */

// ===============================
// DATA STRUCTURES
// ===============================

export interface ImageRecord {
	// Multiple identifiers for robust lookup
	id: string; // Unique ID based on content
	contentHash: string; // SHA256 of image content
	fileSize: number;
	modTime: number;

	// All known URIs for this image
	uris: Set<string>; // Tracks all URI formats seen
	primaryUri: string; // Most recent URI

	// Processing state
	isProcessed: boolean;
	processedAt?: number;
	documentId?: string;

	// Metadata
	firstSeenAt: number;
	lastSeenAt: number;
	scanCount: number;

	// Error tracking
	lastError?: string;
	failureCount: number;
}

export interface TrackerStats {
	totalImages: number;
	processedImages: number;
	pendingImages: number;
	failedImages: number;
	lastScanAt?: number;
}

// ===============================
// FIXED IMAGE TRACKER
// ===============================

export class FixedImageTracker {
	private static instance: FixedImageTracker;

	// Storage keys
	private readonly STORAGE_KEY = "image_records_v4";
	private readonly INDEX_KEY = "image_index_v4";
	private readonly STATS_KEY = "tracker_stats_v4";

	// In-memory caches for performance
	private records = new Map<string, ImageRecord>();
	private hashToId = new Map<string, string>(); // contentHash -> record ID
	private uriToId = new Map<string, string>(); // URI -> record ID
	private sizeModToId = new Map<string, Set<string>>(); // "size_modTime" -> Set of IDs

	// State
	private isDirty = false;
	private saveTimer: NodeJS.Timeout | null = null;

	private constructor() {
		this.loadFromStorage();
	}

	static getInstance(): FixedImageTracker {
		if (!FixedImageTracker.instance) {
			FixedImageTracker.instance = new FixedImageTracker();
		}
		return FixedImageTracker.instance;
	}

	// ===============================
	// CORE METHODS
	// ===============================

	/**
	 * Find existing record by URI or content
	 * This is the KEY method that prevents reprocessing
	 */
	async findExistingRecord(uri: string): Promise<ImageRecord | null> {
		// 1. Direct URI lookup (fastest)
		const directId = this.uriToId.get(uri);
		if (directId) {
			const record = this.records.get(directId);
			if (record) {
				// Update with new URI if different
				if (!record.uris.has(uri)) {
					record.uris.add(uri);
					record.primaryUri = uri;
					this.uriToId.set(uri, record.id);
					this.scheduleSave();
				}
				return record;
			}
		}

		// 2. Try normalized URI lookup (handle format changes)
		const normalizedUri = this.normalizeUri(uri);
		for (const [knownUri, id] of this.uriToId.entries()) {
			if (this.normalizeUri(knownUri) === normalizedUri) {
				const record = this.records.get(id);
				if (record) {
					// Add this URI variant
					record.uris.add(uri);
					record.primaryUri = uri;
					this.uriToId.set(uri, record.id);
					this.scheduleSave();
					return record;
				}
			}
		}

		// 3. Try file stats lookup (size + modTime)
		try {
			const stats = await this.getFileStats(uri);
			if (stats) {
				const sizeModKey = `${stats.size}_${stats.modTime}`;
				const possibleIds = this.sizeModToId.get(sizeModKey);

				if (possibleIds && possibleIds.size > 0) {
					// Verify with content hash for exact match
					const contentHash = await this.computeContentHash(uri);

					for (const id of possibleIds) {
						const record = this.records.get(id);
						if (record && record.contentHash === contentHash) {
							// Found it! Update URIs
							record.uris.add(uri);
							record.primaryUri = uri;
							this.uriToId.set(uri, record.id);
							this.scheduleSave();
							return record;
						}
					}
				}
			}
		} catch (error) {
			console.log("[FixedImageTracker] Stats lookup failed:", error);
		}

		return null;
	}

	/**
	 * Create new record for an image
	 */
	async createRecord(
		uri: string,
		asset?: PhotoIdentifier,
	): Promise<ImageRecord> {
		const stats = await this.getFileStats(uri);
		const contentHash = await this.computeContentHash(uri);

		// Check if we already have this content (duplicate detection)
		const existingId = this.hashToId.get(contentHash);
		if (existingId) {
			const existing = this.records.get(existingId);
			if (existing) {
				// Just add the new URI to existing record
				existing.uris.add(uri);
				existing.primaryUri = uri;
				existing.lastSeenAt = Date.now();
				existing.scanCount++;
				this.uriToId.set(uri, existing.id);
				this.scheduleSave();
				return existing;
			}
		}

		// Create new record
		const id = this.generateId(contentHash, stats?.size || 0);
		const record: ImageRecord = {
			id,
			contentHash,
			fileSize: stats?.size || 0,
			modTime: stats?.modTime || Date.now(),
			uris: new Set([uri]),
			primaryUri: uri,
			isProcessed: false,
			firstSeenAt: Date.now(),
			lastSeenAt: Date.now(),
			scanCount: 1,
			failureCount: 0,
		};

		// Add to all indexes
		this.records.set(id, record);
		this.hashToId.set(contentHash, id);
		this.uriToId.set(uri, id);

		// Add to size+modTime index
		const sizeModKey = `${record.fileSize}_${record.modTime}`;
		if (!this.sizeModToId.has(sizeModKey)) {
			this.sizeModToId.set(sizeModKey, new Set());
		}
		this.sizeModToId.get(sizeModKey)!.add(id);

		this.scheduleSave();
		return record;
	}

	/**
	 * Mark image as processed
	 */
	markAsProcessed(recordId: string, documentId?: string): void {
		const record = this.records.get(recordId);
		if (record) {
			record.isProcessed = true;
			record.processedAt = Date.now();
			record.documentId = documentId;
			this.scheduleSave();

			console.log(`[FixedImageTracker] Marked ${recordId} as processed`);
		}
	}

	/**
	 * Mark processing as failed
	 */
	markAsFailed(recordId: string, error: string): void {
		const record = this.records.get(recordId);
		if (record) {
			record.lastError = error;
			record.failureCount++;
			this.scheduleSave();
		}
	}

	/**
	 * Check if image needs processing
	 */
	needsProcessing(record: ImageRecord): boolean {
		// Already processed successfully
		if (record.isProcessed) {
			return false;
		}

		// Too many failures
		if (record.failureCount >= 3) {
			return false;
		}

		return true;
	}

	/**
	 * Get all records that need processing
	 */
	getUnprocessedRecords(limit?: number): ImageRecord[] {
		const unprocessed = Array.from(this.records.values())
			.filter((record) => this.needsProcessing(record))
			.sort((a, b) => a.firstSeenAt - b.firstSeenAt);

		return limit ? unprocessed.slice(0, limit) : unprocessed;
	}

	// ===============================
	// STORAGE METHODS
	// ===============================

	/**
	 * Load from persistent storage
	 */
	private async loadFromStorage(): Promise<void> {
		try {
			console.log("[FixedImageTracker] Loading from storage...");

			const data = await ScannerStorage.getObject<any>(this.STORAGE_KEY);
			if (!data || !data.records) {
				console.log("[FixedImageTracker] No existing data found");
				return;
			}

			// Restore records with Set conversion
			for (const [id, recordData] of Object.entries(data.records)) {
				const record = recordData as any;
				record.uris = new Set(record.uris || [record.primaryUri]);
				this.records.set(id, record as ImageRecord);

				// Rebuild indexes
				this.hashToId.set(record.contentHash, id);
				for (const uri of record.uris) {
					this.uriToId.set(uri, id);
				}

				const sizeModKey = `${record.fileSize}_${record.modTime}`;
				if (!this.sizeModToId.has(sizeModKey)) {
					this.sizeModToId.set(sizeModKey, new Set());
				}
				this.sizeModToId.get(sizeModKey)!.add(id);
			}

			console.log(`[FixedImageTracker] Loaded ${this.records.size} records`);
		} catch (error) {
			console.error("[FixedImageTracker] Failed to load from storage:", error);
		}
	}

	/**
	 * Save to persistent storage (debounced)
	 */
	private scheduleSave(): void {
		this.isDirty = true;

		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}

		// Debounce saves to prevent excessive writes
		this.saveTimer = setTimeout(() => {
			this.saveToStorage();
		}, 1000);
	}

	/**
	 * Actually save to storage
	 */
	private async saveToStorage(): Promise<void> {
		if (!this.isDirty) return;

		try {
			// Convert records to serializable format
			const recordsObj: any = {};
			for (const [id, record] of this.records.entries()) {
				recordsObj[id] = {
					...record,
					uris: Array.from(record.uris), // Convert Set to Array for storage
				};
			}

			const data = {
				version: 4,
				records: recordsObj,
				savedAt: Date.now(),
			};

			await ScannerStorage.setObject(this.STORAGE_KEY, data);

			// Save stats
			await ScannerStorage.setObject(this.STATS_KEY, this.getStats());

			this.isDirty = false;
			console.log(`[FixedImageTracker] Saved ${this.records.size} records`);
		} catch (error) {
			console.error("[FixedImageTracker] Failed to save to storage:", error);
		}
	}

	/**
	 * Force immediate save
	 */
	async forceSave(): Promise<void> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.saveToStorage();
	}

	// ===============================
	// UTILITY METHODS
	// ===============================

	/**
	 * Normalize URI for comparison
	 */
	private normalizeUri(uri: string): string {
		return uri
			.replace(/^content:\/\/[^\/]+/, "") // Remove content:// authority
			.replace(/^file:\/\//, "") // Remove file:// prefix
			.replace(/\/+/g, "/") // Normalize slashes
			.toLowerCase();
	}

	/**
	 * Get file statistics
	 */
	private async getFileStats(
		uri: string,
	): Promise<{ size: number; modTime: number } | null> {
		try {
			const stats = await RNFS.stat(uri);
			return {
				size: stats.size,
				modTime: new Date(stats.mtime).getTime(),
			};
		} catch (error) {
			// For content:// URIs, stats might not work
			return null;
		}
	}

	/**
	 * Compute content hash (fast version)
	 */
	private async computeContentHash(uri: string): Promise<string> {
		try {
			// Read first 10KB for hash (fast but unique enough)
			const chunk = await RNFS.read(uri, 10240, 0, "base64");
			return CryptoJS.SHA256(chunk).toString();
		} catch (error) {
			// Fallback to URI-based hash
			return CryptoJS.SHA256(uri).toString();
		}
	}

	/**
	 * Generate unique ID
	 */
	private generateId(contentHash: string, size: number): string {
		const timestamp = Date.now().toString(36);
		const sizeStr = size.toString(36);
		const hashPrefix = contentHash.substring(0, 8);
		return `${hashPrefix}_${sizeStr}_${timestamp}`;
	}

	/**
	 * Get statistics
	 */
	getStats(): TrackerStats {
		const processed = Array.from(this.records.values()).filter(
			(r) => r.isProcessed,
		).length;
		const failed = Array.from(this.records.values()).filter(
			(r) => r.failureCount >= 3,
		).length;

		return {
			totalImages: this.records.size,
			processedImages: processed,
			pendingImages: this.records.size - processed - failed,
			failedImages: failed,
			lastScanAt: Date.now(),
		};
	}

	/**
	 * Clear all data (for testing)
	 */
	async clearAll(): Promise<void> {
		this.records.clear();
		this.hashToId.clear();
		this.uriToId.clear();
		this.sizeModToId.clear();

		await ScannerStorage.removeItem(this.STORAGE_KEY);
		await ScannerStorage.removeItem(this.INDEX_KEY);
		await ScannerStorage.removeItem(this.STATS_KEY);

		console.log("[FixedImageTracker] Cleared all data");
	}

	/**
	 * Get detailed info for debugging
	 */
	getDebugInfo(): any {
		return {
			totalRecords: this.records.size,
			totalUris: this.uriToId.size,
			totalHashes: this.hashToId.size,
			stats: this.getStats(),
			isDirty: this.isDirty,
		};
	}
}

// Export singleton instance
export const fixedImageTracker = FixedImageTracker.getInstance();
