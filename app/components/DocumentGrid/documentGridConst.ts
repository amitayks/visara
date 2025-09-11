import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const COLUMNS = 3;
export const SPACING = 8; // Reduced spacing between columns
export const CONTAINER_PADDING = 8;
// Calculate item width accounting for container padding and inter-item spacing
export const ITEM_WIDTH =
	(SCREEN_WIDTH - CONTAINER_PADDING - SPACING * 1.2) / COLUMNS;
export const ITEM_HEIGHT = 1.4 * ITEM_WIDTH; // Assuming a 5:7 aspect ratio for document thumbnails
