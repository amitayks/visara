/**
 * @features/albums — pinned public surface (cross-agent interface contract):
 * AlbumsPage (pager page 1), AlbumDetail (route `AlbumDetail`, params
 * {albumId?, smartLabel?}), AddToAlbumSheetContent (viewer Info sheet).
 */

export {
	AddToAlbumSheetContent,
	type AddToAlbumSheetContentProps,
} from "./AddToAlbumSheetContent";
export { AlbumDetail } from "./AlbumDetailScreen";
export { AlbumsPage } from "./AlbumsPage";
export type { AlbumDetailParams } from "./types";
