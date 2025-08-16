import * as Keychain from "react-native-keychain";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AppSettings {
	autoScan: boolean;
	scanFrequency: "hourly" | "daily" | "weekly" | "manual";
	darkMode: boolean;
	scanWifiOnly: boolean;
	batterySaver: boolean;
	smartFilterEnabled: boolean;
	notifications: boolean;
	biometricLock: boolean;
	scanQuality: "low" | "medium" | "high";
	encryptSensitiveDocuments: boolean;
	language: string;
	storageLimit: number; // in GB
	scanNewOnly: boolean;
	maxScanBatchSize: number;
}

interface SettingsStore {
	settings: AppSettings;
	isLoading: boolean;

	// Actions
	updateSetting: <K extends keyof AppSettings>(
		key: K,
		value: AppSettings[K],
	) => void;
	resetSettings: () => void;
	loadSettings: () => Promise<void>;
	saveSettings: () => Promise<void>;
}

const defaultSettings: AppSettings = {
	autoScan: true,
	darkMode: false,
	scanFrequency: "daily",
	scanWifiOnly: false,
	batterySaver: false,
	smartFilterEnabled: false,
	notifications: false,
	biometricLock: false,
	scanQuality: "medium",
	encryptSensitiveDocuments: false,
	language: "en",
	storageLimit: 5,
	scanNewOnly: false,
	maxScanBatchSize: 20,
};

// Custom storage using React Native Keychain
const secureStorage = {
	getItem: async (name: string): Promise<string | null> => {
		try {
			const credentials = await Keychain.getInternetCredentials(name);
			if (credentials) {
				return credentials.password;
			}
			return null;
		} catch (error) {
			console.error("Error loading settings:", error);
			return null;
		}
	},
	setItem: async (name: string, value: string): Promise<void> => {
		try {
			await Keychain.setInternetCredentials(name, "visara_settings", value);
		} catch (error) {
			console.error("Error saving settings:", error);
		}
	},
	removeItem: async (name: string): Promise<void> => {
		try {
			await Keychain.resetInternetCredentials(name);
		} catch (error) {
			console.error("Error removing settings:", error);
		}
	},
};

export const useSettingsStore = create<SettingsStore>()(
	persist(
		(set, get) => ({
			settings: defaultSettings,
			isLoading: false,

			updateSetting: (key, value) => {
				set((state) => ({
					settings: {
						...state.settings,
						[key]: value,
					},
				}));
			},

			resetSettings: () => {
				set({ settings: defaultSettings });
			},

			loadSettings: async () => {
				set({ isLoading: true });
				try {
					// Settings are automatically loaded by persist middleware
					// This method can be used for any additional loading logic
				} catch (error) {
					// console.error("Error loading settings:", error);
				} finally {
					set({ isLoading: false });
				}
			},

			saveSettings: async () => {
				try {
					// Settings are automatically saved by persist middleware
					// This method can be used for any additional saving logic
					console.log("Settings saved successfully");
				} catch (error) {
					console.error("Error saving settings:", error);
				}
			},
		}),
		{
			name: "visara-settings",
			storage: createJSONStorage(() => secureStorage),
		},
	),
);

// Export the store for direct access
export const settingsStore = useSettingsStore;
