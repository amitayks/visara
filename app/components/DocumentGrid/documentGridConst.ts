import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const COLUMNS = 2;
export const SPACING = 15; // Keep original spacing for Pinterest look
export const CONTAINER_PADDING = 16;
// Calculate item width accounting for container padding and inter-item spacing
export const ITEM_WIDTH =
	(SCREEN_WIDTH - CONTAINER_PADDING * 2 - SPACING * 1.5) / COLUMNS;
