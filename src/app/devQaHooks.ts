import { navigate, navigationRef } from "@app/navigation";
import {
	GemmaModelDeliveryService,
	getEnrichFailures,
	getVisibleMediaRows,
	LibrarySync,
	loadMediaMetadata,
	Pipeline,
	requestMediaAccess,
	searchMedia,
} from "@backend/facade";
import type { MediaRow as MediaFile } from "@backend/types";
import NativeMediaIndexer from "@native-modules/NativeMediaIndexer";
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
		const media: MediaFile[] = await getVisibleMediaRows();
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
		requestPerm: () => requestMediaAccess(),
		// v2 backend introspection (rebuild-backend-gemma verification):
		backend: {
			indexerPresent: () => NativeMediaIndexer != null,
			failures: (limit = 10) => getEnrichFailures(limit),
			accessStatus: () => NativeMediaIndexer?.getAccessStatus() ?? "no-module",
			mediaCount: async () => (await getVisibleMediaRows()).length,
			mediaRows: async (limit = 10) =>
				(await getVisibleMediaRows()).slice(0, limit).map((m) => ({
					id: m.id,
					filename: m.filename,
					status: m.enrichStatus,
					kind: m.kind,
				})),
			discoveryComplete: () => LibrarySync.isDiscoveryComplete(),
			pipeline: () => ({
				...Pipeline.getSnapshot(),
				pauseReason: Pipeline.getPauseReason(),
			}),
			pipelineStart: () => Pipeline.start(),
			reprocess: () => Pipeline.reprocess(),
			delivery: () => GemmaModelDeliveryService.getState(),
			deliveryInit: () => GemmaModelDeliveryService.initialize(),
			search: async (q: string) =>
				(await searchMedia(q)).map((m) => m.filename),
			metadata: (id: string) => loadMediaMetadata(id),
		},
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
