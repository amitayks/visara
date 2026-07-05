import { invalidationBus } from "@backend/db/invalidation";
import type { MediaRow } from "@backend/types";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { useVisibleMedia } from "../useVisibleMedia";

/**
 * useVisibleMedia behavior (sqlite-storage-core spec, v2 feed): first query
 * renders immediately; invalidation-bus bursts coalesce behind the bus's
 * 250 ms trailing throttle; unchanged rows keep object identity through the
 * RowCache; unmount stops watching.
 *
 * The repo is mocked (no op-sqlite under jest); the REAL invalidation bus
 * drives re-queries via fake timers.
 */

let mockVisibleRows: () => Promise<MediaRow[]> = async () => [];

jest.mock("@backend/repo/MediaRepo", () => ({
	MediaRepo: class {
		visibleRows(): Promise<MediaRow[]> {
			return mockVisibleRows();
		}
	},
}));

function row(id: string, filename = `${id}.jpg`): MediaRow {
	return {
		id,
		uri: `content://media/${id}`,
		thumbnailUri: null,
		filename,
		mimeType: "image/jpeg",
		creationDate: 1000,
		isHidden: false,
		isProcessed: false,
		width: 100,
		height: 100,
		fileSize: 1234,
		kind: "image",
		enrichStatus: "pending",
	};
}

/** Flush pending microtasks inside fake-timer tests. */
async function flushMicrotasks(rounds = 6): Promise<void> {
	for (let i = 0; i < rounds; i += 1) {
		await Promise.resolve();
	}
}

describe("useVisibleMedia — v2 backend feed", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockVisibleRows = async () => [];
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	it("starts empty/not-ready and renders the first query immediately", async () => {
		mockVisibleRows = async () => [row("a"), row("b")];
		const { result } = await renderHook(() => useVisibleMedia());

		// RNTL's async renderHook already flushes the immediate first query —
		// by contract the first emission is unthrottled, so ready is true here.
		await act(async () => {
			await flushMicrotasks();
		});

		expect(result.current.ready).toBe(true);
		expect(result.current.media.map((m) => m.id)).toEqual(["a", "b"]);
	});

	it("coalesces an invalidation burst into one trailing re-query", async () => {
		let queries = 0;
		mockVisibleRows = async () => {
			queries += 1;
			return queries === 1 ? [row("a")] : [row("a"), row("b")];
		};
		const { result } = await renderHook(() => useVisibleMedia());
		await act(async () => {
			await flushMicrotasks();
		});
		expect(queries).toBe(1);

		// A burst of commits within one throttle window...
		await act(async () => {
			invalidationBus.notify("media");
			invalidationBus.notify("enrichment");
			invalidationBus.notify("media");
			await flushMicrotasks();
		});
		// ...does not re-query inside the window.
		expect(queries).toBe(1);
		expect(result.current.media.map((m) => m.id)).toEqual(["a"]);

		await act(async () => {
			jest.advanceTimersByTime(250);
			await flushMicrotasks();
		});
		expect(queries).toBe(2);
		expect(result.current.media.map((m) => m.id)).toEqual(["a", "b"]);
	});

	it("keeps object identity for unchanged rows across emissions", async () => {
		mockVisibleRows = async () => [row("a"), row("b")];
		const { result } = await renderHook(() => useVisibleMedia());
		await act(async () => {
			await flushMicrotasks();
		});
		const firstA = result.current.media[0];

		// Second emission: fresh objects, same values for a; b changes status.
		mockVisibleRows = async () => [
			row("a"),
			{ ...row("b"), enrichStatus: "done", isProcessed: true },
		];
		await act(async () => {
			invalidationBus.notify("media");
			jest.advanceTimersByTime(250);
			await flushMicrotasks();
		});

		expect(result.current.media[0]).toBe(firstA); // RowCache identity
		expect(result.current.media[1]?.isProcessed).toBe(true);
	});

	it("stops re-querying after unmount", async () => {
		let queries = 0;
		mockVisibleRows = async () => {
			queries += 1;
			return [row("a")];
		};
		const { unmount } = await renderHook(() => useVisibleMedia());
		await act(async () => {
			await flushMicrotasks();
		});
		expect(queries).toBe(1);

		await unmount();
		await act(async () => {
			invalidationBus.notify("media");
			jest.advanceTimersByTime(1000);
			await flushMicrotasks();
		});
		expect(queries).toBe(1);
	});
});
