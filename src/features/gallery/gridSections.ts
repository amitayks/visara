/**
 * Pure grid-data helpers for the gallery (gallery-experience spec).
 * Builds the flat [header | cell] dataset consumed by FlashList v2 in ONE
 * O(n) pass — each media item carries its dataset index so cells never scan
 * the array at render time (the old PhotoGrid ran findIndex per cell).
 */

import type { MediaFile } from "@models/MediaFile";
import type { GridZoomLevel } from "@state/settingsStore";

export const PDF_MIME_TYPE = "application/pdf";

export type SectionGranularity = "day" | "month";

export interface HeaderGridItem {
	type: "header";
	key: string;
	label: string;
	count: number;
}

export interface MediaGridItem {
	type: "media";
	key: string;
	media: MediaFile;
	/** Index within the displayed media array (viewer start index). */
	mediaIndex: number;
}

export type GridItem = HeaderGridItem | MediaGridItem;

/** Day headers at 3/4 columns, month-year headers at 11 (spec). */
export function granularityForColumns(
	columns: GridZoomLevel,
): SectionGranularity {
	return columns === 11 ? "month" : "day";
}

export type ZoomDirection = "in" | "out";

/**
 * Pinch-out ("in", larger cells): 11 → 4 → 3. Pinch-in ("out", smaller
 * cells): 3 → 4 → 11. Ends of the range clamp.
 */
export function nextZoomLevel(
	level: GridZoomLevel,
	direction: ZoomDirection,
): GridZoomLevel {
	if (direction === "in") {
		if (level === 11) return 4;
		return 3;
	}
	if (level === 3) return 4;
	return 11;
}

/** Maps a completed pinch scale to a zoom step; null inside the dead zone. */
export function zoomDirectionForScale(scale: number): ZoomDirection | null {
	if (scale > 1.2) return "in";
	if (scale < 0.8) return "out";
	return null;
}

function dayKey(date: Date): number {
	return (
		date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate()
	);
}

function monthKey(date: Date): number {
	return date.getFullYear() * 100 + (date.getMonth() + 1);
}

function formatMonth(date: Date): string {
	return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function formatDay(
	date: Date,
	bucket: number,
	todayKey: number,
	yesterdayKey: number,
): string {
	if (bucket === todayKey) return "Today";
	if (bucket === yesterdayKey) return "Yesterday";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/**
 * Single pass over the (newest-first) media array: emits a header whenever
 * the section bucket changes, then the cells of that section. Locale
 * formatting is cached per bucket so a 10k-item build formats each unique
 * day/month exactly once.
 */
export function buildGridData(
	media: readonly MediaFile[],
	// `null` = flat grid with no section headers, for rank-ordered datasets
	// (search results): interleaved dates would otherwise emit colliding
	// header keys and split section counts.
	granularity: SectionGranularity | null,
	now: Date = new Date(),
): GridItem[] {
	if (granularity === null) {
		return media.map((file, mediaIndex) => ({
			type: "media",
			key: file.id,
			media: file,
			mediaIndex,
		}));
	}

	const items: GridItem[] = [];
	const labelCache = new Map<number, string>();
	const todayKey = dayKey(now);
	const yesterdayKey = dayKey(
		new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
	);

	let currentHeader: HeaderGridItem | null = null;

	media.forEach((file, mediaIndex) => {
		const date = new Date(file.creationDate);
		const bucket = granularity === "month" ? monthKey(date) : dayKey(date);

		let label = labelCache.get(bucket);
		if (label === undefined) {
			label =
				granularity === "month"
					? formatMonth(date)
					: formatDay(date, bucket, todayKey, yesterdayKey);
			labelCache.set(bucket, label);
		}

		if (currentHeader === null || currentHeader.label !== label) {
			currentHeader = {
				type: "header",
				key: `header:${bucket}`,
				label,
				count: 0,
			};
			items.push(currentHeader);
		}

		currentHeader.count += 1;
		items.push({ type: "media", key: file.id, media: file, mediaIndex });
	});

	return items;
}
