import { beforeEach, describe, expect, it } from "@jest/globals";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { storage } from "@utils/storage/mmkv";
import {
	migrateLegacySettingsStorage,
	useSettingsStore,
} from "../settingsStore";

describe("settings storage migration (ui-state-management spec)", () => {
	beforeEach(() => storage.clearAll());

	it("converts legacy string booleans to typed booleans once", () => {
		storage.set(STORAGE_KEYS.BATTERY_SAVER_ENABLED, "true");
		storage.set(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED, "false");
		storage.set(STORAGE_KEYS.ONBOARDING_COMPLETED, "true");
		storage.set(STORAGE_KEYS.GRID_ZOOM_LEVEL, "11");

		migrateLegacySettingsStorage();

		// The exact reads BackgroundTaskService performs at initialize().
		expect(storage.getBoolean(STORAGE_KEYS.BATTERY_SAVER_ENABLED)).toBe(true);
		expect(storage.getBoolean(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED)).toBe(
			false,
		);
		expect(storage.getBoolean(STORAGE_KEYS.ONBOARDING_COMPLETED)).toBe(true);
		expect(storage.getNumber(STORAGE_KEYS.GRID_ZOOM_LEVEL)).toBe(11);
	});

	it("is idempotent — a second run changes nothing", () => {
		storage.set(STORAGE_KEYS.BATTERY_SAVER_ENABLED, "true");
		migrateLegacySettingsStorage();
		migrateLegacySettingsStorage();
		expect(storage.getBoolean(STORAGE_KEYS.BATTERY_SAVER_ENABLED)).toBe(true);
		expect(storage.getString(STORAGE_KEYS.BATTERY_SAVER_ENABLED)).toBe(
			undefined,
		);
	});

	it("leaves already-boolean keys untouched", () => {
		storage.set(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED, true);
		migrateLegacySettingsStorage();
		expect(storage.getBoolean(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED)).toBe(
			true,
		);
	});

	it("drops an unparseable legacy zoom value", () => {
		storage.set(STORAGE_KEYS.GRID_ZOOM_LEVEL, "not-a-number");
		migrateLegacySettingsStorage();
		expect(storage.contains(STORAGE_KEYS.GRID_ZOOM_LEVEL)).toBe(false);
	});
});

describe("settingsStore actions", () => {
	it("persists boolean toggles as booleans (single owner, single type)", () => {
		useSettingsStore.getState().setBatterySaver(true);
		expect(storage.getBoolean(STORAGE_KEYS.BATTERY_SAVER_ENABLED)).toBe(true);
		expect(useSettingsStore.getState().batterySaver).toBe(true);
	});

	it("persists grid zoom and completion", () => {
		useSettingsStore.getState().setGridZoomLevel(11);
		useSettingsStore.getState().completeOnboarding();
		expect(storage.getNumber(STORAGE_KEYS.GRID_ZOOM_LEVEL)).toBe(11);
		expect(storage.getBoolean(STORAGE_KEYS.ONBOARDING_COMPLETED)).toBe(true);
	});
});
