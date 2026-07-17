/**
 * @features/viewer — public surface (interface contract).
 * openPhotoViewer is the ONLY entry into the viewer; PhotoViewerScreen is
 * registered by @app/navigation under the 'PhotoViewer' route.
 */

export { openPhotoViewer } from "./openPhotoViewer";
export { PhotoViewerScreen } from "./PhotoViewerScreen";
