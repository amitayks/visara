import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { MediaFile } from "@models/MediaFile";
import { useSearchStore } from "@state/searchStore";
import {
	SEARCH_DEBOUNCE_MS,
	type SearchControllerDeps,
	startSearchController,
} from "../searchController";

// The controller's default deps import the facade, which drags the whole
// services graph (RNFS, WatermelonDB, orchestrator) into the test env —
// neutered here; every test injects its own deps or facade fns anyway.
jest.mock("@services/facade", () => ({
	ensureSearchIndex: jest.fn(async () => {}),
	searchMedia: jest.fn(async () => []),
}));

const media = (id: string) => ({ id }) as unknown as MediaFile;

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Flush the microtask chain inside a fake-timers test. */
async function flushMicrotasks(rounds = 6): Promise<void> {
	for (let i = 0; i < rounds; i += 1) {
		await Promise.resolve();
	}
}

function createHarness(overrides: Partial<SearchControllerDeps> = {}) {
	let listener: ((query: string) => void) | null = null;
	const unsubscribe = jest.fn(() => {
		listener = null;
	});
	let nextRequestId = 0;
	const deps = {
		subscribeToQuery: jest.fn((onChange: (query: string) => void) => {
			listener = onChange;
			return unsubscribe;
		}),
		ensureSearchIndex: jest.fn(async () => {}),
		searchMedia: jest.fn(async (_query: string): Promise<MediaFile[]> => []),
		beginRequest: jest.fn(() => {
			nextRequestId += 1;
			return nextRequestId;
		}),
		completeRequest: jest.fn<SearchControllerDeps["completeRequest"]>(),
		failRequest: jest.fn<SearchControllerDeps["failRequest"]>(),
		clearResults: jest.fn<SearchControllerDeps["clearResults"]>(),
		debounceMs: SEARCH_DEBOUNCE_MS,
	};
	const stop = startSearchController({ ...deps, ...overrides });
	return {
		deps,
		stop,
		/** Emit a query change as the store subscription would. */
		type: (query: string) => listener?.(query),
		unsubscribe,
	};
}

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

describe("searchController debounce (search-experience spec)", () => {
	it("collapses rapid typing into ONE facade search for the final text", async () => {
		const { deps, type, stop } = createHarness();

		const keystrokes = ["s", "su", "sun", "suns", "sunse", "sunset"];
		for (const text of keystrokes) {
			type(text);
			await jest.advanceTimersByTimeAsync(100); // inside the 250ms window
		}
		expect(deps.searchMedia).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(deps.searchMedia).toHaveBeenCalledTimes(1);
		expect(deps.searchMedia).toHaveBeenCalledWith("sunset");
		stop();
	});

	it("does not dispatch before the debounce window elapses", async () => {
		const { deps, type, stop } = createHarness();

		type("cats");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
		expect(deps.searchMedia).not.toHaveBeenCalled();

		await jest.advanceTimersByTimeAsync(1);
		expect(deps.searchMedia).toHaveBeenCalledTimes(1);
		stop();
	});

	it("empty query cancels pending work and clears results with NO facade call", async () => {
		const { deps, type, stop } = createHarness();

		type("sun");
		await jest.advanceTimersByTimeAsync(100);
		type(""); // cleared inside the debounce window

		expect(deps.clearResults).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(10_000);
		expect(deps.searchMedia).not.toHaveBeenCalled();
		expect(deps.ensureSearchIndex).not.toHaveBeenCalled();
		expect(deps.beginRequest).not.toHaveBeenCalled();
		stop();
	});

	it("treats whitespace-only input as an empty query", async () => {
		const { deps, type, stop } = createHarness();

		type("   ");
		expect(deps.clearResults).toHaveBeenCalledTimes(1);
		await jest.advanceTimersByTimeAsync(10_000);
		expect(deps.searchMedia).not.toHaveBeenCalled();
		stop();
	});
});

describe("searchController index lifecycle + request routing", () => {
	it("ensures the search index before searching, on every dispatch (facade dedupes)", async () => {
		const { deps, type, stop } = createHarness();

		type("beach");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();
		type("beach dog");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();

		expect(deps.ensureSearchIndex).toHaveBeenCalledTimes(2);
		const firstEnsure = deps.ensureSearchIndex.mock.invocationCallOrder[0];
		const firstSearch = deps.searchMedia.mock.invocationCallOrder[0];
		expect(firstEnsure).toBeLessThan(firstSearch);
		stop();
	});

	it("routes success through begin/complete with a matching request id", async () => {
		const results = [media("a"), media("b")];
		const { deps, type, stop } = createHarness({
			searchMedia: async () => results,
		});
		deps.beginRequest.mockReturnValue(7);

		type("dogs");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();

		expect(deps.completeRequest).toHaveBeenCalledTimes(1);
		expect(deps.completeRequest).toHaveBeenCalledWith(7, results);
		expect(deps.failRequest).not.toHaveBeenCalled();
		stop();
	});

	it("routes failure through failRequest with the same id (no unhandled rejection)", async () => {
		const { deps, type, stop } = createHarness({
			searchMedia: async () => {
				throw new Error("index exploded");
			},
		});
		deps.beginRequest.mockReturnValue(3);

		type("dogs");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();

		expect(deps.failRequest).toHaveBeenCalledTimes(1);
		expect(deps.failRequest).toHaveBeenCalledWith(3);
		expect(deps.completeRequest).not.toHaveBeenCalled();
		stop();
	});

	it("still searches when ensureSearchIndex fails (degraded lexical path)", async () => {
		const { deps, type, stop } = createHarness({
			ensureSearchIndex: async () => {
				throw new Error("no semantic index");
			},
		});

		type("receipt");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();

		expect(deps.searchMedia).toHaveBeenCalledWith("receipt");
		expect(deps.completeRequest).toHaveBeenCalledTimes(1);
		stop();
	});

	it("drops an in-flight response once a newer query is scheduled", async () => {
		const cats = deferred<MediaFile[]>();
		const dogs = deferred<MediaFile[]>();
		const responses = [cats, dogs];
		const { deps, type, stop } = createHarness({
			searchMedia: (_query: string) => (responses.shift() ?? dogs).promise,
		});

		type("cats");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); // dispatch #1 in flight
		type("dogs");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); // dispatch #2 in flight

		dogs.resolve([media("dog")]);
		await flushMicrotasks();
		cats.resolve([media("stale-cat")]); // older response arrives LAST
		await flushMicrotasks();

		expect(deps.completeRequest).toHaveBeenCalledTimes(1);
		expect(deps.completeRequest).toHaveBeenCalledWith(2, [
			expect.objectContaining({ id: "dog" }),
		]);
		stop();
	});

	it("teardown unsubscribes, cancels pending dispatch, and drops in-flight responses", async () => {
		const slow = deferred<MediaFile[]>();
		const searchMedia = jest.fn(() => slow.promise);
		const { deps, type, stop, unsubscribe } = createHarness({ searchMedia });

		type("cats");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS); // in flight
		type("dogs"); // pending debounce

		stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);

		slow.resolve([media("late")]);
		await flushMicrotasks();
		await jest.advanceTimersByTimeAsync(10_000);

		expect(searchMedia).toHaveBeenCalledTimes(1); // "dogs" never fired
		expect(deps.completeRequest).not.toHaveBeenCalled();
		stop(); // idempotent
	});
});

describe("searchController against the real searchStore", () => {
	const storeDeps = () => ({
		subscribeToQuery: (onChange: (query: string) => void) =>
			useSearchStore.subscribe((state) => state.query, onChange),
		beginRequest: () => useSearchStore.getState().beginRequest(),
		completeRequest: (requestId: number, results: MediaFile[]) =>
			useSearchStore.getState().completeRequest(requestId, results),
		failRequest: (requestId: number) =>
			useSearchStore.getState().failRequest(requestId),
		clearResults: () => useSearchStore.getState().clear(),
	});

	beforeEach(() => {
		useSearchStore.getState().clear();
	});

	it("typing lands results and status in the store", async () => {
		const stop = startSearchController({
			...storeDeps(),
			ensureSearchIndex: async () => {},
			searchMedia: async () => [media("beach-1")],
		});

		useSearchStore.getState().setQuery("beach");
		expect(useSearchStore.getState().status).toBe("idle"); // still debouncing
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();

		const state = useSearchStore.getState();
		expect(state.status).toBe("done");
		expect(state.results.map((m) => m.id)).toEqual(["beach-1"]);
		stop();
	});

	it("clear-then-retype never applies stale results despite the store id reset", async () => {
		// Regression for the id-collision hole: clear() resets latestRequestId,
		// so the pre-clear request and the post-clear request BOTH get id 1 —
		// only the controller's own supersession guard keeps "cats" out.
		const cats = deferred<MediaFile[]>();
		const stop = startSearchController({
			...storeDeps(),
			ensureSearchIndex: async () => {},
			searchMedia: (query: string) =>
				query === "cats" ? cats.promise : Promise.resolve([media("dog")]),
		});

		useSearchStore.getState().setQuery("cats");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks(); // "cats" in flight holding store request id 1

		useSearchStore.getState().setQuery(""); // user clears — store ids reset
		useSearchStore.getState().setQuery("dogs");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks(); // "dogs" completed under the SAME store id 1

		expect(useSearchStore.getState().results.map((m) => m.id)).toEqual(["dog"]);

		cats.resolve([media("stale-cat")]); // late arrival with a matching id
		await flushMicrotasks();

		expect(useSearchStore.getState().results.map((m) => m.id)).toEqual(["dog"]);
		expect(useSearchStore.getState().status).toBe("done");
		stop();
	});

	it("emptying the query clears results and returns the store to idle", async () => {
		const stop = startSearchController({
			...storeDeps(),
			ensureSearchIndex: async () => {},
			searchMedia: async () => [media("x")],
		});

		useSearchStore.getState().setQuery("x");
		await jest.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		await flushMicrotasks();
		expect(useSearchStore.getState().results).toHaveLength(1);

		useSearchStore.getState().setQuery("");
		expect(useSearchStore.getState()).toMatchObject({
			query: "",
			status: "idle",
			results: [],
		});
		stop();
	});
});
