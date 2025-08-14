import { Dimensions } from "react-native";

export const { width: SCREEN_WIDTH } = Dimensions.get("window");
export const COLUMNS = 2;
export const SPACING = 15;
export const CONTAINER_PADDING = 16;
export const ITEM_WIDTH =
	(SCREEN_WIDTH - CONTAINER_PADDING * 2 - SPACING) / COLUMNS;
