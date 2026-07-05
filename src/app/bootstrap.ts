import {
	GemmaModelDeliveryService,
	initializeBackend,
	LibrarySync,
	Pipeline,
	requestMediaAccess,
} from "@backend/facade";
import { attachModelStore } from "@state/modelStore";
import { useProcessingStore } from "@state/processingStore";
import { useSettingsStore } from "@state/settingsStore";

/**
 * Headless bootstrap (orchestrator-gallery-bridge spec, v2): the single
 * sanctioned seam between the backend and UI state. Boot order per
 * services-ui-facade: subscriptions → delivery init (not awaited) → access
 * request → LibrarySync.start() (discovery-first gate) → Pipeline.start().
 * The backend never imports React; this module never renders.
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
			// One-shot backend init: legacy cleanup + temp sweep + composition.
			await initializeBackend();

			// Reconcile/re-attach only — never auto-starts a transfer, independent
			// of media permissions, so fire-and-forget ahead of the boot chain.
			void GemmaModelDeliveryService.initialize();

			const permission = await requestMediaAccess();
			setPermissionState(permission);
			if (permission === "denied") {
				// Surfaced state (no silent abort). A later grant retries via
				// retryPermissions() without an app restart.
				pipelineBooted = false;
				return;
			}

			// Discovery-first (library-discovery-first spec): the ENTIRE library
			// is discovered, visible, and reconciled before the pipeline may
			// admit a single item. LibrarySync keeps observing after start().
			await LibrarySync.start();
			teardowns.push(() => LibrarySync.stop());

			await Pipeline.start();
			teardowns.push(() => {
				void Pipeline.stop();
			});
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

	// Pipeline events -> processing store (exact event-map contract preserved).
	useProcessingStore.getState().seed(Pipeline.getSnapshot());
	teardowns.push(
		Pipeline.subscribe((event) => {
			useProcessingStore.getState().applyEvent(event);
		}),
	);

	// Model delivery state -> model store (emit-on-subscribe).
	teardowns.push(attachModelStore());

	// Settings -> drain gating, now and on every change (single-writer keys).
	const pushGating = () => {
		const s = useSettingsStore.getState();
		Pipeline.updateSettings({
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
