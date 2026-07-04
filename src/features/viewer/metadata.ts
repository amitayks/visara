/**
 * Current-item metadata loading for the viewer Info sheet.
 *
 * The spec requires REAL persisted label confidences (never placeholders).
 * `@utils/photoActions.loadMediaMetadata` returns label strings only, so the
 * labels are read from LabelRepository (an explicitly allowed read path) and
 * mapped to DisplayLabel with their stored confidence; photoActions stays the
 * source for the OCR text block.
 */

import { LabelRepository } from "@services/database/LabelRepository";
import type { DisplayLabel } from "@shared-types/display";
import { loadMediaMetadata } from "@utils/photoActions";

export interface ViewerMetadata {
	labels: DisplayLabel[];
	ocrText: string | null;
}

/**
 * Loads labels (with real confidence, deduped per label text keeping the
 * highest-confidence row, sorted descending) plus the OCR text.
 */
export async function loadViewerMetadata(
	mediaId: string,
): Promise<ViewerMetadata> {
	const [labelRows, base] = await Promise.all([
		LabelRepository.findByMediaFileId(mediaId),
		loadMediaMetadata(mediaId),
	]);

	const byText = new Map<string, DisplayLabel>();
	for (const row of labelRows) {
		const existing = byText.get(row.label);
		if (!existing || row.confidence > existing.confidence) {
			byText.set(row.label, {
				id: row.id,
				label: row.label,
				confidence: row.confidence,
				source: row.source,
				type: row.type,
			});
		}
	}
	const labels = [...byText.values()].sort(
		(a, b) => b.confidence - a.confidence,
	);

	return { labels, ocrText: base.ocrText };
}
