import type { MediaFile } from "@models/MediaFile";
import React, {
	createContext,
	type ReactNode,
	useContext,
	useReducer,
} from "react";

// Grid zoom levels: 3, 4, or 11 columns (constitutional requirement)
export type GridZoomLevel = 3 | 4 | 11;

// Date filter for sections
export interface DateFilter {
	startDate?: number;
	endDate?: number;
	label?: string; // "Today", "Yesterday", specific date/month
}

// Gallery state
export interface GalleryState {
	mediaFiles: MediaFile[];
	currentZoomLevel: GridZoomLevel;
	dateFilters: DateFilter[];
	loading: boolean;
	error: string | null;
	selectedMediaId: string | null; // Currently viewed media in modal
}

// Gallery actions
export type GalleryAction =
	| { type: "SET_MEDIA_FILES"; payload: MediaFile[] }
	| { type: "ADD_MEDIA_FILE"; payload: MediaFile }
	| { type: "REMOVE_MEDIA_FILE"; payload: string }
	| { type: "UPDATE_MEDIA_FILE"; payload: MediaFile }
	| { type: "SET_ZOOM_LEVEL"; payload: GridZoomLevel }
	| { type: "SET_DATE_FILTERS"; payload: DateFilter[] }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null }
	| { type: "SET_SELECTED_MEDIA"; payload: string | null }
	| { type: "CLEAR_FILTERS" };

// Initial state
const initialState: GalleryState = {
	mediaFiles: [],
	currentZoomLevel: 4, // Default to 4 columns
	dateFilters: [],
	loading: false,
	error: null,
	selectedMediaId: null,
};

// Reducer function
function galleryReducer(
	state: GalleryState,
	action: GalleryAction,
): GalleryState {
	switch (action.type) {
		case "SET_MEDIA_FILES":
			return { ...state, mediaFiles: action.payload, loading: false };

		case "ADD_MEDIA_FILE":
			return {
				...state,
				mediaFiles: [action.payload, ...state.mediaFiles],
			};

		case "REMOVE_MEDIA_FILE":
			return {
				...state,
				mediaFiles: state.mediaFiles.filter(
					(file) => file.id !== action.payload,
				),
			};

		case "UPDATE_MEDIA_FILE":
			return {
				...state,
				mediaFiles: state.mediaFiles.map((file) =>
					file.id === action.payload.id ? action.payload : file,
				),
			};

		case "SET_ZOOM_LEVEL":
			return { ...state, currentZoomLevel: action.payload };

		case "SET_DATE_FILTERS":
			return { ...state, dateFilters: action.payload };

		case "SET_LOADING":
			return { ...state, loading: action.payload };

		case "SET_ERROR":
			return { ...state, error: action.payload, loading: false };

		case "SET_SELECTED_MEDIA":
			return { ...state, selectedMediaId: action.payload };

		case "CLEAR_FILTERS":
			return {
				...state,
				dateFilters: [],
			};

		default:
			return state;
	}
}

// Context type
interface GalleryContextType {
	state: GalleryState;
	dispatch: React.Dispatch<GalleryAction>;
}

// Create context
const GalleryContext = createContext<GalleryContextType | undefined>(undefined);

// Provider component
export function GalleryProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(galleryReducer, initialState);

	return (
		<GalleryContext.Provider value={{ state, dispatch }}>
			{children}
		</GalleryContext.Provider>
	);
}

// Custom hook to use gallery context
export function useGallery() {
	const context = useContext(GalleryContext);
	if (context === undefined) {
		throw new Error("useGallery must be used within a GalleryProvider");
	}
	return context;
}
