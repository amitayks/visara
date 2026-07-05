import type { InvalidationBus, SyncStateContract } from "@backend/contracts";
import { SYNC_KEYS } from "@backend/contracts";
import {
	applyDelta,
	FULL_RESCAN_PENDING_KEY,
	INDEXER_BATCH_EVENT,
	INDEXER_CHANGED_EVENT,
	INDEXER_SCAN_COMPLETE_EVENT,
	type IndexerEventSource,
	type IndexerEventSubscription,
	type IndexerModule,
	LibrarySync,
	type LibrarySyncEvent,
} from "@backend/media/LibrarySync";
import type { IndexerDelta, MediaItem } from "@backend/types";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type {
	DeltaResult,
	MediaItemPayload,
} from "@native-modules/NativeMediaIndexer";

/**
 * Delta-application + sync-flow logic with mocked repos and a fake indexer /
 * event source (library-discovery-first spec): added upserts + skip-marking
 * for non-images, deletedIds purge, token persisted only after apply, and
 * full:true rerouting into the streaming full-scan path.
 */

// --- Fixtures -------------------------------------------------------------

function payload(
	id: string,
	kind: string,
	overrides: Partial<MediaItemPayload> = {},
): MediaItemPayload {
	return {
		id,
		uri: `content://media/${id}`,
		filename: `${id}.jpg`,
		mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
		kind,
		width: 100,
		height: 100,
		fileSize: 1234,
		takenAt: 1_700_000_000_000,
		...overrides,
	};
}

function mediaItem(id: string, kind: MediaItem["kind"]): MediaItem {
	return {
		id,
		uri: `content://media/${id}`,
		filename: `${id}.jpg`,
		mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
		kind,
		width: 100,
		height: 100,
		fileSize: 1234,
		takenAt: 1_700_000_000_000,
	};
}

function emptyDelta(overrides: Partial<IndexerDelta> = {}): IndexerDelta {
	return {
		added: [],
		updated: [],
		deletedIds: [],
		newToken: "t-next",
		full: false,
		...overrides,
	};
}

// --- Fakes -----------------------------------------------------------------

class FakeIndexerEvents implements IndexerEventSource {
	private handlers = new Map<string, Set<(payload: unknown) => void>>();

	addListener(
		eventName: string,
		handler: (payload: unknown) => void,
	): IndexerEventSubscription {
		let set = this.handlers.get(eventName);
		if (!set) {
			set = new Set();
			this.handlers.set(eventName, set);
		}
		set.add(handler);
		return {
			remove: () => {
				this.handlers.get(eventName)?.delete(handler);
			},
		};
	}

	emit(eventName: string, eventPayload: unknown): void {
		const set = this.handlers.get(eventName);
		if (!set) return;
		for (const handler of Array.from(set)) handler(eventPayload);
	}
}

interface Harness {
	calls: string[];
	store: Map<string, string>;
	events: FakeIndexerEvents;
	indexer: {
		startFullScan: jest.Mock<(batchSize: number) => void>;
		startPdfScan: jest.Mock<() => void>;
		changesSince: jest.Mock<(token: string) => Promise<DeltaResult>>;
		startObserving: jest.Mock<(throttleMs: number) => void>;
		stopObserving: jest.Mock<() => void>;
	};
	mediaRepo: {
		upsertBatch: jest.Mock<(items: MediaItem[]) => Promise<void>>;
		allIds: jest.Mock<() => Promise<Map<string, string>>>;
		purgeByIds: jest.Mock<(ids: string[]) => Promise<void>>;
		markSkipped: jest.Mock<(ids: string[]) => Promise<void>>;
	};
	enrichmentRepo: {
		indexFilename: jest.Mock<(id: string, filename: string) => Promise<void>>;
	};
	syncState: SyncStateContract;
	bus: InvalidationBus;
}

function makeHarness(): Harness {
	const calls: string[] = [];
	const store = new Map<string, string>();
	const events = new FakeIndexerEvents();

	const mediaRepo = {
		upsertBatch: jest.fn<(items: MediaItem[]) => Promise<void>>(async () => {
			calls.push("upsertBatch");
		}),
		allIds: jest.fn<() => Promise<Map<string, string>>>(
			async () => new Map<string, string>(),
		),
		purgeByIds: jest.fn<(ids: string[]) => Promise<void>>(async () => {
			calls.push("purgeByIds");
		}),
		markSkipped: jest.fn<(ids: string[]) => Promise<void>>(async () => {
			calls.push("markSkipped");
		}),
	};

	const enrichmentRepo = {
		indexFilename: jest.fn<(id: string, filename: string) => Promise<void>>(
			async () => {
				calls.push("indexFilename");
			},
		),
	};

	const syncState: SyncStateContract = {
		get: async (key) => store.get(key) ?? null,
		set: async (key, value) => {
			calls.push(`set:${key}`);
			store.set(key, value);
		},
		delete: async (key) => {
			calls.push(`delete:${key}`);
			store.delete(key);
		},
	};

	const bus: InvalidationBus = {
		notify: jest.fn(),
		watch: jest.fn(() => () => {}),
	};

	const indexer = {
		startFullScan: jest.fn<(batchSize: number) => void>(),
		startPdfScan: jest.fn<() => void>(),
		changesSince: jest.fn<(token: string) => Promise<DeltaResult>>(),
		startObserving: jest.fn<(throttleMs: number) => void>(),
		stopObserving: jest.fn<() => void>(),
	};

	return {
		calls,
		store,
		events,
		indexer,
		mediaRepo,
		enrichmentRepo,
		syncState,
		bus,
	};
}

function startWithHarness(
	harness: Harness,
	platform: "ios" | "android" = "ios",
): Promise<void> {
	return LibrarySync.start({
		mediaRepo: harness.mediaRepo,
		enrichmentRepo: harness.enrichmentRepo,
		syncState: harness.syncState,
		bus: harness.bus,
		indexer: harness.indexer as IndexerModule,
		events: harness.events,
		platform,
	});
}

async function flushAsync(): Promise<void> {
	for (let i = 0; i < 20; i += 1) {
		await Promise.resolve();
	}
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

afterEach(() => {
	LibrarySync.stop();
});

// --- applyDelta (pure-ish, injected repos) -----------------------------------

describe("applyDelta", () => {
	it("upserts added+updated, indexes filenames, skips non-images, purges deletions, persists token", async () => {
		const h = makeHarness();
		const delta = emptyDelta({
			added: [mediaItem("img1", "image"), mediaItem("vid1", "video")],
			updated: [mediaItem("img2", "image")],
			deletedIds: ["gone1"],
			newToken: "t9",
		});

		await applyDelta(delta, {
			mediaRepo: h.mediaRepo,
			enrichmentRepo: h.enrichmentRepo,
			syncState: h.syncState,
		});

		expect(h.mediaRepo.upsertBatch).toHaveBeenCalledTimes(1);
		expect(h.mediaRepo.upsertBatch.mock.calls[0][0].map((i) => i.id)).toEqual([
			"img1",
			"vid1",
			"img2",
		]);
		expect(h.enrichmentRepo.indexFilename).toHaveBeenCalledTimes(3);
		expect(h.mediaRepo.markSkipped).toHaveBeenCalledWith(["vid1"]);
		expect(h.mediaRepo.purgeByIds).toHaveBeenCalledWith(["gone1"]);
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t9");
		// Token write is strictly LAST (durability order).
		expect(h.calls[h.calls.length - 1]).toBe(`set:${SYNC_KEYS.changeToken}`);
	});

	it("does not persist the token when apply fails midway", async () => {
		const h = makeHarness();
		h.mediaRepo.upsertBatch.mockRejectedValueOnce(new Error("disk full"));
		const delta = emptyDelta({
			added: [mediaItem("img1", "image")],
			newToken: "t9",
		});

		await expect(
			applyDelta(delta, {
				mediaRepo: h.mediaRepo,
				enrichmentRepo: h.enrichmentRepo,
				syncState: h.syncState,
			}),
		).rejects.toThrow("disk full");

		expect(h.store.has(SYNC_KEYS.changeToken)).toBe(false);
	});

	it("does not skip-mark when every upsert is an image", async () => {
		const h = makeHarness();
		await applyDelta(
			emptyDelta({ added: [mediaItem("img1", "image")], newToken: "t1" }),
			{
				mediaRepo: h.mediaRepo,
				enrichmentRepo: h.enrichmentRepo,
				syncState: h.syncState,
			},
		);
		expect(h.mediaRepo.markSkipped).not.toHaveBeenCalled();
	});

	it("advances the token on an empty delta without any repo writes", async () => {
		const h = makeHarness();
		await applyDelta(emptyDelta({ newToken: "t2" }), {
			mediaRepo: h.mediaRepo,
			enrichmentRepo: h.enrichmentRepo,
			syncState: h.syncState,
		});
		expect(h.mediaRepo.upsertBatch).not.toHaveBeenCalled();
		expect(h.mediaRepo.purgeByIds).not.toHaveBeenCalled();
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t2");
	});

	it("throws on a full delta — caller must reroute to fullScan", async () => {
		const h = makeHarness();
		await expect(
			applyDelta(emptyDelta({ full: true }), {
				mediaRepo: h.mediaRepo,
				enrichmentRepo: h.enrichmentRepo,
				syncState: h.syncState,
			}),
		).rejects.toThrow(/full delta/);
	});
});

// --- LibrarySync flow (mocked indexer + event source) --------------------------

describe("LibrarySync.start — delta path", () => {
	it("applies changesSince, persists the token, emits discovery-complete, starts observing", async () => {
		const h = makeHarness();
		h.store.set(SYNC_KEYS.changeToken, "t0");
		h.indexer.changesSince.mockResolvedValue({
			added: [payload("new1", "image")],
			updated: [],
			deletedIds: [],
			newToken: "t1",
			full: false,
		});
		h.mediaRepo.allIds.mockResolvedValue(
			new Map([["new1", "content://media/new1"]]),
		);

		const seen: LibrarySyncEvent[] = [];
		const unsubscribe = LibrarySync.subscribe((event) => {
			seen.push(event);
		});

		await startWithHarness(h);

		expect(h.indexer.changesSince).toHaveBeenCalledWith("t0");
		expect(h.indexer.startFullScan).not.toHaveBeenCalled();
		expect(h.mediaRepo.upsertBatch).toHaveBeenCalledTimes(1);
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t1");
		expect(LibrarySync.isDiscoveryComplete()).toBe(true);
		expect(seen).toEqual([{ type: "discovery-complete", total: 1 }]);
		expect(h.indexer.startObserving).toHaveBeenCalledWith(2000);
		unsubscribe();
	});

	it("responds to an indexer_changed poke with a serialized delta round", async () => {
		const h = makeHarness();
		h.store.set(SYNC_KEYS.changeToken, "t0");
		h.indexer.changesSince.mockResolvedValueOnce({
			added: [],
			updated: [],
			deletedIds: [],
			newToken: "t1",
			full: false,
		});

		await startWithHarness(h);

		h.indexer.changesSince.mockResolvedValueOnce({
			added: [],
			updated: [],
			deletedIds: ["dead1"],
			newToken: "t2",
			full: false,
		});
		h.events.emit(INDEXER_CHANGED_EVENT, {});
		await flushAsync();

		expect(h.indexer.changesSince).toHaveBeenLastCalledWith("t1");
		expect(h.mediaRepo.purgeByIds).toHaveBeenCalledWith(["dead1"]);
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t2");
	});
});

describe("LibrarySync.start — full path", () => {
	function wireFullScan(
		h: Harness,
		batches: MediaItemPayload[][],
		token: string,
	): void {
		h.indexer.startFullScan.mockImplementation(() => {
			for (const items of batches) {
				h.events.emit(INDEXER_BATCH_EVENT, { items });
			}
			h.events.emit(INDEXER_SCAN_COMPLETE_EVENT, {
				total: batches.reduce((n, b) => n + b.length, 0),
				token,
			});
		});
	}

	it("full:true from changesSince reroutes into the streaming full scan", async () => {
		const h = makeHarness();
		h.store.set(SYNC_KEYS.changeToken, "t0");
		h.indexer.changesSince.mockResolvedValue({
			added: [],
			updated: [],
			deletedIds: [],
			newToken: "",
			full: true,
		});
		wireFullScan(h, [[payload("m1", "image"), payload("v1", "video")]], "t2");
		h.mediaRepo.allIds.mockResolvedValue(
			new Map([
				["m1", "u1"],
				["v1", "u2"],
				["stale1", "u3"],
			]),
		);

		const seen: LibrarySyncEvent[] = [];
		const unsubscribe = LibrarySync.subscribe((event) => {
			seen.push(event);
		});

		await startWithHarness(h);

		expect(h.indexer.startFullScan).toHaveBeenCalledWith(2000);
		expect(h.mediaRepo.upsertBatch).toHaveBeenCalledTimes(1);
		expect(h.mediaRepo.markSkipped).toHaveBeenCalledWith(["v1"]);
		// Reconciliation purges DB ids the scan did not see.
		expect(h.mediaRepo.purgeByIds).toHaveBeenCalledWith(["stale1"]);
		// Token persisted only after reconcile (order check).
		expect(h.calls.indexOf("purgeByIds")).toBeLessThan(
			h.calls.indexOf(`set:${SYNC_KEYS.changeToken}`),
		);
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t2");
		// Crash-recovery flag set during the scan is cleared at the end.
		expect(h.store.has(FULL_RESCAN_PENDING_KEY)).toBe(false);
		expect(seen).toEqual([
			{ type: "scan-progress", discovered: 2, total: -1 },
			{ type: "scan-progress", discovered: 2, total: 2 },
			{ type: "discovery-complete", total: 2 },
		]);
		unsubscribe();
	});

	it("runs the full path when no token exists (first launch)", async () => {
		const h = makeHarness();
		wireFullScan(h, [[payload("m1", "image")]], "t-first");

		await startWithHarness(h);

		expect(h.indexer.changesSince).not.toHaveBeenCalled();
		expect(h.indexer.startFullScan).toHaveBeenCalledWith(2000);
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t-first");
		expect(LibrarySync.isDiscoveryComplete()).toBe(true);
	});

	it("runs the full path when the crash-recovery full flag is set", async () => {
		const h = makeHarness();
		h.store.set(SYNC_KEYS.changeToken, "t0");
		h.store.set(FULL_RESCAN_PENDING_KEY, "1");
		wireFullScan(h, [[payload("m1", "image")]], "t-recovered");

		await startWithHarness(h);

		expect(h.indexer.changesSince).not.toHaveBeenCalled();
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("t-recovered");
		expect(h.store.has(FULL_RESCAN_PENDING_KEY)).toBe(false);
	});

	it("on Android, chains the pdf sweep after the media scan and reconciles across both", async () => {
		const h = makeHarness();
		h.indexer.startFullScan.mockImplementation(() => {
			h.events.emit(INDEXER_BATCH_EVENT, {
				items: [payload("img1", "image")],
			});
			h.events.emit(INDEXER_SCAN_COMPLETE_EVENT, { total: 1, token: "tm" });
		});
		h.indexer.startPdfScan.mockImplementation(() => {
			h.events.emit(INDEXER_BATCH_EVENT, {
				items: [payload("pdf1", "pdf", { mimeType: "application/pdf" })],
			});
			h.events.emit(INDEXER_SCAN_COMPLETE_EVENT, { total: 1, token: "" });
		});
		h.mediaRepo.allIds.mockResolvedValue(
			new Map([
				["img1", "u1"],
				["pdf1", "u2"],
			]),
		);

		await startWithHarness(h, "android");

		expect(h.indexer.startPdfScan).toHaveBeenCalledTimes(1);
		// PDF row upserted and skip-marked, and NOT purged by reconciliation.
		expect(h.mediaRepo.upsertBatch).toHaveBeenCalledTimes(2);
		expect(h.mediaRepo.markSkipped).toHaveBeenCalledWith(["pdf1"]);
		expect(h.mediaRepo.purgeByIds).not.toHaveBeenCalled();
		// The MEDIA scan's token wins (pdf phase carries no usable token).
		expect(h.store.get(SYNC_KEYS.changeToken)).toBe("tm");
	});

	it("does not run the pdf sweep on iOS", async () => {
		const h = makeHarness();
		wireFullScan(h, [[payload("m1", "image")]], "t1");

		await startWithHarness(h, "ios");

		expect(h.indexer.startPdfScan).not.toHaveBeenCalled();
	});
});
