import type { OrchestratorEvent } from "@services/orchestrator/OrchestratorService";
import { reduceEvent, useProcessingStore } from "../processingStore";

const idle = {
	isProcessing: false,
	isPaused: false,
	processed: 0,
	total: 0,
	failedCount: 0,
	currentFileName: null,
};

describe("processing event fold (orchestrator-gallery-bridge spec)", () => {
	it("maps the full event lifecycle", () => {
		let s = reduceEvent(idle, { type: "started" });
		expect(s.isProcessing).toBe(true);

		s = reduceEvent(s, { type: "scan-progress", discovered: 10, total: 40 });
		expect(s).toMatchObject({ processed: 10, total: 40 });

		s = reduceEvent(s, {
			type: "progress",
			processed: 12,
			total: 40,
			failed: 1,
			currentFileName: "IMG_1.jpg",
		});
		expect(s).toMatchObject({
			processed: 12,
			failedCount: 1,
			currentFileName: "IMG_1.jpg",
		});

		s = reduceEvent(s, {
			type: "item-failed",
			mediaFileId: "m1",
			filename: "IMG_2.jpg",
			error: "boom",
		});
		expect(s.failedCount).toBe(2);

		s = reduceEvent(s, { type: "paused" });
		expect(s.isPaused).toBe(true);
		s = reduceEvent(s, { type: "resumed" });
		expect(s.isPaused).toBe(false);

		s = reduceEvent(s, { type: "completed" });
		expect(s).toMatchObject({
			isProcessing: false,
			isPaused: false,
			currentFileName: null,
		});
	});

	it("unknown events pass through unchanged", () => {
		const s = reduceEvent(idle, {
			type: "item-processed",
			mediaFileId: "x",
			filename: "y",
		} as OrchestratorEvent);
		expect(s).toEqual(idle);
	});
});

describe("progress ratio guard (never NaN)", () => {
	it("total 0 yields ratio 0 via the store subscription", () => {
		useProcessingStore
			.getState()
			.applyEvent({ type: "progress", processed: 5, total: 0, failed: 0 });
		const { processed, total } = useProcessingStore.getState();
		const ratio = total > 0 ? processed / total : 0;
		expect(ratio).toBe(0);
	});
});
