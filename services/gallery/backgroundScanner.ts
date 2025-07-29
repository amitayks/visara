import NetInfo from "@react-native-community/netinfo";
import { settingsStore } from "../../stores/settingsStore";
import { galleryScanner } from "./GalleryScanner";

export class BackgroundScanner {
	private scanInterval: NodeJS.Timeout | null = null;

	async startPeriodicScan() {
		const settings = settingsStore.getState().settings;

		if (!settings.autoScan) {
			console.log("Auto-scan is disabled");
			return;
		}

		// Clear any existing interval
		this.stopPeriodicScan();

		// Set up interval based on scan frequency
		const intervalMs = this.getIntervalMs(settings.scanFrequency);

		if (intervalMs > 0) {
			this.scanInterval = setInterval(async () => {
				if (await this.shouldRunScan()) {
					await this.runBackgroundScan();
				}
			}, intervalMs);

			// Run initial scan
			if (await this.shouldRunScan()) {
				await this.runBackgroundScan();
			}
		}
	}

	stopPeriodicScan() {
		if (this.scanInterval) {
			clearInterval(this.scanInterval);
			this.scanInterval = null;
		}
	}

	private getIntervalMs(frequency: string): number {
		switch (frequency) {
			case "hourly":
				return 60 * 60 * 1000; // 1 hour
			case "daily":
				return 24 * 60 * 60 * 1000; // 24 hours
			case "weekly":
				return 7 * 24 * 60 * 60 * 1000; // 7 days
			case "manual":
			default:
				return 0; // No automatic scanning
		}
	}

	async shouldRunScan(): Promise<boolean> {
		const settings = settingsStore.getState().settings;

		// Check if auto-scan is enabled
		if (!settings.autoScan) {
			return false;
		}

		// Check WiFi requirement
		if (settings.scanWifiOnly) {
			const netInfo = await NetInfo.fetch();
			if (netInfo.type !== "wifi") {
				console.log("Skipping scan: WiFi-only mode enabled and not on WiFi");
				return false;
			}
		}

		return true;
	}

	async runBackgroundScan() {
		const settings = settingsStore.getState().settings;

		try {
			console.log("Starting background gallery scan...");

			await galleryScanner.startScan({
				batchSize: 10, // Smaller batches for background processing
				wifiOnly: settings.scanWifiOnly,
			});

			console.log("Background gallery scan completed");
		} catch (error) {
			console.error("Background scan failed:", error);
		}
	}

	async isScanning(): Promise<boolean> {
		return galleryScanner.getProgress().isScanning;
	}
}

export const backgroundScanner = new BackgroundScanner();
