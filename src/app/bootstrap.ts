import { BackgroundTaskService } from "@services/background/BackgroundTaskService";
import { requestMediaPermissions } from "@services/media/MediaPermissions";
import { MediaDiscoveryService } from "@services/media/MediaDiscoveryService";
import { GemmaModelDeliveryService } from "@services/model/GemmaModelDeliveryService";
import {
	OBSERVER_THROTTLE_MS,
	OrchestratorService,
} from "@services/orchestrator/OrchestratorService";
import { attachModelStore } from "@state/modelStore";
import { useProcessingStore } from "@state/processingStore";
import { useSettingsStore } from "@state/settingsStore";

/**
 * Headless replacement for the old OrchestratorBridge component
 * (orchestrator-gallery-bridge spec): the single sanctioned seam between
 * services and UI state. Started once from the app shell; stop tears
 * everything down. The orchestrator never imports React; this module never
 * renders. Gallery data is deliberately NOT wired here — screens subscribe to
 * the DB directly (ui-state-management spec).
 */

let running = false;
let teardowns: Array<() => void> = [];
let pipelineBooted = false;

function bootPipelineOnce(): void {
	if (pipelineBooted) return;
	const { onboardingCompleted, setPermissionState } =
		useSettingsStore.getState();
	if (!onboardingCompleted) return;
	pipelineBooted = true;

	void (async () => {
		try {
			// Reconcile/re-attach only — never auto-starts a transfer, independent
			// of media permissions, so fire-and-forget ahead of the boot chain.
			void GemmaModelDeliveryService.initialize();

			const permission = await requestMediaPermissions();
			setPermissionState(permission);
			if (permission === "denied") {
				// Surfaced state (no silent abort). A later grant retries via
				// retryPermissions() without an app restart.
				pipelineBooted = false;
				return;
			}

			await OrchestratorService.initialize();
			await OrchestratorService.runInitialProcessing();

			// Live observer: fold new/changed media into the pipeline, no rescan.
			const stopObserver = MediaDiscoveryService.startObserver(
				OBSERVER_THROTTLE_MS,
				(changes) => {
					void OrchestratorService.enqueueDiscovered(changes);
				},
			);
			teardowns.push(stopObserver);
		} catch (error) {
			pipelineBooted = false;
			console.error("bootstrap: pipeline boot failed", error);
		}
	})();
}

/** Re-request permissions after an in-app denial (onboarding-experience spec). */
export function retryPermissions(): void {
	if (!running) return;
	bootPipelineOnce();
}

export function startAppServices(): void {
	if (running) return;
	running = true;

	// Orchestrator events -> processing store (exact event-map contract).
	useProcessingStore.getState().seed(OrchestratorService.getSnapshot());
	teardowns.push(
		OrchestratorService.subscribe((event) => {
			useProcessingStore.getState().applyEvent(event);
		}),
	);

	// Model delivery state -> model store (emit-on-subscribe).
	teardowns.push(attachModelStore());

	// Settings -> drain gating, now and on every change (single-writer keys).
	const pushGating = () => {
		const s = useSettingsStore.getState();
		BackgroundTaskService.updateSettings({
			batterySaverEnabled: s.batterySaver,
			nightProcessingEnabled: s.nightProcessing,
		});
	};
	pushGating();
	teardowns.push(
		useSettingsStore.subscribe(
			(s) => [s.batterySaver, s.nightProcessing] as const,
			pushGating,
			{ equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
		),
	);

	// Pipeline boots when onboarding completes (or immediately if it already has).
	bootPipelineOnce();
	teardowns.push(
		useSettingsStore.subscribe(
			(s) => s.onboardingCompleted,
			(completed) => {
				if (completed) bootPipelineOnce();
			},
		),
	);
}

export function stopAppServices(): void {
	if (!running) return;
	running = false;
	pipelineBooted = false;
	for (const teardown of teardowns.reverse()) {
		try {
			teardown();
		} catch (error) {
			console.warn("bootstrap: teardown failed", error);
		}
	}
	teardowns = [];
}
