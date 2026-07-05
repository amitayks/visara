/**
 * Shared contract types for the v2 backend (rebuild-backend-gemma).
 * Every backend module codes against these; the UI compiles against the
 * row/event shapes unchanged from the v1 contract (services-ui-facade spec).
 */

// ---------------------------------------------------------------------------
// Media rows
// ---------------------------------------------------------------------------

export type MediaKind = "image" | "video" | "pdf";

export type EnrichStatus =
	| "pending"
	| "processing"
	| "done"
	| "failed"
	| "skipped";

/**
 * The row shape the UI reads (legacy field names preserved — gallery cells,
 * viewer, and search stores compile unchanged). Emitted arrays pass through a
 * RowCache so unchanged rows keep object identity across emissions
 * (ui-state-management spec).
 */
export interface MediaRow {
	id: string;
	uri: string;
	/** Always null in v2 (no thumbnail file pipeline); kept for UI compat. */
	thumbnailUri: string | null;
	filename: string;
	mimeType: string;
	/** Epoch ms. */
	creationDate: number;
	isHidden: boolean;
	/** True when enrich_status === 'done' (UI compat mapping). */
	isProcessed: boolean;
	width: number;
	height: number;
	fileSize: number;
	kind: MediaKind;
	enrichStatus: EnrichStatus;
}

/** Minimal record streamed by the MediaIndexer native module. */
export interface MediaItem {
	id: string;
	uri: string;
	filename: string;
	mimeType: string;
	kind: MediaKind;
	width: number;
	height: number;
	fileSize: number;
	/** Epoch ms (Android DATE_TAKEN, fallback DATE_ADDED*1000; iOS creationDate). */
	takenAt: number;
}

export interface IndexerDelta {
	added: MediaItem[];
	updated: MediaItem[];
	deletedIds: string[];
	newToken: string;
	/** True → token unusable; caller must fullScan + reconcile. */
	full: boolean;
}

export type AccessStatus = "granted" | "limited" | "denied";

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/** Output of one Gemma vision pass (gemma-vision-enrichment spec). */
export interface EnrichmentResult {
	caption: string;
	description: string;
	/** Lowercased, deduped, capped at 16. */
	tags: string[];
	/** Transcription of legible in-photo text; empty string when none. */
	text: string;
}

export interface VisionAnalysis {
	ok: boolean;
	result?: EnrichmentResult;
	error?: string;
	durationMs: number;
}

/** Runtime-agnostic engine seams (design D1/D3/D4). */
export interface VisionEngine {
	/** Resolves (never rejects) with the analysis envelope. */
	analyze(fileUri: string): Promise<VisionAnalysis>;
	/** Release the native context. Safe to call when not loaded. */
	dispose(): Promise<void>;
}

export interface EmbedEngine {
	/** Document embedding — 256-d L2-normalized Float32Array, or null (fail-soft). */
	embedDoc(text: string): Promise<Float32Array | null>;
	/** Query embedding — same space as embedDoc. */
	embedQuery(text: string): Promise<Float32Array | null>;
	dispose(): Promise<void>;
}

export interface MediaMetadata {
	labels: string[];
	ocrText: string | null;
	caption: string | null;
	description: string | null;
}

// ---------------------------------------------------------------------------
// Pipeline events (preserved OrchestratorEvent union + discovery-complete)
// ---------------------------------------------------------------------------

export type PipelineEvent =
	| { type: "started" }
	| { type: "scan-progress"; discovered: number; total: number }
	| { type: "discovery-complete"; total: number }
	| { type: "item-processed"; mediaFileId: string; filename: string }
	| {
			type: "item-failed";
			mediaFileId: string;
			filename: string;
			error: string;
	  }
	| {
			type: "progress";
			processed: number;
			total: number;
			failed: number;
			currentFileName?: string;
	  }
	| { type: "paused" }
	| { type: "resumed" }
	| { type: "completed" };

export interface PipelineSnapshot {
	processed: number;
	total: number;
	failed: number;
	isRunning: boolean;
	isPaused: boolean;
}

export type PauseReason =
	| "manual"
	| "thermal"
	| "battery"
	| "battery-saver"
	| "night-window"
	| "model-not-ready"
	| "discovery-pending"
	| "backgrounded";

export interface PipelineSettings {
	batterySaverEnabled: boolean;
	nightProcessingEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Model delivery (contract preserved for modelStore/onboarding/settings)
// ---------------------------------------------------------------------------

export type DeliveryStatus =
	| "idle"
	| "downloading"
	| "paused"
	| "verifying"
	| "ready"
	| "failed";

export interface ArtifactState {
	key: ModelArtifactKey;
	filename: string;
	bytesTotal: number;
	bytesDownloaded: number;
	verified: boolean;
	failed: boolean;
}

export interface DeliveryState {
	status: DeliveryStatus;
	enabled: boolean;
	artifacts: ArtifactState[];
	/** Aggregate across artifacts. */
	bytesTotal: number;
	bytesDownloaded: number;
	/** Set when status === 'failed' or a start attempt was rejected. */
	errorReason?: "notEnoughSpace" | "checksumMismatch" | "network" | "unknown";
}

export type ModelArtifactKey = "vlm" | "mmproj" | "embedder";

export interface ModelArtifact {
	key: ModelArtifactKey;
	url: string;
	filename: string;
	bytes: number;
	sha256: string;
}

export interface ModelManifest {
	/** Stamped into media.model_version by enrichment; reprocess compares it. */
	modelVersion: string;
	/** Embedder version tag for embedding_meta rows. */
	embedderVersion: string;
	artifacts: ModelArtifact[];
}

// ---------------------------------------------------------------------------
// Albums (surface parity with v1 repos)
// ---------------------------------------------------------------------------

export interface AlbumRow {
	id: string;
	name: string;
	isSmart: boolean;
	smartTag: string | null;
	sortOrder: number;
	createdAt: number;
}

// ---------------------------------------------------------------------------
// Invalidation bus
// ---------------------------------------------------------------------------

export type WatchedTable = "media" | "enrichment" | "albums";
