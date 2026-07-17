/**
 * Albums data layer — live page/detail data sourced through the backend
 * facade and invalidated by the backend's table-invalidation bus (v2:
 * op-sqlite storage, sqlite-storage-core spec). All reads go through the
 * facade; the bus is the read-only reactive signal.
 */

import { invalidationBus } from "@backend/db/invalidation";
import {
	addMediaToAlbum,
	createAlbum,
	findAlbumById,
	getAlbumMediaRows,
	getAlbumsForMedia,
	getManualAlbums,
	getMediaRowsByIds,
	updateAlbum,
} from "@backend/facade";
import type {
	AlbumRow as Album,
	MediaRow as MediaFile,
	WatchedTable,
} from "@backend/types";
import { useEffect, useState } from "react";
import {
	getSmartAlbumMediaIds,
	SMART_ALBUMS,
	type SmartAlbumDef,
} from "./smartAlbums";

export const ALBUMS_PAGE_TABLES: readonly WatchedTable[] = [
	"albums",
	"enrichment",
	"media",
];
export const CUSTOM_DETAIL_TABLES: readonly WatchedTable[] = ["albums"];
export const SMART_DETAIL_TABLES: readonly WatchedTable[] = ["enrichment"];

/**
 * Bumps a version counter whenever any of the given tables change (the bus
 * throttles trailing-edge internally, ~250 ms).
 */
export function useTableVersion(tables: readonly WatchedTable[]): number {
	const [version, setVersion] = useState(0);

	useEffect(() => {
		const unwatch = invalidationBus.watch([...tables], () => {
			setVersion((v) => v + 1);
		});
		return unwatch;
	}, [tables]);

	return version;
}

export interface SmartAlbumEntry {
	def: SmartAlbumDef;
	count: number;
	coverUri: string | null;
}

/** `id` satisfies reanimated-dnd's SortableData contract. */
export interface CustomAlbumEntry {
	id: string;
	album: Album;
	count: number;
	coverUri: string | null;
}

export interface AlbumsPageData {
	smart: SmartAlbumEntry[];
	custom: CustomAlbumEntry[];
	ready: boolean;
}

function coverOf(media: MediaFile | undefined): string | null {
	if (!media) {
		return null;
	}
	return media.thumbnailUri ?? media.uri;
}

/** Hidden media never count toward albums nor appear in their grids. */
function visibleOnly(files: MediaFile[]): MediaFile[] {
	return files.filter((file) => !file.isHidden);
}

async function loadSmartEntries(): Promise<SmartAlbumEntry[]> {
	return await Promise.all(
		SMART_ALBUMS.map(async (def) => {
			const ids = await getSmartAlbumMediaIds(def);
			const members = visibleOnly(await hydrateByIds([...ids]));
			members.sort((a, b) => b.creationDate - a.creationDate);
			return { def, count: members.length, coverUri: coverOf(members[0]) };
		}),
	);
}

async function loadCustomEntries(): Promise<CustomAlbumEntry[]> {
	const albums = await getManualAlbums();
	return await Promise.all(
		albums.map(async (album) => {
			const members = visibleOnly(await getAlbumMediaRows(album.id));
			// Oldest first: the album's first member fronts the cover.
			members.sort((a, b) => a.creationDate - b.creationDate);
			return {
				id: album.id,
				album,
				count: members.length,
				coverUri: coverOf(members[0]),
			};
		}),
	);
}

/**
 * Live Albums-page dataset: smart-album entries (counts vs the visible
 * library) + custom albums in persisted sortOrder. Recomputes on any
 * albums/enrichment/media change, throttled by the bus.
 */
export function useAlbumsPageData(): AlbumsPageData {
	const version = useTableVersion(ALBUMS_PAGE_TABLES);
	const [data, setData] = useState<AlbumsPageData>({
		smart: [],
		custom: [],
		ready: false,
	});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [smart, custom] = await Promise.all([
					loadSmartEntries(),
					loadCustomEntries(),
				]);
				if (!cancelled) {
					setData({ smart, custom, ready: true });
				}
			} catch (error) {
				console.warn("albums: page data load failed", error);
				if (!cancelled) {
					setData((prev) => ({ ...prev, ready: true }));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [version]);

	return data;
}

export interface AlbumDetailSource {
	/** null while the membership set is still loading. */
	memberIds: ReadonlySet<string> | null;
	album: Album | null;
	smartDef: SmartAlbumDef | null;
}

/**
 * Live member-id set for an AlbumDetail route (custom membership rows OR
 * smart tag predicate). The screen intersects it with useVisibleMedia so
 * removed/hidden media drop out immediately.
 */
export function useAlbumDetailSource(
	albumId: string | undefined,
	smartDef: SmartAlbumDef | null,
): AlbumDetailSource {
	const version = useTableVersion(
		albumId ? CUSTOM_DETAIL_TABLES : SMART_DETAIL_TABLES,
	);
	const [memberIds, setMemberIds] = useState<ReadonlySet<string> | null>(null);
	const [album, setAlbum] = useState<Album | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				if (albumId) {
					const [record, members] = await Promise.all([
						findAlbumById(albumId),
						getAlbumMediaRows(albumId),
					]);
					if (cancelled) {
						return;
					}
					setAlbum(record);
					setMemberIds(new Set(members.map((member) => member.id)));
					return;
				}
				if (smartDef) {
					const ids = await getSmartAlbumMediaIds(smartDef);
					if (!cancelled) {
						setMemberIds(ids);
					}
					return;
				}
				if (!cancelled) {
					setMemberIds(new Set());
				}
			} catch (error) {
				console.warn("albums: detail load failed", error);
				if (!cancelled) {
					setMemberIds(new Set());
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [albumId, smartDef, version]);

	return { memberIds, album, smartDef };
}

/** Trimmed non-empty album name, or null when validation fails. */
export function normalizeAlbumName(raw: string): string | null {
	const name = raw.trim();
	return name.length > 0 ? name : null;
}

/** Creates a custom album appended at the end of the persisted order. */
export async function createCustomAlbum(name: string): Promise<Album> {
	const existing = await getManualAlbums();
	const sortOrder =
		existing.reduce((max, album) => Math.max(max, album.sortOrder), -1) + 1;
	return await createAlbum(name, sortOrder);
}

/**
 * Persists the displayed order into `sortOrder` (index positions), skipping
 * rows already in place.
 */
export async function persistAlbumOrder(
	albums: readonly Album[],
): Promise<void> {
	for (let index = 0; index < albums.length; index++) {
		const album = albums[index];
		if (album.sortOrder !== index) {
			await updateAlbum(album.id, { sortOrder: index });
		}
	}
}

/**
 * Adds a photo to a custom album unless it is already a member (spec:
 * re-adding is idempotent — the backend insert is OR IGNORE, the pre-check
 * preserves the "already added" UX signal).
 */
export async function addMediaToAlbumIdempotent(
	albumId: string,
	mediaFileId: string,
): Promise<boolean> {
	const memberships = await getAlbumsForMedia(mediaFileId);
	if (memberships.some((album) => album.id === albumId)) {
		return false;
	}
	await addMediaToAlbum(albumId, [mediaFileId]);
	return true;
}

/** Membership hydration helper shared by smart-album loaders. */
async function hydrateByIds(ids: string[]): Promise<MediaFile[]> {
	if (ids.length === 0) return [];
	return getMediaRowsByIds(ids);
}
