import type {
	PipelineEvent as OrchestratorEvent,
	PipelineSnapshot as OrchestratorSnapshot,
} from "@backend/types";
import { makeMutable, type SharedValue } from "react-native-reanimated";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

export interface ProcessingState {
	isProcessing: boolean;
	isPaused: boolean;
	processed: number;
	total: number;
	failedCount: number;
	currentFileName: string | null;
}

interface ProcessingStore extends ProcessingState {
	seed: (snapshot: OrchestratorSnapshot) => void;
	applyEvent: (event: OrchestratorEvent) => void;
}

/** Pure event fold (orchestrator-gallery-bridge spec: exact event map). */
export function reduceEvent(
	state: ProcessingState,
	event: OrchestratorEvent,
): ProcessingState {
	switch (event.type) {
		case "started":
			return { ...state, isProcessing: true, isPaused: false };
		case "scan-progress":
			return { ...state, processed: event.discovered, total: event.total };
		case "progress":
			return {
				...state,
				processed: event.processed,
				total: event.total,
				failedCount: event.failed,
				currentFileName: event.currentFileName ?? state.currentFileName,
			};
		case "item-failed":
			return { ...state, failedCount: state.failedCount + 1 };
		case "paused":
			return { ...state, isPaused: true };
		case "resumed":
			return { ...state, isPaused: false };
		case "completed":
			return {
				...state,
				isProcessing: false,
				isPaused: false,
				currentFileName: null,
			};
		default:
			return state;
	}
}

export const useProcessingStore = create<ProcessingStore>()(
	subscribeWithSelector((set) => ({
		isProcessing: false,
		isPaused: false,
		processed: 0,
		total: 0,
		failedCount: 0,
		currentFileName: null,

		seed: (s) =>
			set({
				isProcessing: s.isRunning,
				isPaused: s.isPaused,
				processed: s.processed,
				total: s.total,
				failedCount: s.failed,
			}),
		applyEvent: (event) => set((s) => reduceEvent(s, event)),
	})),
);

/**
 * Zero-re-render progress path (ui-state-management spec): the drain's
 * per-item progress events update this SharedValue via the vanilla-store
 * subscription; progress UI reads it on the UI thread. Guarded ratio — never
 * NaN when total is 0.
 */
export const processingProgress: SharedValue<number> = makeMutable(0);

useProcessingStore.subscribe(
	(s) => (s.total > 0 ? Math.min(1, s.processed / s.total) : 0),
	(ratio) => {
		processingProgress.value = ratio;
	},
);
