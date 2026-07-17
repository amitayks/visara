/**
 * Current-item metadata loading for the viewer Info sheet (v2 backend):
 * Gemma enrichment tags (open-vocabulary, unscored) plus the transcribed
 * in-photo text. Empty values for un-enriched media, never throws.
 */

import { loadMediaMetadata } from "@backend/facade";
import type { DisplayLabel } from "@shared-types/display";

export interface ViewerMetadata {
	labels: DisplayLabel[];
	ocrText: string | null;
	caption: string | null;
	description: string | null;
}

export async function loadViewerMetadata(
	mediaId: string,
): Promise<ViewerMetadata> {
	try {
		const meta = await loadMediaMetadata(mediaId);
		const labels: DisplayLabel[] = meta.labels.map((tag) => ({
			id: `${mediaId}:${tag}`,
			label: tag,
			source: "gemma",
			type: "tag",
		}));
		return {
			labels,
			ocrText: meta.ocrText,
			caption: meta.caption,
			description: meta.description,
		};
	} catch (error) {
		console.warn("viewer: metadata load failed", error);
		return { labels: [], ocrText: null, caption: null, description: null };
	}
}
