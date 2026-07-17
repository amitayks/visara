/**
 * THE ONLY entry into the photo viewer (gallery-experience spec): snapshot
 * the launching dataset into viewerStore, then present the transparent-modal
 * route. Callers pass whatever dataset they display (gallery order, document
 * filter, search results, album contents) — the viewer pages strictly within
 * it and never falls back to the unfiltered library.
 */

import { navigate } from "@app/navigation";
import type { MediaRow as MediaFile } from "@backend/types";
import { useViewerStore } from "@state/viewerStore";

export function openPhotoViewer(items: MediaFile[], index: number): void {
	if (items.length === 0) return;
	useViewerStore.getState().open(items, index);
	navigate("PhotoViewer");
}
