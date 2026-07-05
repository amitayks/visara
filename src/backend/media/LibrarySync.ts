import type {
	EnrichmentRepoContract,
	InvalidationBus,
	MediaRepoContract,
	SyncStateContract,
} from "@backend/contracts";
import { SYNC_KEYS } from "@backend/contracts";
import type {
	IndexerDelta,
	MediaItem,
	MediaKind,
	PipelineEvent,
} from "@backend/types";
import NativeMediaIndexer, {
	type DeltaResult,
	type Spec as MediaIndexerSpec,
	type MediaItemPayload,
} from "@native-modules/NativeMediaIndexer";
import { NativeEventEmitter, Platform } from "react-native";

/**
 * Library sync — discovery-first (library-discovery-first spec, design D8).
 *
 * Every session: full scan (no token / pending full flag / `full: true`
 * delta) or incremental `changesSince(token)`, then reconcile deletions,
 * persist the token, flip the per-session discovery-complete gate, and start
 * live observation. The pipeline's admission gate consumes
 * `isDiscoveryComplete()` — processing never races discovery.
 *
 * Testability: the core never constructs react-native's `NativeEventEmitter`
 * itself — it accepts any {@link IndexerEventSource}; the real emitter is
 * wired lazily (only when deps omit `events`) at start() time. Delta
 * application is the exported pure-ish {@link applyDelta} over injected repos.
 */

// --- Native event names (MediaIndexer TurboModule contract, design D7) ------

export const INDEXER_BATCH_EVENT = "indexer_batch";
export const INDEXER_SCAN_COMPLETE_EVENT = "indexer_scan_complete";
export const INDEXER_CHANGED_EVENT = "indexer_changed";

/** Items per streamed full-scan batch. */
export const SCAN_BATCH_SIZE = 2000;

/** Live observer throttle (parity with the old MediaObserver cadence). */
export const OBSERVER_THROTTLE_MS = 2000;

/**
 * sync_state flag set before a full scan starts and cleared only after its
 * token is persisted — a crash mid-rescan re-enters the full path next boot.
 */
export const FULL_RESCAN_PENDING_KEY = "indexer_full_rescan_pending";

// --- Injected seams ----------------------------------------------------------

export interface IndexerEventSubscription {
	remove(): void;
}

/** Minimal emitter seam; react-native's NativeEventEmitter satisfies it. */
export interface IndexerEventSource {
	addListener(
		eventName: string,
		handler: (payload: unknown) => void,
	): IndexerEventSubscription;
}

/** The slice of the MediaIndexer TurboModule LibrarySync drives. */
export type IndexerModule = Pick<
	MediaIndexerSpec,
	| "startFullScan"
	| "startPdfScan"
	| "changesSince"
	| "startObserving"
	| "stopObserving"
>;

export type LibrarySyncMediaRepo = Pick<
	MediaRepoContract,
	"upsertBatch" | "allIds" | "purgeByIds" | "markSkipped"
>;

export type LibrarySyncEnrichmentRepo = Pick<
	EnrichmentRepoContract,
	"indexFilename"
>;

export interface LibrarySyncDeps {
	mediaRepo: LibrarySyncMediaRepo;
	enrichmentRepo: LibrarySyncEnrichmentRepo;
	syncState: SyncStateContract;
	bus: InvalidationBus;
	/** Defaults to the real MediaIndexer TurboModule (wired lazily). */
	indexer?: IndexerModule;
	/** Defaults to a NativeEventEmitter over the real module (wired lazily). */
	events?: IndexerEventSource;
	/** Defaults to Platform.OS; injectable for the pdfScan phase in tests. */
	platform?: "ios" | "android";
	observerThrottleMs?: number;
	scanBatchSize?: number;
}

/** Events LibrarySync emits (members of the preserved PipelineEvent union). */
export type LibrarySyncEvent = Extract<
	PipelineEvent,
	{ type: "scan-progress" } | { type: "discovery-complete" }
>;

// --- Payload mapping ---------------------------------------------------------

function toMediaKind(kind: string): MediaKind {
	if (kind === "video") return "video";
	if (kind === "pdf") return "pdf";
	return "image";
}

/** Native batch payload record → typed MediaItem (kind narrowed). */
export function toMediaItem(payload: MediaItemPayload): MediaItem {
	return {
		id: payload.id,
		uri: payload.uri,
		filename: payload.filename,
		mimeType: payload.mimeType,
		kind: toMediaKind(payload.kind),
		width: payload.width,
		height: payload.height,
		fileSize: payload.fileSize,
		takenAt: payload.takenAt,
	};
}

function toIndexerDelta(raw: DeltaResult): IndexerDelta {
	return {
		added: raw.added.map(toMediaItem),
		updated: raw.updated.map(toMediaItem),
		deletedIds: raw.deletedIds,
		newToken: raw.newToken,
		full: raw.full,
	};
}

function readBatchPayload(payload: unknown): MediaItemPayload[] {
	if (!payload || typeof payload !== "object") return [];
	const items = (payload as { items?: unknown }).items;
	return Array.isArray(items) ? (items as MediaItemPayload[]) : [];
}

function readScanCompletePayload(payload: unknown): {
	total: number;
	token: string;
} {
	if (!payload || typeof payload !== "object") return { total: 0, token: "" };
	const record = payload as { total?: unknown; token?: unknown };
	return {
		total: typeof record.total === "number" ? record.total : 0,
		token: typeof record.token === "string" ? record.token : "",
	};
}

function toError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

// --- Delta application (exported for unit tests) -----------------------------

export interface ApplyDeltaRepos {
	mediaRepo: Pick<
		LibrarySyncMediaRepo,
		"upsertBatch" | "purgeByIds" | "markSkipped"
	>;
	enrichmentRepo: LibrarySyncEnrichmentRepo;
	syncState: SyncStateContract;
}

/**
 * Apply one non-full delta: upsert `added`+`updated` (metadata-only by repo
 * contract), index filenames into FTS, mark non-image rows `skipped`, purge
 * `deletedIds`, and ONLY THEN persist the new token — a crash mid-apply keeps
 * the old token so the same deltas are re-fetched (upserts are idempotent by
 * URI, per spec "Token persists only after apply").
 *
 * Throws on `full: true` — the caller must reroute to the full-scan path.
 */
export async function applyDelta(
	delta: IndexerDelta,
	repos: ApplyDeltaRepos,
): Promise<void> {
	if (delta.full) {
		throw new Error(
			"[LibrarySync] applyDelta received a full delta — reroute to fullScan",
		);
	}
	const upserts = [...delta.added, ...delta.updated];
	if (upserts.length > 0) {
		await repos.mediaRepo.upsertBatch(upserts);
		await Promise.all(
			upserts.map((item) =>
				repos.enrichmentRepo.indexFilename(item.id, item.filename),
			),
		);
		const nonImageIds = upserts
			.filter((item) => item.kind !== "image")
			.map((item) => item.id);
		if (nonImageIds.length > 0) {
			await repos.mediaRepo.markSkipped(nonImageIds);
		}
	}
	if (delta.deletedIds.length > 0) {
		await repos.mediaRepo.purgeByIds(delta.deletedIds);
	}
	await repos.syncState.set(SYNC_KEYS.changeToken, delta.newToken);
}

// --- Default native wiring (the wire() helper) --------------------------------

/**
 * Bind the real TurboModule + event emitter. Called lazily (never at module
 * scope) so the testable core stays free of react-native emitter construction.
 */
export function wireNativeIndexer(): {
	indexer: IndexerModule;
	events: IndexerEventSource;
} {
	const module = NativeMediaIndexer;
	if (!module) {
		throw new Error("[LibrarySync] MediaIndexer TurboModule is not available");
	}
	const emitter = new NativeEventEmitter(
		module as unknown as ConstructorParameters<typeof NativeEventEmitter>[0],
	);
	return { indexer: module, events: emitter };
}

interface ResolvedLibrarySyncDeps {
	mediaRepo: LibrarySyncMediaRepo;
	enrichmentRepo: LibrarySyncEnrichmentRepo;
	syncState: SyncStateContract;
	bus: InvalidationBus;
	indexer: IndexerModule;
	events: IndexerEventSource;
	platform: "ios" | "android";
	observerThrottleMs: number;
	scanBatchSize: number;
}

function resolveDeps(deps: LibrarySyncDeps): ResolvedLibrarySyncDeps {
	const needsWiring = !deps.indexer || !deps.events;
	const wired = needsWiring ? wireNativeIndexer() : null;
	const indexer = deps.indexer ?? wired?.indexer;
	const events = deps.events ?? wired?.events;
	if (!indexer || !events) {
		throw new Error("[LibrarySync] indexer wiring failed");
	}
	return {
		mediaRepo: deps.mediaRepo,
		enrichmentRepo: deps.enrichmentRepo,
		syncState: deps.syncState,
		bus: deps.bus,
		indexer,
		events,
		platform: deps.platform ?? (Platform.OS === "android" ? "android" : "ios"),
		observerThrottleMs: deps.observerThrottleMs ?? OBSERVER_THROTTLE_MS,
		scanBatchSize: deps.scanBatchSize ?? SCAN_BATCH_SIZE,
	};
}

// --- Controller ---------------------------------------------------------------

/**
 * One session's sync state machine. Instantiable for tests; the app uses one
 * instance behind the static {@link LibrarySync} facade.
 */
export class LibrarySyncController {
	private readonly deps: ResolvedLibrarySyncDeps;
	private readonly emit: (event: LibrarySyncEvent) => void;

	/** Bumped by stop(); in-flight async work checks it and abandons quietly. */
	private session = 0;
	private discoveryComplete = false;
	private observing = false;
	private startPromise: Promise<void> | null = null;
	/** Serializes observer-poke delta rounds (one at a time, in order). */
	private deltaChain: Promise<void> = Promise.resolve();
	private subscriptions = new Set<IndexerEventSubscription>();
	/** Settles a pending full-scan promise early on stop(). */
	private abortScan: (() => void) | null = null;

	constructor(deps: LibrarySyncDeps, emit: (event: LibrarySyncEvent) => void) {
		this.deps = resolveDeps(deps);
		this.emit = emit;
	}

	isDiscoveryComplete(): boolean {
		return this.discoveryComplete;
	}

	/** Resolves when this session's discovery completes (memoized). */
	start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		const promise = this.runStart().catch((error) => {
			if (this.startPromise === promise) this.startPromise = null;
			throw error;
		});
		this.startPromise = promise;
		return promise;
	}

	/** Stop observation, drop subscriptions, abandon in-flight work. */
	stop(): void {
		this.session += 1;
		this.startPromise = null;
		this.discoveryComplete = false;
		this.abortScan?.();
		if (this.observing) {
			try {
				this.deps.indexer.stopObserving();
			} catch (error) {
				console.warn("[LibrarySync] stopObserving failed", error);
			}
			this.observing = false;
		}
		for (const sub of this.subscriptions) sub.remove();
		this.subscriptions.clear();
	}

	// --- Boot flow -------------------------------------------------------------

	private async runStart(): Promise<void> {
		const session = this.session;
		this.discoveryComplete = false;

		const token = await this.deps.syncState.get(SYNC_KEYS.changeToken);
		const fullPending = await this.deps.syncState.get(FULL_RESCAN_PENDING_KEY);
		if (session !== this.session) return;

		let total: number;
		if (!token || fullPending === "1") {
			total = await this.runFullScan(session);
		} else {
			const outcome = await this.runDeltaRound();
			if (session !== this.session) return;
			if (outcome === "full") {
				total = await this.runFullScan(session);
			} else {
				total = (await this.deps.mediaRepo.allIds()).size;
			}
		}
		if (session !== this.session) return;

		this.discoveryComplete = true;
		this.emit({ type: "discovery-complete", total });
		this.startObserver();
	}

	// --- Full-scan path ----------------------------------------------------------

	/**
	 * Stream `startFullScan` batches into upserts (+ FTS filename rows +
	 * non-image skip marks), run the Android pdf phase, reconcile deletions,
	 * persist the token, clear the full flag. Resolves with the scanned total.
	 */
	private async runFullScan(session: number): Promise<number> {
		await this.deps.syncState.set(FULL_RESCAN_PENDING_KEY, "1");
		if (session !== this.session) return 0;

		return await new Promise<number>((resolve, reject) => {
			const seen = new Set<string>();
			let discovered = 0;
			let phase: "media" | "pdf" = "media";
			let mainToken = "";
			let firstError: unknown = null;
			let settled = false;
			let chain: Promise<void> = Promise.resolve();
			const scanSubs: IndexerEventSubscription[] = [];

			const settle = (settler: () => void): void => {
				if (settled) return;
				settled = true;
				this.abortScan = null;
				for (const sub of scanSubs) {
					sub.remove();
					this.subscriptions.delete(sub);
				}
				settler();
			};

			/** Serialize batch persistence; capture the first failure. */
			const enqueue = (work: () => Promise<void>): void => {
				chain = chain.then(async () => {
					if (firstError !== null || settled) return;
					try {
						await work();
					} catch (error) {
						firstError = error;
					}
				});
			};

			const track = (sub: IndexerEventSubscription): void => {
				scanSubs.push(sub);
				this.subscriptions.add(sub);
			};

			track(
				this.deps.events.addListener(INDEXER_BATCH_EVENT, (payload) => {
					const items = readBatchPayload(payload);
					if (items.length === 0) return;
					enqueue(async () => {
						await this.applyScanBatch(items, seen);
						discovered += items.length;
						this.emit({ type: "scan-progress", discovered, total: -1 });
					});
				}),
			);

			track(
				this.deps.events.addListener(INDEXER_SCAN_COMPLETE_EVENT, (payload) => {
					const info = readScanCompletePayload(payload);
					if (phase === "media") {
						mainToken = info.token;
						if (this.deps.platform === "android") {
							phase = "pdf";
							try {
								// PDF sweep AFTER the media scan so pdf ids land in `seen`
								// before reconciliation (kind='pdf' rows must not be purged).
								this.deps.indexer.startPdfScan();
								return;
							} catch (error) {
								console.warn(
									"[LibrarySync] pdfScan failed to start (skipped)",
									error,
								);
							}
						}
					}
					enqueue(async () => {
						await this.reconcile(seen);
						await this.deps.syncState.set(SYNC_KEYS.changeToken, mainToken);
						await this.deps.syncState.delete(FULL_RESCAN_PENDING_KEY);
						this.emit({
							type: "scan-progress",
							discovered: seen.size,
							total: seen.size,
						});
					});
					chain = chain.then(() => {
						if (settled) return;
						if (firstError !== null) {
							const error = toError(firstError);
							settle(() => reject(error));
						} else {
							settle(() => resolve(seen.size));
						}
					});
				}),
			);

			this.abortScan = () => settle(() => resolve(seen.size));
			try {
				this.deps.indexer.startFullScan(this.deps.scanBatchSize);
			} catch (error) {
				settle(() => reject(toError(error)));
			}
		});
	}

	/**
	 * One streamed batch: metadata-only upsert (never touches enrichment
	 * state), discovery-time FTS filename rows, non-image rows marked
	 * `skipped` (videos/PDFs never enter the pipeline).
	 */
	private async applyScanBatch(
		items: MediaItemPayload[],
		seen: Set<string>,
	): Promise<void> {
		const mapped = items.map(toMediaItem);
		await this.deps.mediaRepo.upsertBatch(mapped);
		await Promise.all(
			mapped.map((item) =>
				this.deps.enrichmentRepo.indexFilename(item.id, item.filename),
			),
		);
		const nonImageIds = mapped
			.filter((item) => item.kind !== "image")
			.map((item) => item.id);
		if (nonImageIds.length > 0) {
			await this.deps.mediaRepo.markSkipped(nonImageIds);
		}
		for (const item of mapped) seen.add(item.id);
		// Repos notify after commit per contract; this extra poke is coalesced
		// by the bus throttle and keeps the feed live even with a lax repo impl.
		this.deps.bus.notify("media");
	}

	/** DB ids absent from the scanned set → purge (rows/enrichment/FTS/vec). */
	private async reconcile(seen: Set<string>): Promise<void> {
		const known = await this.deps.mediaRepo.allIds();
		const missing: string[] = [];
		for (const id of known.keys()) {
			if (!seen.has(id)) missing.push(id);
		}
		if (missing.length > 0) {
			await this.deps.mediaRepo.purgeByIds(missing);
			this.deps.bus.notify("media");
		}
	}

	// --- Delta path ----------------------------------------------------------------

	private async runDeltaRound(): Promise<"applied" | "full"> {
		const token = (await this.deps.syncState.get(SYNC_KEYS.changeToken)) ?? "";
		const raw = await this.deps.indexer.changesSince(token);
		if (raw.full) return "full";
		const delta = toIndexerDelta(raw);
		await applyDelta(delta, {
			mediaRepo: this.deps.mediaRepo,
			enrichmentRepo: this.deps.enrichmentRepo,
			syncState: this.deps.syncState,
		});
		if (
			delta.added.length > 0 ||
			delta.updated.length > 0 ||
			delta.deletedIds.length > 0
		) {
			this.deps.bus.notify("media");
		}
		return "applied";
	}

	// --- Live observation ------------------------------------------------------------

	private startObserver(): void {
		if (this.observing) return;
		this.observing = true;
		const sub = this.deps.events.addListener(INDEXER_CHANGED_EVENT, () => {
			this.queueDeltaRound();
		});
		this.subscriptions.add(sub);
		try {
			this.deps.indexer.startObserving(this.deps.observerThrottleMs);
		} catch (error) {
			console.warn("[LibrarySync] startObserving failed", error);
		}
	}

	/** Serialized response to an `indexer_changed` poke. */
	private queueDeltaRound(): void {
		const session = this.session;
		this.deltaChain = this.deltaChain.then(async () => {
			if (session !== this.session || !this.discoveryComplete) return;
			try {
				const outcome = await this.runDeltaRound();
				if (outcome === "full" && session === this.session) {
					// Mid-session token expiry/version change: routine, not
					// exceptional — rerun the full path and re-open the gate.
					const total = await this.runFullScan(session);
					if (session === this.session) {
						this.emit({ type: "discovery-complete", total });
					}
				}
			} catch (error) {
				console.warn("[LibrarySync] live delta round failed", error);
			}
		});
	}
}

// --- Static facade --------------------------------------------------------------

const listeners = new Set<(event: LibrarySyncEvent) => void>();

function emitToListeners(event: LibrarySyncEvent): void {
	for (const listener of Array.from(listeners)) {
		try {
			listener(event);
		} catch (error) {
			console.warn("[LibrarySync] listener failed", error);
		}
	}
}

/**
 * All-static surface consumed by the bootstrap/facade (sibling-service
 * pattern). The composition root injects real repos via `configure()`; the
 * native indexer + emitter are default-wired lazily at start() when omitted.
 */
export class LibrarySync {
	private static deps: LibrarySyncDeps | null = null;
	private static controller: LibrarySyncController | null = null;

	/** Inject dependencies. Replaces (and stops) any existing controller. */
	static configure(deps: LibrarySyncDeps): void {
		LibrarySync.controller?.stop();
		LibrarySync.controller = null;
		LibrarySync.deps = deps;
	}

	/**
	 * Run this session's discovery (full or delta path) through the
	 * discovery-complete gate, then keep observing. Resolves when discovery
	 * completes; concurrent calls share one in-flight promise.
	 */
	static async start(deps?: LibrarySyncDeps): Promise<void> {
		if (deps) LibrarySync.configure(deps);
		if (!LibrarySync.controller) {
			const configured = LibrarySync.deps;
			if (!configured) {
				throw new Error(
					"[LibrarySync] configure(deps) must be called before start()",
				);
			}
			LibrarySync.controller = new LibrarySyncController(
				configured,
				emitToListeners,
			);
		}
		await LibrarySync.controller.start();
	}

	/** Stop observation + subscriptions (stopAppServices teardown). */
	static stop(): void {
		LibrarySync.controller?.stop();
		LibrarySync.controller = null;
	}

	/** Per-session gate consumed by the pipeline's admission check. */
	static isDiscoveryComplete(): boolean {
		return LibrarySync.controller?.isDiscoveryComplete() ?? false;
	}

	static subscribe(listener: (event: LibrarySyncEvent) => void): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}
}
