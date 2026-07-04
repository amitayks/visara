/**
 * Smart albums (albums-experience spec): fixed, non-editable predicates over
 * AI-assigned labels. Membership derives exclusively from the `labels` table;
 * smart albums are never renameable, deletable, or manually curated, and a
 * zero-count smart album is hidden from the Albums page.
 */

import { LabelRepository } from "@services/database/LabelRepository";

export interface SmartAlbumDef {
	/** Stable route key — the pinned `smartLabel` AlbumDetail param value. */
	key: string;
	title: string;
	/** Material Design Icons glyph name for the cover placeholder. */
	icon: string;
	/**
	 * Substring patterns evaluated against `labels.label` via SQLite LIKE
	 * (ASCII case-insensitive). A media file matches the album when ANY
	 * pattern matches ANY of its labels — mlkit and gemma sources alike.
	 */
	patterns: readonly string[];
}

export const SMART_ALBUMS: readonly SmartAlbumDef[] = [
	{
		key: "receipts",
		title: "Receipts",
		icon: "receipt",
		patterns: ["receipt", "invoice"],
	},
	{
		key: "screenshots",
		title: "Screenshots",
		icon: "cellphone-screenshot",
		patterns: ["screenshot", "screen shot"],
	},
	{
		key: "documents",
		title: "Documents",
		icon: "file-document-outline",
		patterns: ["document", "paperwork", "certificate", "contract"],
	},
	{
		key: "id-cards",
		title: "ID Cards",
		icon: "card-account-details-outline",
		patterns: [
			"id card",
			"identity card",
			"identity document",
			"passport",
			"driver license",
			"driving licence",
		],
	},
	{
		key: "handwritten-notes",
		title: "Handwritten Notes",
		icon: "text-recognition",
		patterns: ["handwrit", "manuscript"],
	},
];

export function findSmartAlbum(key: string): SmartAlbumDef | null {
	return SMART_ALBUMS.find((def) => def.key === key) ?? null;
}

/**
 * Media-file ids matching a smart album's label predicate (union over the
 * album's patterns). Visibility filtering (hidden/deleted media) is applied
 * by callers against the visible-media set.
 */
export async function getSmartAlbumMediaIds(
	def: SmartAlbumDef,
): Promise<Set<string>> {
	const perPattern = await Promise.all(
		def.patterns.map((pattern) => LabelRepository.findByLabelLike(pattern)),
	);
	const ids = new Set<string>();
	for (const labels of perPattern) {
		for (const label of labels) {
			ids.add(label.mediaFileId);
		}
	}
	return ids;
}
