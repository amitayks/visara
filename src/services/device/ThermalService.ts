/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import ThermalObserverModule, {
	type Spec as ThermalSpec,
	type ThermalStatePayload,
} from "@native-modules/NativeThermalObserver";
import {
	type EmitterSubscription,
	NativeEventEmitter,
	Platform,
} from "react-native";

/** Normalized thermal pressure, shared across platforms (D4). */
export type ThermalLevel = 0 | 1 | 2 | 3;

export type ThermalLevelName = "nominal" | "fair" | "serious" | "critical";

/** Human-readable name for each normalized level (D4 table). */
export const THERMAL_LEVEL_NAMES: Record<ThermalLevel, ThermalLevelName> = {
	0: "nominal",
	1: "fair",
	2: "serious",
	3: "critical",
};

/** Event name emitted by the native `ThermalObserver` module. */
const THERMAL_EVENT = "thermal_state_change";

/**
 * The drain (any tier, Tier-0 today) pauses once the device is genuinely
 * throttling — `serious` (D5).
 */
export const DRAIN_PAUSE_LEVEL: ThermalLevel = 2;

/**
 * Tier-1 backs off earlier — at `fair` (D5) — because it is both the heaviest
 * consumer and a primary heat source, so it must yield before the light Tier-0
 * pass does.
 */
export const TIER1_PAUSE_LEVEL: ThermalLevel = 1;

/**
 * iOS `ProcessInfo.ThermalState` ordinal (0..3) → normalized level. Identity,
 * but kept explicit as the canonical D4 table.
 */
const IOS_RAW_TO_LEVEL: readonly ThermalLevel[] = [0, 1, 2, 3];

/**
 * Android `PowerManager` thermal status ordinal (0..6) → normalized level:
 * NONE/LIGHT/MODERATE/SEVERE/CRITICAL/EMERGENCY/SHUTDOWN → 0/1/2/2/3/3/3 (D4).
 */
const ANDROID_RAW_TO_LEVEL: readonly ThermalLevel[] = [0, 1, 2, 2, 3, 3, 3];

function mapIosRawLevel(raw: number): ThermalLevel {
	const index = Math.max(0, Math.min(raw, IOS_RAW_TO_LEVEL.length - 1));
	return IOS_RAW_TO_LEVEL[index];
}

function mapAndroidRawLevel(raw: number): ThermalLevel {
	const index = Math.max(0, Math.min(raw, ANDROID_RAW_TO_LEVEL.length - 1));
	return ANDROID_RAW_TO_LEVEL[index];
}

/**
 * Fail-open wrapper around the native `ThermalObserver` TurboModule. Owns the
 * platform→normalized mapping (D4), caches the latest level from the OS
 * `thermal_state_change` stream (so `shouldPauseProcessing` reads it
 * synchronously, D6), and exposes the two throttle thresholds (D5).
 *
 * Every path FAILS OPEN: an absent module or a thrown read leaves the cached
 * level at `nominal`, so a broken thermal source can never wedge the pipeline
 * (matches the fail-open philosophy of `battery.ts`).
 */
export class ThermalService {
	private static module: ThermalSpec | null = null;
	private static eventEmitter: NativeEventEmitter | null = null;
	private static changeSubscription: EmitterSubscription | null = null;
	private static isModuleAvailable = false;
	private static initialized = false;

	/** Cached normalized level; primed by {@link initialize}, kept fresh by the event stream. */
	private static lastLevel: ThermalLevel = 0;

	private static listeners = new Set<(level: ThermalLevel) => void>();

	static {
		// Resolve the native module defensively, mirroring
		// `MediaDiscoveryService`'s `static {}` guard (MediaDiscoveryService.ts:43-59).
		try {
			if (ThermalObserverModule) {
				this.module = ThermalObserverModule;
				this.isModuleAvailable = true;
				this.eventEmitter = new NativeEventEmitter(
					ThermalObserverModule as unknown as {
						addListener: (eventType: string) => void;
						removeListeners: (count: number) => void;
					},
				);
			}
		} catch (error) {
			console.warn(
				"Native ThermalObserver not available; thermal gate disabled (fail-open)",
				error,
			);
			this.isModuleAvailable = false;
		}
	}

	/** Whether the native `ThermalObserver` module resolved. */
	static isAvailable(): boolean {
		return this.isModuleAvailable;
	}

	/**
	 * Prime the cache with one native read, then subscribe to the OS change
	 * stream. Idempotent and fail-open: if the module is absent or the initial
	 * read throws, the cached level stays `nominal`.
	 */
	static async initialize(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;

		if (!this.isModuleAvailable || !this.module) {
			this.lastLevel = 0;
			return;
		}

		try {
			const payload = await this.module.getThermalState();
			this.lastLevel = this.normalize(payload);
		} catch (error) {
			console.warn(
				"ThermalService.initialize: initial read failed (fail-open nominal)",
				error,
			);
			this.lastLevel = 0;
		}

		this.subscribeToNative();
	}

	/** The last cached normalized level (synchronous; safe for per-tick gating). */
	static getCachedLevel(): ThermalLevel {
		return this.lastLevel;
	}

	/** The human-readable name of the last cached level. */
	static getCachedName(): ThermalLevelName {
		return THERMAL_LEVEL_NAMES[this.lastLevel];
	}

	/**
	 * Live native read of the current level, updating the cache. Fail-open:
	 * returns `nominal` (0) when the module is absent or the read throws.
	 */
	static async getLevel(): Promise<ThermalLevel> {
		if (!this.isModuleAvailable || !this.module) return 0;
		try {
			const payload = await this.module.getThermalState();
			const level = this.normalize(payload);
			this.updateLevel(level);
			return level;
		} catch (error) {
			console.warn("ThermalService.getLevel failed (fail-open nominal)", error);
			return 0;
		}
	}

	/** Subscribe to normalized level changes. Returns an unsubscribe function. */
	static subscribe(listener: (level: ThermalLevel) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Whether the current drain should pause: cached level ≥ `serious` (D5).
	 * Fail-open — a `nominal` cache (absent/broken module) never pauses.
	 */
	static isThrottledForDrain(): boolean {
		return this.getCachedLevel() >= DRAIN_PAUSE_LEVEL;
	}

	/**
	 * Whether Tier-1 should back off: cached level ≥ `fair` (D5) — stricter and
	 * earlier than the drain pause. Fail-open at the thermal axis; Tier-1
	 * admission itself fails closed on the capability axis (see
	 * `DeviceCapabilityService.canRunTier1`).
	 */
	static isThrottledForTier1(): boolean {
		return this.getCachedLevel() >= TIER1_PAUSE_LEVEL;
	}

	/** Remove the native subscription (teardown). */
	static cleanup(): void {
		if (this.changeSubscription) {
			this.changeSubscription.remove();
			this.changeSubscription = null;
		}
	}

	// --- Internals ---------------------------------------------------------

	private static subscribeToNative(): void {
		if (!this.eventEmitter || this.changeSubscription) return;
		this.changeSubscription = this.eventEmitter.addListener(
			THERMAL_EVENT,
			(payload: ThermalStatePayload) => {
				try {
					this.updateLevel(this.normalize(payload));
				} catch (error) {
					console.warn("ThermalService: bad thermal event (ignored)", error);
				}
			},
		);
	}

	/**
	 * Normalize a native payload to the shared 0..3 scale from its platform
	 * `rawLevel`, so JS owns the canonical mapping and the logic is unit-testable
	 * with injected payloads (D4).
	 */
	private static normalize(payload: ThermalStatePayload): ThermalLevel {
		return Platform.OS === "ios"
			? mapIosRawLevel(payload.rawLevel)
			: mapAndroidRawLevel(payload.rawLevel);
	}

	private static updateLevel(level: ThermalLevel): void {
		if (level === this.lastLevel) return;
		this.lastLevel = level;
		for (const listener of Array.from(this.listeners)) {
			listener(level);
		}
	}
}
