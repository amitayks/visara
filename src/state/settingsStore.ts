import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { storage } from "@services/storage/mmkv";
import { applyThemeMode, type ThemeMode } from "@ui/theme";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";

export type GridZoomLevel = 3 | 4 | 11;
export type PermissionState = "unknown" | "granted" | "denied" | "limited";

/**
 * Single-owner MMKV persistence (ui-state-management spec): each key has
 * exactly one writer (this store) and one value type. BackgroundTaskService
 * READS the boolean battery/night keys and never writes them.
 */
const KEY_TYPES = {
	[STORAGE_KEYS.THEME]: "string",
	[STORAGE_KEYS.GRID_ZOOM_LEVEL]: "number",
	[STORAGE_KEYS.BATTERY_SAVER_ENABLED]: "boolean",
	[STORAGE_KEYS.NIGHT_PROCESSING_ENABLED]: "boolean",
	[STORAGE_KEYS.ONBOARDING_COMPLETED]: "boolean",
} as const;

/**
 * Idempotent one-time migration from the legacy SettingsContext format, which
 * wrote every value as a string ("true"/"false"/"4"). MMKV types do not
 * interconvert, so once a key holds its target type getString() returns
 * undefined and this is a no-op.
 */
export function migrateLegacySettingsStorage(): void {
	for (const [key, type] of Object.entries(KEY_TYPES)) {
		if (type === "string") continue;
		const legacy = storage.getString(key);
		if (legacy === undefined) continue;
		if (type === "boolean") {
			storage.set(key, legacy === "true");
		} else {
			const parsed = Number(legacy);
			if (Number.isFinite(parsed)) {
				storage.set(key, parsed);
			} else {
				storage.remove(key);
			}
		}
	}
}

function toZoom(value: number | undefined): GridZoomLevel {
	return value === 3 || value === 4 || value === 11 ? value : 4;
}

function toTheme(value: string | undefined): ThemeMode {
	return value === "light" || value === "dark" || value === "system"
		? value
		: "system";
}

interface SettingsState {
	theme: ThemeMode;
	batterySaver: boolean;
	nightProcessing: boolean;
	gridZoomLevel: GridZoomLevel;
	onboardingCompleted: boolean;
	/** Session-only (not persisted): media permission outcome from bootstrap. */
	permissionState: PermissionState;
	setTheme: (mode: ThemeMode) => void;
	setBatterySaver: (enabled: boolean) => void;
	setNightProcessing: (enabled: boolean) => void;
	setGridZoomLevel: (level: GridZoomLevel) => void;
	completeOnboarding: () => void;
	setPermissionState: (state: PermissionState) => void;
}

migrateLegacySettingsStorage();

export const useSettingsStore = create<SettingsState>()(
	subscribeWithSelector((set) => ({
		theme: toTheme(storage.getString(STORAGE_KEYS.THEME)),
		batterySaver: storage.getBoolean(STORAGE_KEYS.BATTERY_SAVER_ENABLED) ?? false,
		nightProcessing:
			storage.getBoolean(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED) ?? false,
		gridZoomLevel: toZoom(storage.getNumber(STORAGE_KEYS.GRID_ZOOM_LEVEL)),
		onboardingCompleted:
			storage.getBoolean(STORAGE_KEYS.ONBOARDING_COMPLETED) ?? false,
		permissionState: "unknown",

		setTheme: (mode) => {
			storage.set(STORAGE_KEYS.THEME, mode);
			applyThemeMode(mode);
			set({ theme: mode });
		},
		setBatterySaver: (enabled) => {
			storage.set(STORAGE_KEYS.BATTERY_SAVER_ENABLED, enabled);
			set({ batterySaver: enabled });
		},
		setNightProcessing: (enabled) => {
			storage.set(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED, enabled);
			set({ nightProcessing: enabled });
		},
		setGridZoomLevel: (level) => {
			storage.set(STORAGE_KEYS.GRID_ZOOM_LEVEL, level);
			set({ gridZoomLevel: level });
		},
		completeOnboarding: () => {
			storage.set(STORAGE_KEYS.ONBOARDING_COMPLETED, true);
			set({ onboardingCompleted: true });
		},
		setPermissionState: (permissionState) => set({ permissionState }),
	})),
);
