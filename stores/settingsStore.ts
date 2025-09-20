import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

// MMKV storage instance
const storage = new MMKV();

export interface AppSettings {
	// Display settings
	theme: "light" | "dark" | "system";

	// Document detection settings
	documentDetectionSensitivity: "low" | "medium" | "high";

	// Storage settings
	saveProcessedImages: boolean;
	deleteProcessedFromGallery: boolean;

	// Privacy settings
	analyticsEnabled: boolean;
	crashReportingEnabled: boolean;

	// Notification settings
	notificationEnabled: boolean;
	showProcessingNotifications: boolean;

	// Advanced settings
	debugMode: boolean;
	showDeveloperOptions: boolean;
}

interface SettingsStore {
	settings: AppSettings;
	hasHydrated: boolean;
	updateSetting: <K extends keyof AppSettings>(
		key: K,
		value: AppSettings[K],
	) => void;
	resetSettings: () => void;
	setHasHydrated: (state: boolean) => void;
}

const defaultSettings: AppSettings = {
	// Display
	theme: "system",

	// Detection
	documentDetectionSensitivity: "medium",

	// Storage
	saveProcessedImages: true,
	deleteProcessedFromGallery: false,

	// Privacy
	analyticsEnabled: true,
	crashReportingEnabled: true,

	// Notifications
	notificationEnabled: true,
	showProcessingNotifications: false,

	// Advanced
	debugMode: false,
	showDeveloperOptions: false,
};

// MMKV storage adapter
const mmkvStorage = {
	getItem: (name: string): string | null => {
		const value = storage.getString(name);
		return value ?? null;
	},
	setItem: (name: string, value: string): void => {
		storage.set(name, value);
	},
	removeItem: (name: string): void => {
		storage.delete(name);
	},
};

export const useSettingsStore = create<SettingsStore>()(
	persist(
		(set) => ({
			settings: defaultSettings,
			hasHydrated: false,

			updateSetting: (key, value) => {
				set((state) => ({
					settings: {
						...state.settings,
						[key]: value,
					},
				}));

				console.log(`[Settings] Updated ${key}:`, value);
			},

			resetSettings: () => {
				set({ settings: defaultSettings });
				console.log("[Settings] Reset to defaults");
			},

			setHasHydrated: (hydrated) => {
				set({ hasHydrated: hydrated });
			},
		}),
		{
			name: "app-settings-v2",
			storage: createJSONStorage(() => mmkvStorage),
			onRehydrateStorage: () => (state) => {
				state?.setHasHydrated(true);
				console.log("[Settings] Hydrated from storage");
			},
		},
	),
);

// Helper hook to get specific setting
export const useSetting = <K extends keyof AppSettings>(
	key: K,
): AppSettings[K] => {
	return useSettingsStore((state) => state.settings[key]);
};

// Helper hook to check if settings are loaded
export const useSettingsLoaded = (): boolean => {
	return useSettingsStore((state) => state.hasHydrated);
};
