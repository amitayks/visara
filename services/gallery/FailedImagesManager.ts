import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ScanOptions } from "./GalleryScanner";

const FAILED_IMAGES_KEY = "failed_image_uris";

export class FailedImagesManager {
	async loadFailedImages(): Promise<Map<string, number>> {
		try {
			const saved = await AsyncStorage.getItem(FAILED_IMAGES_KEY);
			if (saved) {
				const entries = JSON.parse(saved);
				return new Map(entries);
			}
			return new Map();
		} catch (error) {
			console.error("Failed to load failed images:", error);
			return new Map();
		}
	}

	async saveFailedImages(failedImages: Map<string, number>): Promise<void> {
		try {
			const entries = Array.from(failedImages.entries());
			await AsyncStorage.setItem(FAILED_IMAGES_KEY, JSON.stringify(entries));
		} catch (error) {
			console.error("Failed to save failed images:", error);
		}
	}

	async retryFailedImages(
		failedImages: Map<string, number>,
		processAssetCallback: (asset: any, options: ScanOptions) => Promise<void>,
		options: ScanOptions = {},
	): Promise<Map<string, number>> {
		const failedUris = Array.from(failedImages.keys());
		if (failedUris.length === 0) {
			console.log("No failed images to retry");
			return failedImages;
		}

		console.log(`Retrying ${failedUris.length} failed images`);

		const updatedFailedImages = new Map<string, number>();

		for (const uri of failedUris) {
			const asset = {
				image: { uri },
			};

			try {
				await processAssetCallback(asset, options);
			} catch (error) {
				console.error(`Retry failed for ${uri}:`, error);
			}
		}

		return updatedFailedImages;
	}
}