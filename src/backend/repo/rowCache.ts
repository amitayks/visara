import type { MediaRow } from "@backend/types";

/**
 * Reference-stable row emissions (design D6, ui-state-management spec):
 * a row whose consumed fields did not change between two feed emissions must
 * be the SAME object reference so existing `React.memo` grid cells keep
 * skipping. Pure logic — jest-covered without op-sqlite.
 */

const MEDIA_ROW_KEYS: readonly (keyof MediaRow)[] = [
	"id",
	"uri",
	"thumbnailUri",
	"filename",
	"mimeType",
	"creationDate",
	"isHidden",
	"isProcessed",
	"width",
	"height",
	"fileSize",
	"kind",
	"enrichStatus",
];

/** Shallow equality over every MediaRow field. */
export function mediaRowEquals(a: MediaRow, b: MediaRow): boolean {
	for (const key of MEDIA_ROW_KEYS) {
		if (!Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
}

/**
 * Maps `next` onto a stable array: any row shallow-equal to the previous
 * emission's row with the same id is replaced by that previous object; rows
 * that changed (or are new) stay as the fresh objects. If every position
 * resolves to the identical object of `prev` (same order, same length), the
 * `prev` ARRAY itself is returned so callers can skip setState entirely.
 */
export function asStableRows(prev: MediaRow[], next: MediaRow[]): MediaRow[] {
	if (prev.length === 0 && next.length === 0) {
		return prev;
	}
	const prevById = new Map<string, MediaRow>();
	for (const row of prev) {
		prevById.set(row.id, row);
	}
	let identical = prev.length === next.length;
	const out: MediaRow[] = new Array(next.length);
	for (let i = 0; i < next.length; i++) {
		const fresh = next[i];
		const previous = prevById.get(fresh.id);
		const chosen =
			previous !== undefined && mediaRowEquals(previous, fresh)
				? previous
				: fresh;
		out[i] = chosen;
		if (identical && prev[i] !== chosen) {
			identical = false;
		}
	}
	return identical ? prev : out;
}

/** Stateful wrapper holding the previous emission (one per feed instance). */
export class RowCache {
	private previous: MediaRow[] = [];

	/** Stabilizes `next` against the last emission and remembers the result. */
	apply(next: MediaRow[]): MediaRow[] {
		this.previous = asStableRows(this.previous, next);
		return this.previous;
	}

	reset(): void {
		this.previous = [];
	}
}
