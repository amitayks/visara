/**
 * Album feature types. The AlbumDetail route params are PINNED by the
 * cross-agent interface contract — nav-app registers the `AlbumDetail`
 * route against exactly this shape.
 */

export type AlbumDetailParams = {
	albumId?: string;
	smartLabel?: string;
};

/** Local navigation typing for the routes this feature navigates to. */
export type AlbumsNavParams = {
	AlbumDetail: AlbumDetailParams | undefined;
};
