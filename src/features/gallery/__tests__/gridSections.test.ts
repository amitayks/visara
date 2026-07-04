import { describe, expect, it } from "@jest/globals";
import type { MediaFile } from "@models/MediaFile";
import {
	buildGridData,
	type GridItem,
	granularityForColumns,
	nextZoomLevel,
	zoomDirectionForScale,
} from "../gridSections";

function fakeMedia(
	id: string,
	creationDate: number,
	mimeType = "image/jpeg",
): MediaFile {
	return { id, creationDate, mimeType } as unknown as MediaFile;
}

// Fixed "now": July 4, 2026 at noon local time.
const NOW = new Date(2026, 6, 4, 12, 0, 0);
const TODAY = new Date(2026, 6, 4, 9, 30).getTime();
const TODAY_LATER = new Date(2026, 6, 4, 8, 0).getTime();
const YESTERDAY = new Date(2026, 6, 3, 20, 15).getTime();
const OLDER = new Date(2026, 5, 20, 10, 0).getTime();
const OLDER_SAME_MONTH = new Date(2026, 5, 1, 10, 0).getTime();

function headerLabels(items: GridItem[]): string[] {
	return items
		.filter((item) => item.type === "header")
		.map((item) => (item.type === "header" ? item.label : ""));
}

describe("buildGridData", () => {
	it("emits Today / Yesterday / full-date headers at day granularity", () => {
		const media = [
			fakeMedia("a", TODAY),
			fakeMedia("b", TODAY_LATER),
			fakeMedia("c", YESTERDAY),
			fakeMedia("d", OLDER),
		];

		const items = buildGridData(media, "day", NOW);

		expect(headerLabels(items)).toEqual([
			"Today",
			"Yesterday",
			"June 20, 2026",
		]);
		expect(items.map((item) => item.type)).toEqual([
			"header",
			"media",
			"media",
			"header",
			"media",
			"header",
			"media",
		]);
	});

	it("flat mode (null granularity) emits no headers and unique keys for interleaved dates", () => {
		// Rank-ordered search results: dates interleave (Today, older, Today).
		const media = [
			fakeMedia("a", TODAY),
			fakeMedia("b", OLDER),
			fakeMedia("c", TODAY_LATER),
		];

		const items = buildGridData(media, null, NOW);

		expect(headerLabels(items)).toEqual([]);
		expect(items.map((item) => item.type)).toEqual(["media", "media", "media"]);
		const keys = items.map((item) => item.key);
		expect(new Set(keys).size).toBe(keys.length); // no duplicate/colliding keys
		expect(items.map((i) => (i.type === "media" ? i.mediaIndex : -1))).toEqual([
			0, 1, 2,
		]);
	});

	it("groups by month-year at month granularity", () => {
		const media = [
			fakeMedia("a", TODAY),
			fakeMedia("b", YESTERDAY),
			fakeMedia("c", OLDER),
			fakeMedia("d", OLDER_SAME_MONTH),
		];

		const items = buildGridData(media, "month", NOW);

		expect(headerLabels(items)).toEqual(["July 2026", "June 2026"]);
	});

	it("tracks per-section counts on the header items", () => {
		const media = [
			fakeMedia("a", TODAY),
			fakeMedia("b", TODAY_LATER),
			fakeMedia("c", YESTERDAY),
		];

		const items = buildGridData(media, "day", NOW);
		const headers = items.filter((item) => item.type === "header");

		expect(headers).toHaveLength(2);
		expect(headers[0]).toMatchObject({ label: "Today", count: 2 });
		expect(headers[1]).toMatchObject({ label: "Yesterday", count: 1 });
	});

	it("assigns each media item its index in the source array (viewer start index)", () => {
		const media = [
			fakeMedia("a", TODAY),
			fakeMedia("b", YESTERDAY),
			fakeMedia("c", OLDER),
		];

		const items = buildGridData(media, "day", NOW);
		const mediaItems = items.filter((item) => item.type === "media");

		expect(
			mediaItems.map((item) =>
				item.type === "media" ? [item.media.id, item.mediaIndex] : null,
			),
		).toEqual([
			["a", 0],
			["b", 1],
			["c", 2],
		]);
	});

	it("uses stable per-bucket keys and item ids as keys", () => {
		const media = [fakeMedia("a", TODAY), fakeMedia("b", YESTERDAY)];

		const first = buildGridData(media, "day", NOW);
		const second = buildGridData([...media], "day", NOW);

		expect(first.map((item) => item.key)).toEqual(
			second.map((item) => item.key),
		);
		expect(first[1]).toMatchObject({ key: "a" });
	});

	it("returns an empty array for an empty library", () => {
		expect(buildGridData([], "day", NOW)).toEqual([]);
	});
});

describe("granularityForColumns", () => {
	it("is day-level at 3 and 4 columns and month-level at 11", () => {
		expect(granularityForColumns(3)).toBe("day");
		expect(granularityForColumns(4)).toBe("day");
		expect(granularityForColumns(11)).toBe("month");
	});
});

describe("nextZoomLevel", () => {
	it("steps toward larger cells on pinch-out: 11 → 4 → 3, clamped at 3", () => {
		expect(nextZoomLevel(11, "in")).toBe(4);
		expect(nextZoomLevel(4, "in")).toBe(3);
		expect(nextZoomLevel(3, "in")).toBe(3);
	});

	it("steps toward smaller cells on pinch-in: 3 → 4 → 11, clamped at 11", () => {
		expect(nextZoomLevel(3, "out")).toBe(4);
		expect(nextZoomLevel(4, "out")).toBe(11);
		expect(nextZoomLevel(11, "out")).toBe(11);
	});
});

describe("zoomDirectionForScale", () => {
	it("maps scale past the thresholds to a step and the dead zone to null", () => {
		expect(zoomDirectionForScale(1.5)).toBe("in");
		expect(zoomDirectionForScale(0.5)).toBe("out");
		expect(zoomDirectionForScale(1.2)).toBeNull();
		expect(zoomDirectionForScale(0.8)).toBeNull();
		expect(zoomDirectionForScale(1)).toBeNull();
	});
});
