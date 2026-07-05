import { asStableRows, mediaRowEquals, RowCache } from "@backend/repo/rowCache";
import type { MediaRow } from "@backend/types";
import { describe, expect, it } from "@jest/globals";

function makeRow(overrides: Partial<MediaRow> & { id: string }): MediaRow {
	return {
		uri: `ph://${overrides.id}`,
		thumbnailUri: null,
		filename: `${overrides.id}.jpg`,
		mimeType: "image/jpeg",
		creationDate: 1_700_000_000_000,
		isHidden: false,
		isProcessed: false,
		width: 4032,
		height: 3024,
		fileSize: 2_048_000,
		kind: "image",
		enrichStatus: "pending",
		...overrides,
	};
}

describe("mediaRowEquals", () => {
	it("is true for value-equal rows and false when any field differs", () => {
		const a = makeRow({ id: "1" });
		expect(mediaRowEquals(a, makeRow({ id: "1" }))).toBe(true);
		expect(mediaRowEquals(a, makeRow({ id: "1", isProcessed: true }))).toBe(
			false,
		);
		expect(mediaRowEquals(a, makeRow({ id: "1", fileSize: 1 }))).toBe(false);
		expect(mediaRowEquals(a, makeRow({ id: "1", enrichStatus: "done" }))).toBe(
			false,
		);
	});
});

describe("asStableRows", () => {
	it("reuses previous objects for unchanged rows", () => {
		const prev = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const next = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const out = asStableRows(prev, next);
		expect(out[0]).toBe(prev[0]);
		expect(out[1]).toBe(prev[1]);
	});

	it("returns the previous ARRAY when nothing changed at all", () => {
		const prev = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const next = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		expect(asStableRows(prev, next)).toBe(prev);
	});

	it("emits a fresh object only for the changed row", () => {
		const prev = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const changed = makeRow({
			id: "a",
			isProcessed: true,
			enrichStatus: "done",
		});
		const next = [changed, makeRow({ id: "b" })];
		const out = asStableRows(prev, next);
		expect(out).not.toBe(prev);
		expect(out[0]).toBe(changed);
		expect(out[0]).not.toBe(prev[0]);
		expect(out[1]).toBe(prev[1]);
	});

	it("keeps identity for survivors when a row is added", () => {
		const prev = [makeRow({ id: "a" })];
		const added = makeRow({ id: "new" });
		const out = asStableRows(prev, [added, makeRow({ id: "a" })]);
		expect(out).toHaveLength(2);
		expect(out[0]).toBe(added);
		expect(out[1]).toBe(prev[0]);
	});

	it("keeps identity for survivors when a row is removed", () => {
		const prev = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const out = asStableRows(prev, [makeRow({ id: "b" })]);
		expect(out).toHaveLength(1);
		expect(out[0]).toBe(prev[1]);
	});

	it("returns a new array on pure reorder but keeps row identity", () => {
		const prev = [makeRow({ id: "a" }), makeRow({ id: "b" })];
		const out = asStableRows(prev, [
			makeRow({ id: "b" }),
			makeRow({ id: "a" }),
		]);
		expect(out).not.toBe(prev);
		expect(out[0]).toBe(prev[1]);
		expect(out[1]).toBe(prev[0]);
	});

	it("returns the same empty array for empty → empty", () => {
		const prev: MediaRow[] = [];
		expect(asStableRows(prev, [])).toBe(prev);
	});
});

describe("RowCache", () => {
	it("stabilizes across successive emissions", () => {
		const cache = new RowCache();
		const first = cache.apply([makeRow({ id: "a" }), makeRow({ id: "b" })]);

		// Same values → same array back.
		const second = cache.apply([makeRow({ id: "a" }), makeRow({ id: "b" })]);
		expect(second).toBe(first);

		// One row changes → survivors keep identity, changed row is fresh.
		const third = cache.apply([
			makeRow({ id: "a" }),
			makeRow({ id: "b", isProcessed: true, enrichStatus: "done" }),
		]);
		expect(third).not.toBe(second);
		expect(third[0]).toBe(first[0]);
		expect(third[1]).not.toBe(first[1]);

		// The changed object is now the cached identity for the next round.
		const fourth = cache.apply([
			makeRow({ id: "a" }),
			makeRow({ id: "b", isProcessed: true, enrichStatus: "done" }),
		]);
		expect(fourth).toBe(third);
	});

	it("reset() drops all cached identities", () => {
		const cache = new RowCache();
		const first = cache.apply([makeRow({ id: "a" })]);
		cache.reset();
		const second = cache.apply([makeRow({ id: "a" })]);
		expect(second).not.toBe(first);
		expect(second[0]).not.toBe(first[0]);
	});
});
