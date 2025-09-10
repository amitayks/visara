import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const COLUMNS = 2;
export const SPACING = 8; // Reduced spacing between columns
export const CONTAINER_PADDING = 8;
// Calculate item width accounting for container padding and inter-item spacing
export const ITEM_WIDTH =
	(SCREEN_WIDTH - CONTAINER_PADDING - SPACING) / COLUMNS;
