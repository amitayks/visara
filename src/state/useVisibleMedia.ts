/**
 * Gallery feed hook — re-exported from the v2 backend (sqlite-storage-core
 * spec): same `{ media, ready }` contract, first emission immediate, 250 ms
 * trailing throttle, reference-stable rows via the backend RowCache.
 */
export { useVisibleMedia } from "@backend/feed";
