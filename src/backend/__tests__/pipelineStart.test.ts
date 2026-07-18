import {
	Pipeline,
	type PipelineDeps,
	type PlatformRunner,
} from "@backend/pipeline/Pipeline";
import type { PipelineEvent } from "@backend/types";
import { afterAll, describe, expect, jest, test } from "@jest/globals";

/**
 * Pipeline.start() admission behavior (drain-host rework):
 *  - nothing pending → fully silent no-op (no host, no events);
 *  - pending work but model not ready → explicit `model-not-ready` paused
 *    state WITHOUT spinning up the platform host (the deferral UX fix);
 *  - admissible → host runs the loop, waiting state cleared, completed.
 *
 * Pipeline is all-static; the tests below run in declaration order and are
 * written to flow through that shared state on purpose.
 */

function makeRunner(
	// Background-capable (Android + acquired FGS) keeps the admission check
	// independent of the jest environment's AppState value.
	backgroundCapable = true,
): { runner: PlatformRunner; calls: string[] } {
	const calls: string[] = [];
	const runner: PlatformRunner = {
		run: async (loop) => {
			calls.push("run");
			await loop();
		},
		stop: async () => {
			calls.push("stop");
		},
		updateProgress: async () => {},
		notifyPaused: async () => {},
		notifyResumed: async () => {},
		shouldContinue: () => true,
		backgroundCapable: () => backgroundCapable,
	};
	return { runner, calls };
}

function makeDeps(opts: {
	pending: number;
	deliveryReady: boolean;
	runner: PlatformRunner;
}): PipelineDeps {
	// nextPending drains the fake queue so the loop's end-of-drain pending
	// re-check terminates instead of spinning forever.
	let pending = opts.pending;
	const mediaRepo = {
		pendingCount: jest.fn(async () => pending),
		resetStaleProcessing: jest.fn(async () => {}),
		nextPending: jest.fn(async () => {
			pending = 0;
			return null;
		}),
		doneCount: jest.fn(async () => 0),
		failedCount: jest.fn(async () => 0),
		markProcessing: jest.fn(async () => {}),
		markFailed: jest.fn(async () => {}),
		markSkipped: jest.fn(async () => {}),
		byId: jest.fn(async () => null),
		sweepForReprocess: jest.fn(async () => {}),
	};
	return {
		mediaRepo: mediaRepo as unknown as PipelineDeps["mediaRepo"],
		enrichmentRepo: {
			saveResult: jest.fn(async () => {}),
			embeddingTextFor: jest.fn(async () => null),
		} as unknown as PipelineDeps["enrichmentRepo"],
		vectorRepo: {
			missingOrStale: jest.fn(async () => []),
			upsert: jest.fn(async () => {}),
		} as unknown as PipelineDeps["vectorRepo"],
		vision: () => {
			throw new Error("vision engine must not be constructed");
		},
		embed: () => {
			throw new Error("embed engine must not be constructed");
		},
		delivery: {
			isReady: () => opts.deliveryReady,
			subscribe: () => () => {},
		},
		librarySync: {
			isDiscoveryComplete: () => true,
			subscribe: () => () => {},
		},
		imagePrep: {
			toInferenceJpeg: async () => null,
			cleanupInferenceTemp: async () => {},
		},
		thermal: { read: async () => 0, subscribe: () => () => {} },
		readPower: async () => ({ batteryLevel: 1, charging: true }),
		readTotalMemBytes: async () => 8 * 1024 * 1024 * 1024,
		runner: opts.runner,
		now: () => new Date(2026, 0, 1, 12, 0, 0),
	};
}

function flush(ms = 25): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Pipeline.start() admission", () => {
	afterAll(async () => {
		// Break any still-parked drain loop so no gate-poll timer outlives the
		// suite (jest would otherwise hang on open handles).
		await Pipeline.stop();
		await flush(50);
	});

	test("nothing pending: silent no-op even when the model is missing", async () => {
		const { runner, calls } = makeRunner();
		Pipeline.configure(makeDeps({ pending: 0, deliveryReady: false, runner }));
		const events: PipelineEvent[] = [];
		const unsub = Pipeline.subscribe((e) => events.push(e));

		await Pipeline.start();
		await flush();

		expect(events).toEqual([]);
		expect(calls).toEqual([]);
		expect(Pipeline.getSnapshot().isRunning).toBe(false);
		expect(Pipeline.getPauseReason()).toBeNull();
		unsub();
	});

	test("pending work, model not ready: explicit model-not-ready pause, no host", async () => {
		const { runner, calls } = makeRunner();
		Pipeline.configure(makeDeps({ pending: 3, deliveryReady: false, runner }));
		const events: PipelineEvent[] = [];
		const unsub = Pipeline.subscribe((e) => events.push(e));

		await Pipeline.start();
		// A repeated start() must not duplicate the paused event.
		await Pipeline.start();
		await flush();

		expect(events).toEqual([{ type: "paused" }]);
		expect(calls).toEqual([]);
		expect(Pipeline.getSnapshot().isRunning).toBe(false);
		expect(Pipeline.getSnapshot().isPaused).toBe(true);
		expect(Pipeline.getPauseReason()).toBe("model-not-ready");
		unsub();
	});

	test("concurrent start() calls spin up exactly one host (reentry race)", async () => {
		const { runner, calls } = makeRunner();
		Pipeline.configure(makeDeps({ pending: 2, deliveryReady: true, runner }));
		const events: PipelineEvent[] = [];
		const unsub = Pipeline.subscribe((e) => events.push(e));

		// Boot-time reality: bootstrap + delivery-ready + discovery-complete
		// all invoke start() near-simultaneously, overlapping in the async
		// admission checks. Only one host/loop may result.
		await Promise.all([Pipeline.start(), Pipeline.start(), Pipeline.start()]);
		await flush();

		expect(calls.filter((c) => c === "run")).toHaveLength(1);
		expect(events.filter((e) => e.type === "started")).toHaveLength(1);
		unsub();
	});

	test("admissible: host runs the drain and the waiting state clears", async () => {
		const { runner, calls } = makeRunner();
		Pipeline.configure(makeDeps({ pending: 1, deliveryReady: true, runner }));
		const events: PipelineEvent[] = [];
		const unsub = Pipeline.subscribe((e) => events.push(e));

		await Pipeline.start();
		await flush();

		expect(events.map((e) => e.type)).toEqual(["started", "completed"]);
		expect(calls).toEqual(["run", "stop"]);
		expect(Pipeline.getSnapshot().isRunning).toBe(false);
		expect(Pipeline.getSnapshot().isPaused).toBe(false);
		expect(Pipeline.getPauseReason()).toBeNull();
		unsub();
	});
});
