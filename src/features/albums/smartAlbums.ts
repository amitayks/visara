/**
 * Smart albums (albums-experience spec): fixed, non-editable predicates over
 * AI-assigned tags. Membership derives exclusively from the enrichment tags;
 * smart albums are never renameable, deletable, or manually curated, and a
 * zero-count smart album is hidden from the Albums page.
 */

import { getSmartAlbumMediaIdsByPatterns } from "@backend/facade";

export interface SmartAlbumDef {
	/** Stable route key — the pinned `smartLabel` AlbumDetail param value. */
	key: string;
	title: string;
	/** Material Design Icons glyph name for the cover placeholder. */
	icon: string;
	/**
	 * Substring patterns evaluated against the enrichment tags via SQLite
	 * LIKE (ASCII case-insensitive). A media file matches the album when ANY
	 * pattern matches ANY of its Gemma tags.
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
 * Media-file ids matching a smart album's tag predicate (union over the
 * album's patterns). The backend already excludes hidden/deleted media.
 */
export async function getSmartAlbumMediaIds(
	def: SmartAlbumDef,
): Promise<Set<string>> {
	return await getSmartAlbumMediaIdsByPatterns(def.patterns);
}
