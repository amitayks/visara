import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

/**
 * MediaIndexer TurboModule spec (media-indexer-native spec, design D7).
 * Codegen: VisaraSpecs. Implemented in Swift (MediaIndexerModule.swift) and
 * Kotlin (MediaIndexerModule.kt). Replaces the deleted MediaObserver module.
 *
 * Events (RCTEventEmitter / DeviceEventManagedModule):
 *  - "indexer_batch"         { items: MediaItemPayload[] }
 *  - "indexer_scan_complete" { total: number, token: string }
 *  - "indexer_changed"       {}   (observer poke — caller runs changesSince)
 */

/** Minimal per-asset record — never marshal fat payloads (163 MB OOM lesson). */
export interface MediaItemPayload {
	id: string;
	uri: string;
	filename: string;
	mimeType: string;
	/** 'image' | 'video' | 'pdf' */
	kind: string;
	width: number;
	height: number;
	fileSize: number;
	/** Epoch ms. */
	takenAt: number;
}

export interface DeltaResult {
	added: MediaItemPayload[];
	updated: MediaItemPayload[];
	deletedIds: string[];
	newToken: string;
	/** True → token unusable/expired; caller must fullScan + reconcile. */
	full: boolean;
}

export interface DeleteResult {
	deleted: string[];
}

export interface Spec extends TurboModule {
	/**
	 * Stream the entire accessible library as indexer_batch events (batchSize
	 * items each) followed by one indexer_scan_complete. Runs off-main-thread.
	 */
	startFullScan(batchSize: number): void;

	/** Android-only PDF sweep (same event stream, kind='pdf'). iOS: immediate scan_complete {total:0}. */
	startPdfScan(): void;

	/** Cross-launch deltas since `token` (empty string → full:true). */
	changesSince(token: string): Promise<DeltaResult>;

	/** Register the platform library observer emitting indexer_changed pokes. */
	startObserving(throttleMs: number): void;
	stopObserving(): void;

	/** 'granted' | 'limited' | 'denied' */
	requestAccess(): Promise<string>;
	getAccessStatus(): Promise<string>;

	/** OS-confirmed deletion; resolves ids actually deleted. */
	deleteAssets(ids: string[]): Promise<DeleteResult>;

	addListener(eventName: string): void;
	removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>("MediaIndexer");
