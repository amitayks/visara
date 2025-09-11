// services/gallery/ImprovedFileTracker.ts
import CryptoJS from "crypto-js";
import RNFS from "react-native-fs";
import { Image } from "react-native";
import {
	CameraRoll,
	PhotoIdentifier,
} from "@react-native-camera-roll/camera-roll";
import { ScannerStorage } from "../../storage/MMKVStorage";
import { documentStorage } from "../database/documentStorage";
import { documentProcessor } from "../ai/documentProcessor";
import { documentValidator } from "../../utils/documentValidator";

// ===============================
// ENHANCED FILE FINGERPRINT
// ===============================

export interface FileFingerprint {
	// Primary identifiers
	contentHash: string;
	uri: string;
	path: string;

	// URI format tracking (critical for your content:// vs file:// issue)
	uriFormat: "file" | "content" | "unknown";
	originalUri: string; // Keep original for reference

	// File metadata
	size: number;
	modTime: number;
	createdTime?: number;

	// Content fingerprints
	quickHash: string;
	perceptualHash?: string;
	visualSignature?: string; // For image similarity

	// Image metadata
	dimensions?: { width: number; height: number };
	mimeType?: string;
	exifData?: any;

	// Tracking metadata
	firstSeen: number;
	lastVerified: number;
	scanCount: number;
	isProcessed: boolean;
	processingStatus:
		| "pending"
		| "processing"
		| "completed"
		| "failed"
		| "skipped"
		| "duplicate";

	// Document tracking
	documentId?: string; // Link to processed document
	documentHash?: string; // Hash from document processor
	ocrProcessed?: boolean;

	// Batch tracking
	discoveryBatchId: string;
	processingBatchId?: string;

	// Error tracking
	lastError?: string;
	errorCount: number;

	// Performance metrics
	processingTimeMs?: number;
	fingerprintTimeMs?: number;
}

export interface ScanBatch {
	id: string;
	timestamp: number;
	type: "full" | "incremental" | "new_only" | "retry";
	trigger: "initial" | "periodic" | "manual" | "foreground" | "new_images";

	// Discovery stats
	discoveredFiles: number;
	newFiles: number;
	changedFiles: number;
	deletedFiles: number;

	// Processing stats
	processedFiles: number;
	failedFiles: number;
	skippedFiles: number;
	duplicateFiles: number;

	status: "discovering" | "processing" | "completed" | "failed" | "cancelled";

	// Performance
	stats: {
		totalTimeMs: number;
		discoveryTimeMs: number;
		processingTimeMs: number;
		avgProcessingTimeMs: number;
		successRate: number;
		memoryUsageMB: number;
	};

	// Errors
	errors: Array<{ uri: string; error: string; timestamp: number }>;
}

// ===============================
// IMPROVED FILE TRACKER
// ===============================

export class ImprovedFileTracker {
	private readonly FINGERPRINTS_KEY = "file_fingerprints_v3";
	private readonly BATCHES_KEY = "scan_batches_v3";
	private readonly URI_MAP_KEY = "uri_mapping_v3"; // Maps different URI formats
	private readonly MIGRATION_KEY = "tracker_migration_v3";

	private fingerprints = new Map<string, FileFingerprint>();
	private uriToFingerprintId = new Map<string, string>(); // Quick URI lookup
	private contentHashToFingerprintId = new Map<string, string>(); // Duplicate detection
	private batches = new Map<string, ScanBatch>();

	// Performance optimizations
	private readonly MAX_CONCURRENT_FINGERPRINTS = 3;
	private readonly FINGERPRINT_CACHE_SIZE = 100;
	private fingerprintCache = new Map<string, FileFingerprint>();

	constructor() {
		this.loadFromStorage();
		this.migrateFromOldSystem();
	}

	/**
	 * Create enhanced fingerprint with proper URI handling
	 */
	async createFingerprint(
		uri: string,
		photoAsset?: PhotoIdentifier,
	): Promise<FileFingerprint> {
		const startTime = Date.now();

		try {
			// Handle URI format issues
			const { normalizedUri, format } = this.normalizeUri(uri);

			// Try to get file stats (may fail for content:// URIs)
			let stats: any = null;
			let fileSize = 0;
			let modTime = Date.now();

			try {
				stats = await RNFS.stat(normalizedUri);
				fileSize = stats.size;
				modTime = new Date(stats.mtime).getTime();
			} catch (error) {
				// Fallback for content:// URIs
				console.log(`[FileTracker] Cannot stat ${uri}, using fallbacks`);
				if (photoAsset && photoAsset.node?.timestamp) {
					// Use asset metadata if available
					modTime = photoAsset.node.timestamp * 1000;
				}
			}

			// Create quick hash from available metadata
			const quickHash = CryptoJS.MD5(
				`${uri}_${fileSize}_${modTime}`,
			).toString();

			// Content hash with better error handling
			const contentHash = await this.createRobustContentHash(
				normalizedUri,
				fileSize,
				format,
			);

			// Get image dimensions if possible
			const dimensions = await this.getImageDimensions(normalizedUri);

			// Create visual signature for duplicate detection
			const visualSignature = await this.createVisualSignature(
				normalizedUri,
				dimensions,
			);

			const fingerprint: FileFingerprint = {
				contentHash,
				uri: normalizedUri,
				path: this.extractPath(normalizedUri),
				uriFormat: format,
				originalUri: uri,
				size: fileSize,
				modTime,
				createdTime: stats?.birthtime
					? new Date(stats.birthtime).getTime()
					: undefined,
				quickHash,
				visualSignature,
				dimensions,
				firstSeen: Date.now(),
				lastVerified: Date.now(),
				scanCount: 0,
				isProcessed: false,
				processingStatus: "pending",
				discoveryBatchId: "",
				errorCount: 0,
				fingerprintTimeMs: Date.now() - startTime,
			};

			// Cache for performance
			this.updateCache(fingerprint);

			return fingerprint;
		} catch (error) {
			console.error(
				`[FileTracker] Error creating fingerprint for ${uri}:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Normalize URI to handle content:// vs file:// issues
	 */
	private normalizeUri(uri: string): {
		normalizedUri: string;
		format: "file" | "content" | "unknown";
	} {
		if (uri.startsWith("content://")) {
			return { normalizedUri: uri, format: "content" };
		} else if (uri.startsWith("file://")) {
			return { normalizedUri: uri, format: "file" };
		} else if (uri.startsWith("/")) {
			// Raw path, convert to file://
			return { normalizedUri: `file://${uri}`, format: "file" };
		}
		return { normalizedUri: uri, format: "unknown" };
	}

	/**
	 * Create robust content hash that handles different URI types
	 */
	private async createRobustContentHash(
		uri: string,
		fileSize: number,
		format: "file" | "content" | "unknown",
	): Promise<string> {
		try {
			if (format === "content") {
				// For content:// URIs, use URI itself as part of hash
				// since we may not be able to read the file directly
				return CryptoJS.SHA256(`${uri}_${fileSize}_${Date.now()}`).toString();
			}

			// For file:// URIs, use actual content
			const CHUNK_SIZE = 8192;

			if (fileSize <= CHUNK_SIZE * 2) {
				const content = await RNFS.readFile(uri, "base64");
				return CryptoJS.SHA256(content).toString();
			} else {
				// Read first and last chunks
				const firstChunk = await RNFS.read(uri, CHUNK_SIZE, 0, "base64");
				const lastChunk = await RNFS.read(
					uri,
					CHUNK_SIZE,
					fileSize - CHUNK_SIZE,
					"base64",
				);
				return CryptoJS.SHA256(
					`${firstChunk}_${fileSize}_${lastChunk}`,
				).toString();
			}
		} catch (error) {
			// Fallback hash
			return CryptoJS.SHA256(`${uri}_${fileSize}_fallback`).toString();
		}
	}

	/**
	 * Get image dimensions for better duplicate detection
	 */
	private async getImageDimensions(
		uri: string,
	): Promise<{ width: number; height: number } | undefined> {
		return new Promise((resolve) => {
			Image.getSize(
				uri,
				(width, height) => resolve({ width, height }),
				() => resolve(undefined),
			);
		});
	}

	/**
	 * Create visual signature for image similarity detection
	 */
	private async createVisualSignature(
		uri: string,
		dimensions?: { width: number; height: number },
	): Promise<string | undefined> {
		if (!dimensions) return undefined;

		// Simple signature based on dimensions and URI
		// In production, you'd use a perceptual hashing library
		return CryptoJS.MD5(
			`${dimensions.width}x${dimensions.height}_${uri.slice(-20)}`,
		)
			.toString()
			.substring(0, 16);
	}

	/**
	 * Extract clean path from URI
	 */
	private extractPath(uri: string): string {
		return uri
			.replace(/^content:\/\/[^\/]+/, "")
			.replace(/^file:\/\//, "")
			.replace(/\/+/g, "/");
	}

	/**
	 * Find existing fingerprint by various methods
	 */
	async findExistingFingerprint(
		uri: string,
	): Promise<FileFingerprint | undefined> {
		// Try cache first
		if (this.fingerprintCache.has(uri)) {
			return this.fingerprintCache.get(uri);
		}

		// Try direct URI lookup
		const fingerprintId = this.uriToFingerprintId.get(uri);
		if (fingerprintId) {
			return this.fingerprints.get(fingerprintId);
		}

		// Try normalized path lookup
		const { normalizedUri } = this.normalizeUri(uri);
		const path = this.extractPath(normalizedUri);

		for (const [id, fp] of this.fingerprints.entries()) {
			if (fp.path === path || fp.originalUri === uri) {
				this.uriToFingerprintId.set(uri, id); // Update mapping
				return fp;
			}
		}

		return undefined;
	}

	/**
	 * Check for duplicate by content hash
	 */
	isDuplicate(fingerprint: FileFingerprint): boolean {
		const existingId = this.contentHashToFingerprintId.get(
			fingerprint.contentHash,
		);
		if (existingId) {
			const existing = this.fingerprints.get(existingId);
			return existing?.isProcessed === true;
		}
		return false;
	}

	/**
	 * Intelligent change detection
	 */
	async hasFileChanged(
		uri: string,
		existingFingerprint: FileFingerprint,
	): Promise<boolean> {
		try {
			// Quick check based on URI format
			if (existingFingerprint.uriFormat === "content") {
				// Content URIs are immutable, if URI changed, content changed
				return uri !== existingFingerprint.originalUri;
			}

			// For file:// URIs, check modification time and size
			const stats = await RNFS.stat(uri);
			const currentModTime = new Date(stats.mtime).getTime();

			if (
				stats.size !== existingFingerprint.size ||
				Math.abs(currentModTime - existingFingerprint.modTime) > 1000
			) {
				return true;
			}

			// Deep verification if suspicious or old
			const hoursSinceVerified =
				(Date.now() - existingFingerprint.lastVerified) / (1000 * 60 * 60);
			if (hoursSinceVerified > 24) {
				const currentHash = await this.createRobustContentHash(
					uri,
					stats.size,
					existingFingerprint.uriFormat,
				);
				return currentHash !== existingFingerprint.contentHash;
			}

			return false;
		} catch (error) {
			// Assume changed if we can't verify
			return true;
		}
	}

	/**
	 * Add or update fingerprint with proper indexing
	 */
	async addFingerprint(
		fingerprint: FileFingerprint,
		batchId: string,
	): Promise<string> {
		const id = this.getFingerprintId(fingerprint);

		// Check for duplicates
		if (this.isDuplicate(fingerprint)) {
			fingerprint.processingStatus = "duplicate";
			const batch = this.batches.get(batchId);
			if (batch) batch.duplicateFiles++;
		}

		fingerprint.discoveryBatchId = batchId;
		fingerprint.lastVerified = Date.now();

		// Update all indexes
		this.fingerprints.set(id, fingerprint);
		this.uriToFingerprintId.set(fingerprint.uri, id);
		this.uriToFingerprintId.set(fingerprint.originalUri, id);
		this.contentHashToFingerprintId.set(fingerprint.contentHash, id);

		// Update cache
		this.updateCache(fingerprint);

		await this.saveToStorage();
		return id;
	}

	/**
	 * Get fingerprint ID with collision handling
	 */
	getFingerprintId(fingerprint: FileFingerprint): string {
		// Use content hash + path hash for uniqueness
		const pathHash = CryptoJS.MD5(fingerprint.path).toString().substring(0, 8);
		return `${fingerprint.contentHash.substring(0, 16)}_${pathHash}`;
	}

	/**
	 * Mark as processed with document linking
	 */
	async markAsProcessed(
		fingerprintId: string,
		result: {
			success: boolean;
			documentId?: string;
			documentHash?: string;
			error?: string;
			processingTimeMs: number;
		},
		processingBatchId: string,
	): Promise<void> {
		const fingerprint = this.fingerprints.get(fingerprintId);
		if (!fingerprint) return;

		fingerprint.isProcessed = result.success;
		fingerprint.processingStatus = result.success ? "completed" : "failed";
		fingerprint.processingBatchId = processingBatchId;
		fingerprint.scanCount++;
		fingerprint.processingTimeMs = result.processingTimeMs;

		if (result.success) {
			fingerprint.documentId = result.documentId;
			fingerprint.documentHash = result.documentHash;
			fingerprint.ocrProcessed = true;
		} else {
			fingerprint.lastError = result.error;
			fingerprint.errorCount++;
		}

		const batch = this.batches.get(processingBatchId);
		if (batch) {
			if (result.success) {
				batch.processedFiles++;
			} else {
				batch.failedFiles++;
			}
		}

		await this.saveToStorage();
	}

	/**
	 * Update batch statistics
	 */
	async updateBatchStats(batchId: string, stats: Partial<ScanBatch["stats"]>): Promise<void> {
		const batch = this.batches.get(batchId);
		if (batch) {
			batch.stats = { ...batch.stats, ...stats };
			await this.saveToStorage();
		}
	}

	/**
	 * Smart batch creation with type detection
	 */
	createBatch(
		trigger: ScanBatch["trigger"],
		type?: ScanBatch["type"],
	): ScanBatch {
		// Auto-detect batch type if not specified
		const batchType = type || this.detectBatchType();

		const batch: ScanBatch = {
			id: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
			timestamp: Date.now(),
			type: batchType,
			trigger,
			discoveredFiles: 0,
			newFiles: 0,
			changedFiles: 0,
			deletedFiles: 0,
			processedFiles: 0,
			failedFiles: 0,
			skippedFiles: 0,
			duplicateFiles: 0,
			status: "discovering",
			stats: {
				totalTimeMs: 0,
				discoveryTimeMs: 0,
				processingTimeMs: 0,
				avgProcessingTimeMs: 0,
				successRate: 0,
				memoryUsageMB: 0,
			},
			errors: [],
		};

		this.batches.set(batch.id, batch);
		return batch;
	}

	/**
	 * Detect appropriate batch type
	 */
	private detectBatchType(): ScanBatch["type"] {
		const hasProcessedFiles = this.fingerprints.size > 0;
		const hasFailedFiles = Array.from(this.fingerprints.values()).some(
			(fp) => fp.processingStatus === "failed",
		);

		if (!hasProcessedFiles) return "full";
		if (hasFailedFiles) return "retry";
		return "incremental";
	}

	/**
	 * Get unprocessed fingerprints with prioritization
	 */
	getUnprocessedFingerprints(options?: {
		limit?: number;
		prioritizeNew?: boolean;
		excludeFailed?: boolean;
	}): FileFingerprint[] {
		let unprocessed = Array.from(this.fingerprints.values()).filter((fp) => {
			if (fp.isProcessed) return false;
			if (options?.excludeFailed && fp.processingStatus === "failed")
				return false;
			return true;
		});

		// Sort by priority
		if (options?.prioritizeNew) {
			unprocessed.sort((a, b) => b.firstSeen - a.firstSeen);
		} else {
			unprocessed.sort((a, b) => a.firstSeen - b.firstSeen);
		}

		if (options?.limit) {
			unprocessed = unprocessed.slice(0, options.limit);
		}

		return unprocessed;
	}

	/**
	 * Cache management for performance
	 */
	private updateCache(fingerprint: FileFingerprint): void {
		// LRU cache implementation
		if (this.fingerprintCache.size >= this.FINGERPRINT_CACHE_SIZE) {
			const firstKey = this.fingerprintCache.keys().next().value;
			if (firstKey) this.fingerprintCache.delete(firstKey);
		}
		this.fingerprintCache.set(fingerprint.uri, fingerprint);
		this.fingerprintCache.set(fingerprint.originalUri, fingerprint);
	}

	/**
	 * Migrate from old count-based system
	 */
	private async migrateFromOldSystem(): Promise<void> {
		try {
			const migrated = await ScannerStorage.getItem(this.MIGRATION_KEY);
			if (migrated === "true") return;

			// Get processed hashes from old system
			const oldHashes = await ScannerStorage.getObject<string[]>(
				"processed_image_hashes",
			);
			if (oldHashes && oldHashes.length > 0) {
				console.log(`[FileTracker] Migrating ${oldHashes.length} old hashes`);

				// Create migration batch
				const batch = this.createBatch("initial", "full");
				batch.status = "completed";

				// Convert old hashes to fingerprints (minimal info)
				for (const hash of oldHashes) {
					const fingerprint: FileFingerprint = {
						contentHash: hash,
						uri: `migrated_${hash}`,
						path: `migrated_${hash}`,
						uriFormat: "unknown",
						originalUri: `migrated_${hash}`,
						size: 0,
						modTime: Date.now(),
						quickHash: hash,
						firstSeen: Date.now(),
						lastVerified: Date.now(),
						scanCount: 1,
						isProcessed: true,
						processingStatus: "completed",
						discoveryBatchId: batch.id,
						processingBatchId: batch.id,
						errorCount: 0,
					};

					const id = this.getFingerprintId(fingerprint);
					this.fingerprints.set(id, fingerprint);
					this.contentHashToFingerprintId.set(hash, id);
				}

				console.log(`[FileTracker] Migration complete`);
			}

			await ScannerStorage.setItem(this.MIGRATION_KEY, "true");
			await this.saveToStorage();
		} catch (error) {
			console.error("[FileTracker] Migration failed:", error);
		}
	}

	/**
	 * Detect deleted files by comparing current gallery URIs with tracked files
	 */
	async detectDeletedFiles(currentUris: Set<string>): Promise<string[]> {
		const deletedFiles: string[] = [];
		
		for (const [id, fingerprint] of this.fingerprints.entries()) {
			// Skip already processed files
			if (fingerprint.isProcessed) continue;
			
			// Check if file still exists in gallery
			const exists = currentUris.has(fingerprint.uri) || 
						  currentUris.has(fingerprint.originalUri);
			
			if (!exists) {
				// File was deleted from gallery
				deletedFiles.push(fingerprint.uri);
				
				// Mark as deleted
				fingerprint.processingStatus = "skipped";
				fingerprint.lastError = "File deleted from gallery";
			}
		}
		
		if (deletedFiles.length > 0) {
			await this.saveToStorage();
		}
		
		return deletedFiles;
	}

	/**
	 * Storage operations with compression
	 */
	private async saveToStorage(): Promise<void> {
		try {
			// Convert to arrays for storage
			const fingerprintsData = Array.from(this.fingerprints.entries());
			const batchesData = Array.from(this.batches.entries());
			const uriMapData = Array.from(this.uriToFingerprintId.entries());

			// Save in chunks if data is large
			if (fingerprintsData.length > 1000) {
				// Split into chunks
				const chunkSize = 500;
				for (let i = 0; i < fingerprintsData.length; i += chunkSize) {
					const chunk = fingerprintsData.slice(i, i + chunkSize);
					await ScannerStorage.setObject(
						`${this.FINGERPRINTS_KEY}_chunk_${i / chunkSize}`,
						chunk,
					);
				}
				await ScannerStorage.setItem(
					`${this.FINGERPRINTS_KEY}_chunks`,
					Math.ceil(fingerprintsData.length / chunkSize).toString(),
				);
			} else {
				await ScannerStorage.setObject(this.FINGERPRINTS_KEY, fingerprintsData);
			}

			await ScannerStorage.setObject(this.BATCHES_KEY, batchesData);
			await ScannerStorage.setObject(this.URI_MAP_KEY, uriMapData);
		} catch (error) {
			console.error("[FileTracker] Error saving to storage:", error);
		}
	}

	private async loadFromStorage(): Promise<void> {
		try {
			// Check for chunked data
			const chunks = await ScannerStorage.getItem(
				`${this.FINGERPRINTS_KEY}_chunks`,
			);
			let fingerprintsData: Array<[string, FileFingerprint]> = [];

			if (chunks) {
				const chunkCount = parseInt(chunks);
				for (let i = 0; i < chunkCount; i++) {
					const chunk = await ScannerStorage.getObject<
						Array<[string, FileFingerprint]>
					>(`${this.FINGERPRINTS_KEY}_chunk_${i}`);
					if (chunk) fingerprintsData = fingerprintsData.concat(chunk);
				}
			} else {
				const data = await ScannerStorage.getObject<
					Array<[string, FileFingerprint]>
				>(this.FINGERPRINTS_KEY);
				if (data) fingerprintsData = data;
			}

			const [batchesData, uriMapData] = await Promise.all([
				ScannerStorage.getObject<Array<[string, ScanBatch]>>(this.BATCHES_KEY),
				ScannerStorage.getObject<Array<[string, string]>>(this.URI_MAP_KEY),
			]);

			if (fingerprintsData) {
				this.fingerprints = new Map(fingerprintsData);

				// Rebuild content hash index
				for (const [id, fp] of this.fingerprints.entries()) {
					this.contentHashToFingerprintId.set(fp.contentHash, id);
				}
			}

			if (batchesData) {
				this.batches = new Map(batchesData);
			}

			if (uriMapData) {
				this.uriToFingerprintId = new Map(uriMapData);
			}

			console.log(
				`[FileTracker] Loaded ${this.fingerprints.size} fingerprints, ` +
					`${this.batches.size} batches, ${this.uriToFingerprintId.size} URI mappings`,
			);
		} catch (error) {
			console.error("[FileTracker] Error loading from storage:", error);
		}
	}

	/**
	 * Get comprehensive statistics
	 */
	getStats() {
		const totalFiles = this.fingerprints.size;
		const processedFiles = Array.from(this.fingerprints.values()).filter(
			(fp) => fp.isProcessed,
		).length;
		const failedFiles = Array.from(this.fingerprints.values()).filter(
			(fp) => fp.processingStatus === "failed",
		).length;
		const duplicateFiles = Array.from(this.fingerprints.values()).filter(
			(fp) => fp.processingStatus === "duplicate",
		).length;

		const recentBatches = Array.from(this.batches.values())
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 5);

		const avgProcessingTime =
			Array.from(this.fingerprints.values())
				.filter((fp) => fp.processingTimeMs)
				.reduce((sum, fp) => sum + (fp.processingTimeMs || 0), 0) /
			(processedFiles || 1);

		return {
			totalFiles,
			processedFiles,
			pendingFiles: totalFiles - processedFiles - failedFiles - duplicateFiles,
			failedFiles,
			duplicateFiles,
			totalBatches: this.batches.size,
			recentBatches,
			avgProcessingTime,
			cacheSize: this.fingerprintCache.size,
		};
	}

	/**
	 * Cleanup with smart retention
	 */
	async cleanup(
		options: {
			daysToKeep?: number;
			keepFailed?: boolean;
			removeOrphans?: boolean;
		} = {},
	): Promise<void> {
		const daysToKeep = options.daysToKeep || 30;
		const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

		// Remove old batches
		for (const [id, batch] of this.batches.entries()) {
			if (batch.timestamp < cutoffTime && batch.status === "completed") {
				this.batches.delete(id);
			}
		}

		// Remove orphaned fingerprints
		if (options.removeOrphans) {
			const fingerprintsToRemove: string[] = [];

			for (const [id, fingerprint] of this.fingerprints.entries()) {
				// Skip failed if we want to keep them
				if (options.keepFailed && fingerprint.processingStatus === "failed") {
					continue;
				}

				// Check if file still exists
				try {
					const exists = await RNFS.exists(fingerprint.uri);
					if (!exists && fingerprint.firstSeen < cutoffTime) {
						fingerprintsToRemove.push(id);
					}
				} catch {
					// Can't verify, check age
					if (fingerprint.firstSeen < cutoffTime) {
						fingerprintsToRemove.push(id);
					}
				}
			}

			// Remove from all indexes
			for (const id of fingerprintsToRemove) {
				const fp = this.fingerprints.get(id);
				if (fp) {
					this.fingerprints.delete(id);
					this.uriToFingerprintId.delete(fp.uri);
					this.uriToFingerprintId.delete(fp.originalUri);
					this.contentHashToFingerprintId.delete(fp.contentHash);
				}
			}

			console.log(
				`[FileTracker] Cleanup: removed ${fingerprintsToRemove.length} orphaned fingerprints`,
			);
		}

		// Clear cache
		this.fingerprintCache.clear();

		await this.saveToStorage();
	}
}

// Export singleton
export const improvedFileTracker = new ImprovedFileTracker();
