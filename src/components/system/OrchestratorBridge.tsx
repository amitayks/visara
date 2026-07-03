import { useGallery } from "@contexts/GalleryContext";
import { useProcessing } from "@contexts/ProcessingContext";
import { useSettings } from "@contexts/SettingsContext";
import { BackgroundTaskService } from "@services/background/BackgroundTaskService";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { MediaDiscoveryService } from "@services/media/MediaDiscoveryService";
import { GemmaModelDeliveryService } from "@services/model/GemmaModelDeliveryService";
import {
	OBSERVER_THROTTLE_MS,
	type OrchestratorEvent,
	OrchestratorService,
} from "@services/orchestrator/OrchestratorService";
import { useEffect } from "react";

/**
 * Thin, null-rendering boundary between the framework-agnostic
 * `OrchestratorService` and React. Mounted once inside the provider stack in
 * `App.tsx`, it: boots the pipeline after onboarding, maps orchestrator events
 * onto `ProcessingContext`, reflects DB truth into `GalleryContext`, folds live
 * `MediaObserver` batches into the pipeline, and keeps the gating authority in
 * sync with `SettingsContext`.
 */
export function OrchestratorBridge(): null {
	const { dispatch: galleryDispatch } = useGallery();
	const { dispatch: processingDispatch } = useProcessing();
	const { state: settingsState } = useSettings();

	const onboardingCompleted = settingsState.preferences.onboardingCompleted;
	const batterySaver = settingsState.batterySaver;
	const nightProcessing = settingsState.nightProcessing;

	// Boot the pipeline once onboarding is complete and permissions are granted.
	useEffect(() => {
		if (!onboardingCompleted) return;

		let cancelled = false;
		const boot = async () => {
			try {
				// Reconcile persisted delivery state and re-attach any in-flight model
				// download (change: gemma-model-delivery). RECONCILE/RE-ATTACH ONLY — it
				// never auto-starts a transfer — and is independent of media permissions,
				// so it runs fire-and-forget without blocking the Tier-0 pipeline boot.
				void GemmaModelDeliveryService.initialize();

				const granted = await MediaDiscoveryService.requestPermissions();
				if (!granted || cancelled) return;
				await OrchestratorService.initialize();
				if (cancelled) return;
				await OrchestratorService.runInitialProcessing();
			} catch (e) {
				// A failed boot previously rejected silently (void boot()) — surface it.
				console.error("OrchestratorBridge.boot failed:", e);
			}
		};
		void boot();

		return () => {
			cancelled = true;
		};
	}, [onboardingCompleted]);

	// Map orchestrator events -> ProcessingContext dispatches (D10).
	useEffect(() => {
		const unsubscribe = OrchestratorService.subscribe(
			(event: OrchestratorEvent) => {
				switch (event.type) {
					case "started":
						processingDispatch({ type: "START_PROCESSING" });
						break;
					case "scan-progress":
						processingDispatch({
							type: "UPDATE_PROGRESS",
							payload: { current: event.discovered, total: event.total },
						});
						break;
					case "progress":
						processingDispatch({
							type: "UPDATE_PROGRESS",
							payload: {
								current: event.processed,
								total: event.total,
								currentFileName: event.currentFileName,
							},
						});
						break;
					case "item-failed":
						processingDispatch({
							type: "ADD_FAILED_FILE",
							payload: {
								mediaFileId: event.mediaFileId,
								fileName: event.filename,
								errorMessage: event.error,
								timestamp: Date.now(),
							},
						});
						break;
					case "paused":
						processingDispatch({ type: "SET_PAUSED", payload: true });
						break;
					case "resumed":
						processingDispatch({ type: "SET_PAUSED", payload: false });
						break;
					case "completed":
						processingDispatch({ type: "STOP_PROCESSING" });
						break;
					default:
						break;
				}
			},
		);

		return unsubscribe;
	}, [processingDispatch]);

	// Reflect DB truth into the gallery: reactive, idempotent population that
	// folds in both newly discovered and newly processed media.
	useEffect(() => {
		const subscription = MediaFileRepository.observeVisible().subscribe(
			(files) => {
				galleryDispatch({ type: "SET_MEDIA_FILES", payload: files });
			},
		);

		return () => subscription.unsubscribe();
	}, [galleryDispatch]);

	// Fold live observer batches into the pipeline (post-onboarding).
	useEffect(() => {
		if (!onboardingCompleted) return;

		const cleanup = MediaDiscoveryService.startObserver(
			OBSERVER_THROTTLE_MS,
			(changes) => {
				void OrchestratorService.enqueueDiscovered(changes);
			},
		);

		return cleanup;
	}, [onboardingCompleted]);

	// Keep the gating authority (battery/night) in sync with settings.
	useEffect(() => {
		BackgroundTaskService.updateSettings({
			batterySaverEnabled: batterySaver,
			nightProcessingEnabled: nightProcessing,
		});
	}, [batterySaver, nightProcessing]);

	return null;
}
