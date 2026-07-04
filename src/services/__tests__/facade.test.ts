import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { MediaFile } from "@models/MediaFile";
import type { HybridSearchResult } from "@services/search/HybridSearchService";
import { removeMedia, searchMedia } from "../facade";

/**
 * Facade behavior tests (services-ui-facade spec). All service/native deps are
 * jest.mock'ed; the module-scope mock* fns below survive jest.resetModules(),
 * so the ensureSearchIndex block can re-import a fresh facade per test while
 * keeping typed handles.
 */

const mockUnlink = jest.fn<(path: string) => Promise<void>>();
const mockHybridSearch =
	jest.fn<(query: string) => Promise<HybridSearchResult[]>>();
const mockFindByIds = jest.fn<(ids: string[]) => Promise<MediaFile[]>>();
const mockOrchestratorRemove = jest.fn<(media: MediaFile) => Promise<void>>();
const mockLoadIndex = jest.fn<() => Promise<boolean>>();
const mockBuildIndex = jest.fn<() => Promise<void>>();
const mockSemanticLoadIndex = jest.fn<() => Promise<boolean>>();

jest.mock("@dr.pogodin/react-native-fs", () => ({
	__esModule: true,
	default: { unlink: (path: string) => mockUnlink(path) },
}));

jest.mock("@services/search/HybridSearchService", () => ({
	HybridSearchService: { search: (query: string) => mockHybridSearch(query) },
}));

jest.mock("@services/database/MediaFileRepository", () => ({
	MediaFileRepository: { findByIds: (ids: string[]) => mockFindByIds(ids) },
}));

jest.mock("@services/orchestrator/OrchestratorService", () => ({
	OrchestratorService: {
		removeMedia: (media: MediaFile) => mockOrchestratorRemove(media),
	},
}));

jest.mock("@services/search/SearchService", () => ({
	SearchService: {
		loadIndex: () => mockLoadIndex(),
		index: () => mockBuildIndex(),
	},
}));

jest.mock("@services/search/SemanticSearchService", () => ({
	SemanticSearchService: { loadIndex: () => mockSemanticLoadIndex() },
}));

const media = (id: string): MediaFile =>
	({ id, uri: `file:///media/${id}.jpg` }) as unknown as MediaFile;

const ranked = (id: string, score: number): HybridSearchResult => ({
	id,
	score,
});

beforeEach(() => {
	jest.resetAllMocks();
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe("searchMedia — fused-rank hydration", () => {
	it("returns hydrated media in fused ranking order via ONE batched query", async () => {
		mockHybridSearch.mockResolvedValue([
			ranked("b", 0.9),
			ranked("a", 0.8),
			ranked("c", 0.7),
		]);
		// The repository answers in DB order, NOT ranking order:
		mockFindByIds.mockResolvedValue([media("a"), media("b"), media("c")]);

		const results = await searchMedia("receipt");

		expect(results.map((m) => m.id)).toEqual(["b", "a", "c"]);
		expect(mockFindByIds).toHaveBeenCalledTimes(1);
		expect(mockFindByIds).toHaveBeenCalledWith(["b", "a", "c"]);
	});

	it("drops ids deleted between indexing and hydration, preserving order", async () => {
		mockHybridSearch.mockResolvedValue([
			ranked("b", 0.9),
			ranked("ghost", 0.8),
			ranked("a", 0.7),
		]);
		mockFindByIds.mockResolvedValue([media("a"), media("b")]);

		const results = await searchMedia("dog");

		expect(results.map((m) => m.id)).toEqual(["b", "a"]);
	});

	it("returns [] without touching the repository when nothing matched", async () => {
		mockHybridSearch.mockResolvedValue([]);

		await expect(searchMedia("nomatch")).resolves.toEqual([]);
		expect(mockFindByIds).not.toHaveBeenCalled();
	});
});

describe("removeMedia — permanent vs app-only", () => {
	it("app-only removal never touches the device file", async () => {
		mockOrchestratorRemove.mockResolvedValue(undefined);
		const photo = media("p1");

		await removeMedia(photo, { permanent: false });

		expect(mockUnlink).not.toHaveBeenCalled();
		expect(mockOrchestratorRemove).toHaveBeenCalledTimes(1);
		expect(mockOrchestratorRemove).toHaveBeenCalledWith(photo);
	});

	it("permanent removal unlinks the device file, then runs app-side cleanup", async () => {
		mockUnlink.mockResolvedValue(undefined);
		mockOrchestratorRemove.mockResolvedValue(undefined);
		const photo = media("p2");

		await removeMedia(photo, { permanent: true });

		expect(mockUnlink).toHaveBeenCalledWith(photo.uri);
		expect(mockOrchestratorRemove).toHaveBeenCalledWith(photo);
		expect(mockUnlink.mock.invocationCallOrder[0]).toBeLessThan(
			mockOrchestratorRemove.mock.invocationCallOrder[0],
		);
	});

	it("permanent removal still cleans the app side when the file is already gone", async () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		mockUnlink.mockRejectedValue(new Error("ENOENT"));
		mockOrchestratorRemove.mockResolvedValue(undefined);
		const photo = media("p3");

		await expect(
			removeMedia(photo, { permanent: true }),
		).resolves.toBeUndefined();

		expect(mockOrchestratorRemove).toHaveBeenCalledWith(photo);
		expect(warn).toHaveBeenCalled();
	});
});

describe("ensureSearchIndex — idempotent load-or-rebuild", () => {
	// Fresh facade module per test: ensureSearchIndex caches its promise in
	// module state, so each test re-imports an isolated instance.
	beforeEach(() => {
		jest.resetModules();
	});

	// require (not import()) — jest's VM has no dynamic-import callback, and
	// require re-evaluates the module after resetModules() all the same.
	const freshFacade = () => require("../facade") as typeof import("../facade");

	it("loads once for repeat and concurrent callers", async () => {
		mockLoadIndex.mockResolvedValue(true);
		mockSemanticLoadIndex.mockResolvedValue(true);
		const facade = freshFacade();

		const first = facade.ensureSearchIndex();
		const second = facade.ensureSearchIndex();
		expect(second).toBe(first); // same in-flight promise, no duplicate work
		await Promise.all([first, second]);
		await facade.ensureSearchIndex(); // after resolution it stays cached

		expect(mockLoadIndex).toHaveBeenCalledTimes(1);
		expect(mockBuildIndex).not.toHaveBeenCalled();
	});

	it("rebuilds the index when no persisted index exists", async () => {
		mockLoadIndex.mockResolvedValue(false);
		mockBuildIndex.mockResolvedValue(undefined);
		mockSemanticLoadIndex.mockResolvedValue(true);
		const facade = freshFacade();

		await facade.ensureSearchIndex();

		expect(mockBuildIndex).toHaveBeenCalledTimes(1);
	});

	it("does not cache a failure — the next call retries", async () => {
		mockLoadIndex
			.mockRejectedValueOnce(new Error("index io error"))
			.mockResolvedValue(true);
		mockSemanticLoadIndex.mockResolvedValue(true);
		const facade = freshFacade();

		await expect(facade.ensureSearchIndex()).rejects.toThrow("index io error");
		await expect(facade.ensureSearchIndex()).resolves.toBeUndefined();

		expect(mockLoadIndex).toHaveBeenCalledTimes(2);
	});

	it("a semantic index failure never blocks lexical readiness", async () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
		mockLoadIndex.mockResolvedValue(true);
		mockSemanticLoadIndex.mockRejectedValue(new Error("model missing"));
		const facade = freshFacade();

		await expect(facade.ensureSearchIndex()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});
});
