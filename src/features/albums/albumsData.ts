/**
 * Albums data layer — live page/detail data sourced through the repositories
 * and invalidated by a throttled WatermelonDB table signal. The repos expose
 * no observe() for labels/album_media, so `database.withChangesForTables` is
 * the read-only reactive signal (design D2: WatermelonDB stays the reactive
 * source of truth); all reads still go through the repositories.
 */

import type { Album } from "@models/Album";
import type { MediaFile } from "@models/MediaFile";
import { AlbumRepository } from "@services/database/AlbumRepository";
import { database } from "@services/database/database";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { useEffect, useState } from "react";
import {
	getSmartAlbumMediaIds,
	SMART_ALBUMS,
	type SmartAlbumDef,
} from "./smartAlbums";

const SIGNAL_THROTTLE_MS = 300;

export const ALBUMS_PAGE_TABLES: readonly string[] = [
	"albums",
	"album_media",
	"labels",
	"media_files",
];
export const CUSTOM_DETAIL_TABLES: readonly string[] = [
	"albums",
	"album_media",
];
export const SMART_DETAIL_TABLES: readonly string[] = ["labels"];

/**
 * Bumps a version counter (trailing-throttled) whenever any of the given
 * tables change. The `withChangesForTables` startWith(null) primer emission
 * is skipped — mount-time loads cover the initial state.
 */
export function useTableVersion(tables: readonly string[]): number {
	const [version, setVersion] = useState(0);

	useEffect(() => {
		let first = true;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const subscription = database
			.withChangesForTables([...tables])
			.subscribe(() => {
				if (first) {
					first = false;
					return;
				}
				if (timer === null) {
					timer = setTimeout(() => {
						timer = null;
						setVersion((v) => v + 1);
					}, SIGNAL_THROTTLE_MS);
				}
			});

		return () => {
			if (timer !== null) {
				clearTimeout(timer);
			}
			subscription.unsubscribe();
		};
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
			const members = visibleOnly(
				await MediaFileRepository.findByIds([...ids]),
			);
			members.sort((a, b) => b.creationDate - a.creationDate);
			return { def, count: members.length, coverUri: coverOf(members[0]) };
		}),
	);
}

async function loadCustomEntries(): Promise<CustomAlbumEntry[]> {
	const albums = await AlbumRepository.getManualAlbums();
	return await Promise.all(
		albums.map(async (album) => {
			const members = visibleOnly(
				await AlbumRepository.getMediaFilesInAlbum(album.id),
			);
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
 * albums/album_media/labels/media_files change, throttled.
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
 * smart label predicate). The screen intersects it with useVisibleMedia so
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
						AlbumRepository.findById(albumId),
						AlbumRepository.getMediaFilesInAlbum(albumId),
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
	const existing = await AlbumRepository.getManualAlbums();
	const sortOrder =
		existing.reduce((max, album) => Math.max(max, album.sortOrder), -1) + 1;
	return await AlbumRepository.create({ name, isSmart: false, sortOrder });
}

/**
 * Persists the displayed order into `Album.sortOrder` (index positions),
 * skipping rows already in place. Sequential repo writes — the WatermelonDB
 * writer queue serializes them; never wrapped in our own database.write.
 */
export async function persistAlbumOrder(
	albums: readonly Album[],
): Promise<void> {
	for (let index = 0; index < albums.length; index++) {
		const album = albums[index];
		if (album.sortOrder !== index) {
			await AlbumRepository.update(album, { sortOrder: index });
		}
	}
}

/**
 * Adds a photo to a custom album unless it is already a member (spec:
 * re-adding is idempotent). Returns whether a membership was created.
 */
export async function addMediaToAlbumIdempotent(
	albumId: string,
	mediaFileId: string,
): Promise<boolean> {
	const memberships = await AlbumRepository.getAlbumsForMediaFile(mediaFileId);
	if (memberships.some((album) => album.id === albumId)) {
		return false;
	}
	await AlbumRepository.addMultipleMediaToAlbum(albumId, [mediaFileId]);
	return true;
}
