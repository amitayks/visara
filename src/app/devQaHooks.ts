import { navigate, navigationRef } from "@app/navigation";
import type { MediaFile } from "@models/MediaFile";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { requestMediaPermissions } from "@services/media/MediaPermissions";
import { useModelStore } from "@state/modelStore";
import { useNavStore } from "@state/navStore";
import { useProcessingStore } from "@state/processingStore";
import { useSearchStore } from "@state/searchStore";
import { useSelectionStore } from "@state/selectionStore";
import { useSettingsStore } from "@state/settingsStore";
import { useViewerStore } from "@state/viewerStore";

/**
 * __DEV__-only QA hooks (rebuild-ui-foundation verification): lets the
 * Hermes CDP (`Runtime.evaluate` via Metro) drive real app flows headlessly
 * on simulators/emulators. Never imported in production builds.
 */
export function installDevQaHooks(): void {
	if (!__DEV__) return;

	const openViewer = async (index = 0): Promise<string> => {
		const { openPhotoViewer } = await import(
			"@features/viewer/openPhotoViewer"
		);
		const media: MediaFile[] = await MediaFileRepository.getAll();
		if (media.length === 0) return "no-media";
		openPhotoViewer(media, Math.min(index, media.length - 1));
		return `opened:${media.length}`;
	};

	(globalThis as Record<string, unknown>).__visaraQA = {
		settings: useSettingsStore,
		nav: useNavStore,
		search: useSearchStore,
		selection: useSelectionStore,
		viewer: useViewerStore,
		processing: useProcessingStore,
		model: useModelStore,
		openViewer,
		requestPerm: () => requestMediaPermissions(),
		navigate,
		goBack: () => {
			if (navigationRef.isReady() && navigationRef.canGoBack()) {
				navigationRef.goBack();
				return "went-back";
			}
			return "cannot-go-back";
		},
		route: () =>
			navigationRef.isReady()
				? (navigationRef.getCurrentRoute()?.name ?? "unknown")
				: "not-ready",
		snapshot: () => ({
			settings: useSettingsStore.getState(),
			nav: useNavStore.getState(),
			search: {
				query: useSearchStore.getState().query,
				status: useSearchStore.getState().status,
				count: useSearchStore.getState().results.length,
			},
			viewerOpen: useViewerStore.getState().isOpen,
			processing: useProcessingStore.getState(),
		}),
	};
}
