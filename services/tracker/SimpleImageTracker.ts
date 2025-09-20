// services/tracker/SimpleImageTracker.ts
// Simplified image tracking for real-time system

import { MMKV } from "react-native-mmkv";

// MMKV storage instance
const storage = new MMKV();

interface TrackedImage {
	id: string;
	uri: string;
	status: "tracked" | "document" | "non-document" | "processed" | "failed";
	documentId?: string;
	trackedAt: number;
	processedAt?: number;
}

class SimpleImageTracker {
	private static instance: SimpleImageTracker;
	private trackedImages: Map<string, TrackedImage> = new Map();
	private initialized = false;

	private readonly STORAGE_KEY = "simple_image_tracker_v1";
	private readonly MAX_TRACKED_IMAGES = 10000; // Limit memory usage
	private saveTimer: NodeJS.Timeout | null = null;

	private constructor() {}

	static getInstance(): SimpleImageTracker {
		if (!SimpleImageTracker.instance) {
			SimpleImageTracker.instance = new SimpleImageTracker();
		}
		return SimpleImageTracker.instance;
	}

	/**
	 * Initialize tracker and load persisted data
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		try {
			await this.loadPersistedData();
			this.initialized = true;
			console.log(
				`[SimpleImageTracker] Initialized with ${this.trackedImages.size} tracked images`,
			);
		} catch (error) {
			console.error("[SimpleImageTracker] Initialization failed:", error);
			// Start fresh if loading fails
			this.trackedImages.clear();
			this.initialized = true;
		}
	}

	/**
	 * Track a new image
	 */
	async trackImage(imageId: string, uri: string): Promise<void> {
		if (this.trackedImages.has(imageId)) {
			return;
		}

		const trackedImage: TrackedImage = {
			id: imageId,
			uri,
			status: "tracked",
			trackedAt: Date.now(),
		};

		this.trackedImages.set(imageId, trackedImage);
		this.scheduleSave();

		// Manage memory - remove oldest if exceeding limit
		if (this.trackedImages.size > this.MAX_TRACKED_IMAGES) {
			this.pruneOldestEntries();
		}
	}

	/**
	 * Check if an image is already tracked
	 */
	async isTracked(imageId: string): Promise<boolean> {
		return this.trackedImages.has(imageId);
	}

	/**
	 * Mark image as a non-document
	 */
	async markAsNonDocument(imageId: string): Promise<void> {
		const image = this.trackedImages.get(imageId);
		if (image) {
			image.status = "non-document";
			this.scheduleSave();
		}
	}

	/**
	 * Mark image as processed document
	 */
	async markAsProcessed(imageId: string, documentId: string): Promise<void> {
		const image = this.trackedImages.get(imageId);
		if (image) {
			image.status = "processed";
			image.documentId = documentId;
			image.processedAt = Date.now();
			this.scheduleSave();
		}
	}

	/**
	 * Mark image as failed
	 */
	async markAsFailed(imageId: string): Promise<void> {
		const image = this.trackedImages.get(imageId);
		if (image) {
			image.status = "failed";
			this.scheduleSave();
		}
	}

	/**
	 * Remove image from tracking
	 */
	async removeImage(imageId: string): Promise<void> {
		this.trackedImages.delete(imageId);
		this.scheduleSave();
	}

	/**
	 * Get document ID for a tracked image
	 */
	async getDocumentId(imageId: string): Promise<string | undefined> {
		return this.trackedImages.get(imageId)?.documentId;
	}

	/**
	 * Check if we've scanned before
	 */
	async hasScannedBefore(): Promise<boolean> {
		return this.trackedImages.size > 0;
	}

	/**
	 * Mark initial scan as complete
	 */
	async markScanComplete(): Promise<void> {
		storage.set("initial_scan_completed", true);
		await this.persistData();
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		totalTracked: number;
		processed: number;
		documents: number;
		nonDocuments: number;
		failed: number;
	} {
		let processed = 0;
		let documents = 0;
		let nonDocuments = 0;
		let failed = 0;

		for (const image of this.trackedImages.values()) {
			switch (image.status) {
				case "processed":
					processed++;
					documents++;
					break;
				case "document":
					documents++;
					break;
				case "non-document":
					nonDocuments++;
					break;
				case "failed":
					failed++;
					break;
			}
		}

		return {
			totalTracked: this.trackedImages.size,
			processed,
			documents,
			nonDocuments,
			failed,
		};
	}

	/**
	 * Clear all tracking data
	 */
	async clearAll(): Promise<void> {
		this.trackedImages.clear();
		storage.delete(this.STORAGE_KEY);
		storage.delete("initial_scan_completed");
		console.log("[SimpleImageTracker] All tracking data cleared");
	}

	/**
	 * Load persisted data from storage
	 */
	private async loadPersistedData(): Promise<void> {
		try {
			const data = storage.getString(this.STORAGE_KEY);
			if (data) {
				const parsed = JSON.parse(data);

				// Convert array back to Map
				if (Array.isArray(parsed)) {
					this.trackedImages = new Map(parsed);
				} else if (parsed.images) {
					this.trackedImages = new Map(parsed.images);
				}
			}
		} catch (error) {
			console.error(
				"[SimpleImageTracker] Failed to load persisted data:",
				error,
			);
		}
	}

	/**
	 * Persist data to storage
	 */
	private async persistData(): Promise<void> {
		try {
			// Convert Map to array for JSON serialization
			const data = Array.from(this.trackedImages.entries());
			storage.set(this.STORAGE_KEY, JSON.stringify(data));
		} catch (error) {
			console.error("[SimpleImageTracker] Failed to persist data:", error);
		}
	}

	/**
	 * Schedule a save operation (debounced)
	 */
	private scheduleSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}

		this.saveTimer = setTimeout(() => {
			this.persistData();
			this.saveTimer = null;
		}, 5000); // Save after 5 seconds of inactivity
	}

	/**
	 * Remove oldest entries when exceeding limit
	 */
	private pruneOldestEntries(): void {
		const entriesToRemove =
			this.trackedImages.size - this.MAX_TRACKED_IMAGES + 100; // Remove 100 extra

		if (entriesToRemove <= 0) {
			return;
		}

		// Sort by tracked time and remove oldest
		const sorted = Array.from(this.trackedImages.entries()).sort(
			(a, b) => a[1].trackedAt - b[1].trackedAt,
		);

		for (let i = 0; i < entriesToRemove; i++) {
			this.trackedImages.delete(sorted[i][0]);
		}

		console.log(`[SimpleImageTracker] Pruned ${entriesToRemove} old entries`);
	}
}

// Export singleton instance
export const simpleImageTracker = SimpleImageTracker.getInstance();