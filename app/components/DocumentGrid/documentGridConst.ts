import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const COLUMNS = 2;
export const SPACING = 15;
export const CONTAINER_PADDING = 16;
export const ITEM_WIDTH =
	(SCREEN_WIDTH - CONTAINER_PADDING * 2 - SPACING) / COLUMNS;
