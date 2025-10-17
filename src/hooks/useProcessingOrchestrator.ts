/**
 * useProcessingOrchestrator Hook
 *
 * Connects ProcessingOrchestrator with ProcessingContext for UI updates.
 * This hook:
 * 1. Initializes the ProcessingOrchestrator on mount (when shouldInitialize=true)
 * 2. Sets up callbacks to update ProcessingContext state
 * 3. Provides control methods (pause/resume/stop)
 * 4. Cleans up on unmount
 *
 * IMPORTANT: Only initialize after:
 * - Onboarding is complete
 * - Storage permissions are granted
 * - Database is ready
 *
 * Usage:
 * ```tsx
 * function App() {
 *   const shouldInit = onboardingComplete && dbReady;
 *   useProcessingOrchestrator(shouldInit);
 *
 *   // Access processing state from context
 *   const { state } = useProcessing();
 *   console.log(state.currentProgress);
 * }
 * ```
 */

import { useProcessing } from "@contexts/ProcessingContext";
import { ProcessingQueueRepository } from "@services/database/ProcessingQueueRepository";
import { ProcessingOrchestrator } from "@services/orchestrator/ProcessingOrchestrator";
import { useCallback, useEffect, useRef } from "react";

export interface UseProcessingOrchestratorReturn {
	isInitialized: boolean;
	pause: () => void;
	resume: () => void;
	stop: () => void;
}

/**
 * Hook to connect ProcessingOrchestrator with ProcessingContext
 *
 * @param shouldInitialize - Whether to initialize (waits for permissions + onboarding)
 */
export function useProcessingOrchestrator(
	shouldInitialize = true,
): UseProcessingOrchestratorReturn {
	const { dispatch } = useProcessing();
	const isInitializedRef = useRef(false);

	/**
	 * Pause processing
	 */
	const pause = useCallback(() => {
		ProcessingOrchestrator.pause();
		dispatch({ type: "SET_PAUSED", payload: true });
	}, [dispatch]);

	/**
	 * Resume processing
	 */
	const resume = useCallback(() => {
		ProcessingOrchestrator.resume();
		dispatch({ type: "SET_PAUSED", payload: false });
		dispatch({ type: "START_PROCESSING" });
	}, [dispatch]);

	/**
	 * Stop processing
	 */
	const stop = useCallback(() => {
		ProcessingOrchestrator.stop();
		dispatch({ type: "STOP_PROCESSING" });
	}, [dispatch]);

	/**
	 * Initialize orchestrator on mount (only if shouldInitialize is true)
	 */
	useEffect(() => {
		// Don't initialize if flag is false or already initialized
		if (!shouldInitialize || isInitializedRef.current) {
			return;
		}

		console.log("🔄 ProcessingOrchestrator: Initializing...");

		const initializeOrchestrator = async () => {
			try {
				await ProcessingOrchestrator.initialize({
					batchSize: 100,
					throttleMs: 5000,
					onProgress: (current, total, fileName) => {
						// Update progress in context
						dispatch({
							type: "UPDATE_PROGRESS",
							payload: {
								current,
								total,
								currentFileName: fileName,
							},
						});
					},
					onComplete: async (total) => {
						// Processing scan/batch complete
						console.log(`Processing batch complete: ${total} items discovered`);

						// Update queue from database
						const queue = await ProcessingQueueRepository.getPending();
						dispatch({ type: "SET_PROCESSING_QUEUE", payload: queue });

						// Stop processing indicator
						dispatch({ type: "STOP_PROCESSING" });
					},
					onError: (error) => {
						// Handle errors
						console.error("Processing error:", error);

						// You could add error to failed files or show notification
						// For now, just log it
					},
				});

				// Mark as processing started
				dispatch({ type: "START_PROCESSING" });

				isInitializedRef.current = true;
			} catch (error) {
				console.error("Failed to initialize ProcessingOrchestrator:", error);
			}
		};

		initializeOrchestrator();

		// Cleanup on unmount
		return () => {
			if (isInitializedRef.current) {
				ProcessingOrchestrator.shutdown();
				isInitializedRef.current = false;
			}
		};
	}, [shouldInitialize, dispatch]);

	/**
	 * Poll for queue updates
	 * This ensures UI stays in sync with database changes
	 */
	useEffect(() => {
		const pollInterval = setInterval(async () => {
			if (ProcessingOrchestrator.getIsProcessing()) {
				const queue = await ProcessingQueueRepository.getPending();
				dispatch({ type: "SET_PROCESSING_QUEUE", payload: queue });

				// Get failed files
				const failed = await ProcessingQueueRepository.getFailed();
				const failedFiles = failed.map((item) => ({
					mediaFileId: item.mediaFileId,
					fileName: item.errorMessage || "Unknown file",
					errorMessage: item.errorMessage || "Processing failed",
					timestamp: item.createdAt.getTime(),
				}));

				// Update failed files in context
				dispatch({ type: "CLEAR_FAILED_FILES" });
				for (const failedFile of failedFiles) {
					dispatch({ type: "ADD_FAILED_FILE", payload: failedFile });
				}
			}
		}, 2000); // Poll every 2 seconds

		return () => clearInterval(pollInterval);
	}, [dispatch]);

	return {
		isInitialized: isInitializedRef.current,
		pause,
		resume,
		stop,
	};
}
