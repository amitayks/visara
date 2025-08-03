import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScanProgress } from "../services/gallery/GalleryScanner";

interface ScanStatistics {
	totalScans: number;
	totalImagesScanned: number;
	totalDocumentsFound: number;
	averageScanDuration: number;
	lastScanDate: Date | null;
}

interface ScannerData {
	scanProgress: ScanProgress;
	lastNotificationTime: Date | null;
	isBackgroundScanEnabled: boolean;
	scanHistory: Array<{
		date: Date;
		imagesScanned: number;
		documentsFound: number;
		duration: number;
	}>;
	failedImagesCount: number;
	scanStatistics: ScanStatistics;
	isScanningPaused: boolean;
	nextScheduledScan: Date | null;
}

interface ScannerActions {
	setScanProgress: (progress: ScanProgress) => void;
	setLastNotificationTime: (time: Date) => void;
	setBackgroundScanEnabled: (enabled: boolean) => void;
	addScanHistoryEntry: (entry: {
		date: Date;
		imagesScanned: number;
		documentsFound: number;
		duration: number;
	}) => void;
	updateScanStatistics: (stats: ScanStatistics) => void;
	setFailedImagesCount: (count: number) => void;
	pauseScanning: () => void;
	resumeScanning: () => void;
	setNextScheduledScan: (date: Date | null) => void;
	reset: () => void;
}

type ScannerState = ScannerData & ScannerActions;

const initialProgress: ScanProgress = {
	totalImages: 0,
	processedImages: 0,
	lastScanDate: null,
	lastProcessedAssetId: null,
	isScanning: false,
};

const initialStatistics: ScanStatistics = {
	totalScans: 0,
	totalImagesScanned: 0,
	totalDocumentsFound: 0,
	averageScanDuration: 0,
	lastScanDate: null,
};

export const useScannerStore = create<
	ScannerState,
	[["zustand/persist", ScannerData]]
>(
	persist(
		(set, get) => ({
			scanProgress: initialProgress,
			lastNotificationTime: null,
			isBackgroundScanEnabled: false,
			scanHistory: [],
			failedImagesCount: 0,
			scanStatistics: initialStatistics,
			isScanningPaused: false,
			nextScheduledScan: null,

			setScanProgress: (progress) => set({ scanProgress: progress }),

			setLastNotificationTime: (time) => set({ lastNotificationTime: time }),

			setBackgroundScanEnabled: (enabled) =>
				set({ isBackgroundScanEnabled: enabled }),

			addScanHistoryEntry: (entry) =>
				set((state) => {
					const newHistory = [...state.scanHistory, entry];
					// Keep only last 50 entries
					if (newHistory.length > 50) {
						newHistory.shift();
					}
					return { scanHistory: newHistory };
				}),

			updateScanStatistics: (stats) => set({ scanStatistics: stats }),

			setFailedImagesCount: (count) => set({ failedImagesCount: count }),

			pauseScanning: () => set({ isScanningPaused: true }),

			resumeScanning: () => set({ isScanningPaused: false }),

			setNextScheduledScan: (date) => set({ nextScheduledScan: date }),

			reset: () =>
				set({
					scanProgress: initialProgress,
					lastNotificationTime: null,
					isBackgroundScanEnabled: false,
					scanHistory: [],
					failedImagesCount: 0,
					scanStatistics: initialStatistics,
					isScanningPaused: false,
					nextScheduledScan: null,
				}),
		}),
		{
			name: "scanner-storage",
			storage: {
				getItem: async (name) => {
					const value = await AsyncStorage.getItem(name);
					return value ? JSON.parse(value) : null;
				},
				setItem: async (name, value) => {
					await AsyncStorage.setItem(name, JSON.stringify(value));
				},
				removeItem: async (name) => {
					await AsyncStorage.removeItem(name);
				},
			},
			partialize: (state) => ({
				scanProgress: state.scanProgress,
				lastNotificationTime: state.lastNotificationTime,
				isBackgroundScanEnabled: state.isBackgroundScanEnabled,
				scanHistory: state.scanHistory,
				failedImagesCount: state.failedImagesCount,
				scanStatistics: state.scanStatistics,
				isScanningPaused: state.isScanningPaused,
				nextScheduledScan: state.nextScheduledScan,
			}),
		},
	),
);

// Helper functions for common operations
export const scannerStoreHelpers = {
	canStartNewScan: () => {
		const state = useScannerStore.getState();
		return !state.scanProgress.isScanning && !state.isScanningPaused;
	},

	getLastScanInfo: () => {
		const state = useScannerStore.getState();
		const lastScan = state.scanHistory[state.scanHistory.length - 1];
		return lastScan || null;
	},

	getTotalDocumentsFound: () => {
		const state = useScannerStore.getState();
		return state.scanHistory.reduce(
			(total, scan) => total + scan.documentsFound,
			0,
		);
	},

	getScanSuccessRate: () => {
		const state = useScannerStore.getState();
		const totalImages = state.scanHistory.reduce(
			(total, scan) => total + scan.imagesScanned,
			0,
		);
		const totalDocs = state.scanHistory.reduce(
			(total, scan) => total + scan.documentsFound,
			0,
		);
		return totalImages > 0 ? (totalDocs / totalImages) * 100 : 0;
	},
};