/** biome-ignore-all lint/complexity/noStaticOnlyClass: its bother me */
import { Q } from "@nozbe/watermelondb";
import { database } from "./database";
import { Album } from "@models/Album";
import { AlbumMedia } from "@models/AlbumMedia";
import { MediaFile } from "@models/MediaFile";

export interface CreateAlbumData {
	name: string;
	description?: string;
	coverMediaId?: string;
	isSmart: boolean;
	smartCriteria?: string;
	sortOrder: number;
}

export interface UpdateAlbumData {
	name?: string;
	description?: string;
	coverMediaId?: string;
	smartCriteria?: string;
	sortOrder?: number;
}

export class AlbumRepository {
	static async create(data: CreateAlbumData): Promise<Album> {
		return await database.write(async () => {
			return await database.get<Album>("albums").create((album) => {
				album.name = data.name;
				album.description = data.description;
				album.coverMediaId = data.coverMediaId;
				album.isSmart = data.isSmart;
				album.smartCriteria = data.smartCriteria;
				album.sortOrder = data.sortOrder;
			});
		});
	}

	static async findById(id: string): Promise<Album | null> {
		try {
			return await database.get<Album>("albums").find(id);
		} catch {
			return null;
		}
	}

	static async findByName(name: string): Promise<Album | null> {
		const results = await database
			.get<Album>("albums")
			.query(Q.where("name", name))
			.fetch();
		return results[0] || null;
	}

	static async getAll(): Promise<Album[]> {
		return await database
			.get<Album>("albums")
			.query(Q.sortBy("sort_order", Q.asc))
			.fetch();
	}

	static async getSmartAlbums(): Promise<Album[]> {
		return await database
			.get<Album>("albums")
			.query(Q.where("is_smart", true), Q.sortBy("sort_order", Q.asc))
			.fetch();
	}

	static async getManualAlbums(): Promise<Album[]> {
		return await database
			.get<Album>("albums")
			.query(Q.where("is_smart", false), Q.sortBy("sort_order", Q.asc))
			.fetch();
	}

	static async update(album: Album, data: UpdateAlbumData): Promise<Album> {
		return await database.write(async () => {
			return await album.update((record) => {
				if (data.name !== undefined) record.name = data.name;
				if (data.description !== undefined)
					record.description = data.description;
				if (data.coverMediaId !== undefined)
					record.coverMediaId = data.coverMediaId;
				if (data.smartCriteria !== undefined)
					record.smartCriteria = data.smartCriteria;
				if (data.sortOrder !== undefined) record.sortOrder = data.sortOrder;
			});
		});
	}

	static async delete(album: Album): Promise<void> {
		await database.write(async () => {
			// Delete album_media relationships
			const albumMedia = await database
				.get<AlbumMedia>("album_media")
				.query(Q.where("album_id", album.id))
				.fetch();

			await Promise.all(albumMedia.map((am) => am.markAsDeleted()));

			// Delete album
			await album.markAsDeleted();
		});
	}

	static async addMediaToAlbum(
		albumId: string,
		mediaFileId: string,
		sortOrder: number,
	): Promise<AlbumMedia> {
		return await database.write(async () => {
			return await database.get<AlbumMedia>("album_media").create((am) => {
				am.albumId = albumId;
				am.mediaFileId = mediaFileId;
				am.sortOrder = sortOrder;
				am.addedAt = Date.now();
			});
		});
	}

	static async addMultipleMediaToAlbum(
		albumId: string,
		mediaFileIds: string[],
	): Promise<AlbumMedia[]> {
		return await database.write(async () => {
			// Get current highest sort order
			const existingMedia = await database
				.get<AlbumMedia>("album_media")
				.query(Q.where("album_id", albumId), Q.sortBy("sort_order", Q.desc))
				.fetch();

			let nextSortOrder =
				existingMedia.length > 0 ? existingMedia[0].sortOrder + 1 : 0;

			// Create all album_media records
			const albumMediaPromises = mediaFileIds.map((mediaFileId) => {
				const currentSortOrder = nextSortOrder;
				nextSortOrder += 1;
				return database.get<AlbumMedia>("album_media").create((am) => {
					am.albumId = albumId;
					am.mediaFileId = mediaFileId;
					am.sortOrder = currentSortOrder;
					am.addedAt = Date.now();
				});
			});

			return await Promise.all(albumMediaPromises);
		});
	}

	static async removeMediaFromAlbum(
		albumId: string,
		mediaFileId: string,
	): Promise<void> {
		const albumMedia = await database
			.get<AlbumMedia>("album_media")
			.query(
				Q.where("album_id", albumId),
				Q.where("media_file_id", mediaFileId),
			)
			.fetch();

		await database.write(async () => {
			await Promise.all(albumMedia.map((am) => am.markAsDeleted()));
		});
	}

	static async getMediaFilesInAlbum(albumId: string): Promise<MediaFile[]> {
		const albumMedia = await database
			.get<AlbumMedia>("album_media")
			.query(Q.where("album_id", albumId), Q.sortBy("sort_order", Q.asc))
			.fetch();

		const mediaFileIds = albumMedia.map((am) => am.mediaFileId);

		if (mediaFileIds.length === 0) return [];

		return await database
			.get<MediaFile>("media_files")
			.query(Q.where("id", Q.oneOf(mediaFileIds)))
			.fetch();
	}

	static async getAlbumsForMediaFile(mediaFileId: string): Promise<Album[]> {
		const albumMedia = await database
			.get<AlbumMedia>("album_media")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();

		const albumIds = albumMedia.map((am) => am.albumId);

		if (albumIds.length === 0) return [];

		return await database
			.get<Album>("albums")
			.query(Q.where("id", Q.oneOf(albumIds)))
			.fetch();
	}

	static async getMediaFileCountInAlbum(albumId: string): Promise<number> {
		return await database
			.get<AlbumMedia>("album_media")
			.query(Q.where("album_id", albumId))
			.fetchCount();
	}

	static observeAll() {
		return database
			.get<Album>("albums")
			.query(Q.sortBy("sort_order", Q.asc))
			.observe();
	}

	static observeSmartAlbums() {
		return database
			.get<Album>("albums")
			.query(Q.where("is_smart", true), Q.sortBy("sort_order", Q.asc))
			.observe();
	}

	static async count(): Promise<number> {
		return await database.get<Album>("albums").query().fetchCount();
	}
}
