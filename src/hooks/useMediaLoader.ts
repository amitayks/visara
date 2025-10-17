/**
 * useMediaLoader Hook
 *
 * Loads media files from WatermelonDB and keeps GalleryContext in sync.
 * Uses reactive queries to automatically update when files are added/removed/updated.
 *
 * IMPORTANT: This hook MUST only be called after:
 * 1. Onboarding is complete
 * 2. Storage permissions are granted
 * 3. Database is initialized
 *
 * Usage:
 * ```tsx
 * // In App.tsx or MainScreen (after permissions granted)
 * useMediaLoader(shouldLoad);
 * ```
 *
 * Constitutional alignment:
 * - Performance & Optimization Standards: Reactive queries prevent unnecessary re-renders
 * - User Experience Excellence: Auto-updates UI when media changes
 * - Code Quality & Architecture: Separation of concerns
 */

import { useGallery } from "@contexts/GalleryContext";
import type { MediaFile } from "@models/MediaFile";
import { database } from "@services/database/database";
import { useEffect, useRef } from "react";

/**
 * Hook to load and subscribe to media files from database
 *
 * @param shouldLoad - Whether to start loading (waits for permissions + onboarding)
 */
export function useMediaLoader(shouldLoad = true) {
	const { dispatch } = useGallery();
	const isSubscribedRef = useRef(false);

	useEffect(() => {
		// Don't load if flag is false or already subscribed
		if (!shouldLoad || isSubscribedRef.current) {
			return;
		}

		console.log("📸 MediaLoader: Starting media file subscription...");

		// Mark as loading
		dispatch({ type: "SET_LOADING", payload: true });

		// Subscribe to MediaFile collection changes
		// WatermelonDB observe() is reactive - updates automatically on DB changes
		const subscription = database
			.get<MediaFile>("media_files")
			.query()
			.observe()
			.subscribe({
				next: (mediaFiles) => {
					console.log(`📸 MediaLoader: Loaded ${mediaFiles.length} media files`);

					// Update GalleryContext with new files
					dispatch({ type: "SET_MEDIA_FILES", payload: mediaFiles });
				},
				error: (error) => {
					console.error("❌ MediaLoader: Failed to load media files:", error);
					dispatch({
						type: "SET_ERROR",
						payload: "Failed to load media files from database",
					});
				},
			});

		isSubscribedRef.current = true;

		// Cleanup subscription on unmount
		return () => {
			console.log("📸 MediaLoader: Unsubscribing from media files...");
			subscription.unsubscribe();
			isSubscribedRef.current = false;
		};
	}, [shouldLoad, dispatch]);
}
