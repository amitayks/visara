import type { PauseReason, PipelineSettings } from "@backend/types";

/**
 * Admission gates for the enrichment drain (processing-pipeline spec, design
 * D9/D10). `evaluateGates` is a PURE function over a snapshot of inputs — the
 * Pipeline collects the snapshot (cached thermal level, battery read, clock,
 * app state) and re-evaluates it between items, so gate changes (thermal
 * events, charge state, settings) take effect at the next between-item check
 * without restarting the drain.
 *
 * The RAM capability floor is deliberately NOT part of `evaluateGates`: a
 * low-RAM device is not "paused" — per spec it marks pending items `skipped`
 * and reports idle-complete. The Pipeline calls {@link canRunVlm} separately
 * and takes the skip-all path when it returns false.
 */

export interface GateInputs {
	/** This session's discovery-complete has fired (library-discovery-first). */
	discoveryComplete: boolean;
	/** `GemmaModelDeliveryService.isReady()`: enabled + all artifacts verified. */
	deliveryReady: boolean;
	/**
	 * `DeviceInfo.getTotalMemory()` bytes. Consumed by {@link canRunVlm}, not
	 * by {@link evaluateGates} (capability is skip-all, never a pause).
	 */
	totalMemBytes: number;
	/**
	 * Normalized thermal level 0..3, cached from ThermalObserver events by the
	 * caller; fail-open 0 when the module is absent or a read errors.
	 */
	thermalLevel: number;
	/** Battery fraction 0..1; fail-open 1 when the read errors. */
	batteryLevel: number;
	charging: boolean;
	settings: PipelineSettings;
	manualPause: boolean;
	/** Local hour 0..23, for the night-processing window. */
	hourOfDay: number;
	/**
	 * Whether the app is foregrounded — OR the host is background-capable
	 * (Android with the keep-alive FGS acquired passes `true`: the drain
	 * keeps running in the background by design).
	 */
	appActive: boolean;
}

export interface GateVerdict {
	admit: boolean;
	/** Set when `admit` is false — the reason surfaced with the paused event. */
	reason?: PauseReason;
}

/** VLM capability floor (design D10): total RAM >= 5.5 GB. */
export const VLM_MIN_TOTAL_MEM_BYTES = 5.5 * 1024 * 1024 * 1024;

/** Drain pauses at thermal `serious` (2) and above (D9). */
export const THERMAL_BLOCK_LEVEL = 2;

/** On battery (not charging), level must be strictly above 20%. */
export const BATTERY_MIN_LEVEL = 0.2;

/** Night-processing window: [00:00, 06:00) local. */
export const NIGHT_WINDOW_START_HOUR = 0;
export const NIGHT_WINDOW_END_HOUR = 6;

/**
 * RAM capability check (D10). Below the floor the pipeline never loads the
 * VLM: pending items are marked `skipped` and the pipeline reports
 * idle-complete (settings copy explains) — this is NOT a pause reason.
 */
export function canRunVlm(totalMemBytes: number): boolean {
	return totalMemBytes >= VLM_MIN_TOTAL_MEM_BYTES;
}

/** Whether `hourOfDay` falls inside the night-processing window. */
export function isInNightWindow(hourOfDay: number): boolean {
	return (
		hourOfDay >= NIGHT_WINDOW_START_HOUR && hourOfDay < NIGHT_WINDOW_END_HOUR
	);
}

/**
 * The admission matrix, evaluated between items (processing-pipeline spec):
 *
 *  1. manual pause/stop           → `manual` (user intent outranks the rest)
 *  2. discovery-complete gate     → `discovery-pending`
 *  3. delivery ready              → `model-not-ready`
 *  4. app active (iOS only input) → `backgrounded`
 *  5. thermal < serious (2)       → `thermal`
 *  6. charging OR battery > 20%   → `battery`
 *  7. saver on requires charging  → `battery-saver`
 *  8. night on: only 00:00–06:00  → `night-window`
 */
export function evaluateGates(inputs: GateInputs): GateVerdict {
	if (inputs.manualPause) {
		return { admit: false, reason: "manual" };
	}
	if (!inputs.discoveryComplete) {
		return { admit: false, reason: "discovery-pending" };
	}
	if (!inputs.deliveryReady) {
		return { admit: false, reason: "model-not-ready" };
	}
	if (!inputs.appActive) {
		return { admit: false, reason: "backgrounded" };
	}
	if (inputs.thermalLevel >= THERMAL_BLOCK_LEVEL) {
		return { admit: false, reason: "thermal" };
	}
	if (!inputs.charging && inputs.batteryLevel <= BATTERY_MIN_LEVEL) {
		return { admit: false, reason: "battery" };
	}
	if (inputs.settings.batterySaverEnabled && !inputs.charging) {
		return { admit: false, reason: "battery-saver" };
	}
	if (
		inputs.settings.nightProcessingEnabled &&
		!isInNightWindow(inputs.hourOfDay)
	) {
		return { admit: false, reason: "night-window" };
	}
	return { admit: true };
}
