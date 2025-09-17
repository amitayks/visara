// services/gallery/index.ts
export { GalleryMonitorV2 as GalleryMonitor } from "./GalleryMonitorV2";
export { galleryScanner } from "./GalleryScanner";
export { backgroundScanner } from "./backgroundScanner";

import { GalleryMonitorV2 } from "./GalleryMonitorV2";
export const galleryMonitor = GalleryMonitorV2.getInstance();
