import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { MediaFile } from "@models/MediaFile";
import { act, renderHook } from "@testing-library/react-native";
import { useVisibleMedia } from "../useVisibleMedia";

/**
 * useVisibleMedia behavior (ui-state-management spec): one screen-level
 * subscription to observeVisible() — first emission immediate, later bursts
 * coalesced to one trailing update per 250ms window, torn down on unmount.
 *
 * RNTL v14's renderHook/act/unmount are async and must be awaited.
 */

type Subscriber = (files: MediaFile[]) => void;

/** Minimal subject standing in for observeVisible()'s observable. */
class MockSubject {
	private readonly observers = new Set<Subscriber>();
	unsubscribeCount = 0;

	readonly subscribe = (observer: Subscriber) => {
		this.observers.add(observer);
		return {
			unsubscribe: () => {
				if (this.observers.delete(observer)) this.unsubscribeCount += 1;
			},
		};
	};

	emit(files: MediaFile[]): void {
		for (const observer of [...this.observers]) observer(files);
	}

	get observerCount(): number {
		return this.observers.size;
	}
}

let mockSubject = new MockSubject();

jest.mock("@services/database/MediaFileRepository", () => ({
	MediaFileRepository: { observeVisible: () => mockSubject },
}));

const file = (id: string): MediaFile => ({ id }) as unknown as MediaFile;

describe("useVisibleMedia — throttled observeVisible subscription", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockSubject = new MockSubject();
	});

	afterEach(() => {
		jest.restoreAllMocks(); // release the setTimeout/clearTimeout spies first
		jest.useRealTimers();
	});

	it("starts empty/not-ready and renders the FIRST emission immediately", async () => {
		const { result } = await renderHook(() => useVisibleMedia());

		expect(result.current.media).toEqual([]);
		expect(result.current.ready).toBe(false);
		expect(mockSubject.observerCount).toBe(1); // exactly one subscription

		const first = [file("a"), file("b")];
		await act(() => {
			mockSubject.emit(first);
		});

		// No timer advance was needed — launch is not throttled, and the state
		// holds the reference-stable array the subject emitted.
		expect(result.current.media).toBe(first);
		expect(result.current.ready).toBe(true);
	});

	it("coalesces an emission burst into ≤1 update per 250ms window", async () => {
		let renders = 0;
		const { result } = await renderHook(() => {
			renders += 1;
			return useVisibleMedia();
		});

		await act(() => {
			mockSubject.emit([file("a")]);
		});
		const rendersAfterFirst = renders;

		const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
		const burstFinal = [file("a"), file("b"), file("c")];
		await act(() => {
			mockSubject.emit([file("a"), file("b")]);
			mockSubject.emit(burstFinal);
		});

		// The whole burst sits behind ONE trailing flush — nothing rendered yet.
		const throttleTimers = setTimeoutSpy.mock.calls.filter(
			(call) => call[1] === 250,
		);
		expect(throttleTimers).toHaveLength(1);
		expect(renders).toBe(rendersAfterFirst);
		expect(result.current.media.map((m) => m.id)).toEqual(["a"]);

		await act(() => {
			jest.advanceTimersByTime(249);
		});
		expect(renders).toBe(rendersAfterFirst); // still inside the window

		await act(() => {
			jest.advanceTimersByTime(1);
		});
		expect(result.current.media).toBe(burstFinal); // latest snapshot wins
		expect(renders).toBe(rendersAfterFirst + 1); // ONE update for the burst
	});

	it("throttles emissions after idle windows too — only the first is immediate", async () => {
		const { result } = await renderHook(() => useVisibleMedia());

		await act(() => {
			mockSubject.emit([file("a")]);
		});
		await act(() => {
			jest.advanceTimersByTime(1000); // idle time passes, nothing pending
		});

		const update = [file("a"), file("z")];
		await act(() => {
			mockSubject.emit(update);
		});
		expect(result.current.media.map((m) => m.id)).toEqual(["a"]); // deferred

		await act(() => {
			jest.advanceTimersByTime(250);
		});
		expect(result.current.media).toBe(update);
	});

	it("unsubscribes and drops any pending flush on unmount", async () => {
		const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
		const { result, unmount } = await renderHook(() => useVisibleMedia());

		await act(() => {
			mockSubject.emit([file("a")]);
		});
		await act(() => {
			mockSubject.emit([file("a"), file("b")]); // pending behind the throttle
		});

		// Pin down the hook's own 250ms flush timer handle.
		const throttleIndex = setTimeoutSpy.mock.calls.findIndex(
			(call) => call[1] === 250,
		);
		expect(throttleIndex).toBeGreaterThanOrEqual(0);
		const throttleHandle = setTimeoutSpy.mock.results[throttleIndex].value;

		await unmount();

		expect(mockSubject.observerCount).toBe(0);
		expect(mockSubject.unsubscribeCount).toBe(1);
		// The pending flush was cleared — no setState-after-unmount left armed.
		expect(
			clearTimeoutSpy.mock.calls.some((call) => call[0] === throttleHandle),
		).toBe(true);
		expect(result.current.media.map((m) => m.id)).toEqual(["a"]);

		// And advancing time past the window changes nothing.
		await act(() => {
			jest.advanceTimersByTime(1000);
		});
		expect(result.current.media.map((m) => m.id)).toEqual(["a"]);
	});
});
