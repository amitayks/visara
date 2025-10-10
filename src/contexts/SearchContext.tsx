import type { MediaFile } from "@models/MediaFile";
import React, {
	createContext,
	type ReactNode,
	useContext,
	useReducer,
} from "react";

// Search state
export interface SearchState {
	searchQuery: string;
	searchResults: MediaFile[];
	isSearchActive: boolean;
	resultCount: number;
	loading: boolean;
	error: string | null;
}

// Search actions
export type SearchAction =
	| { type: "SET_SEARCH_QUERY"; payload: string }
	| { type: "SET_SEARCH_RESULTS"; payload: MediaFile[] }
	| { type: "ACTIVATE_SEARCH" }
	| { type: "DEACTIVATE_SEARCH" }
	| { type: "CLEAR_SEARCH" }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null };

// Initial state
const initialState: SearchState = {
	searchQuery: "",
	searchResults: [],
	isSearchActive: false,
	resultCount: 0,
	loading: false,
	error: null,
};

// Reducer function
function searchReducer(state: SearchState, action: SearchAction): SearchState {
	switch (action.type) {
		case "SET_SEARCH_QUERY":
			return {
				...state,
				searchQuery: action.payload,
			};

		case "SET_SEARCH_RESULTS":
			return {
				...state,
				searchResults: action.payload,
				resultCount: action.payload.length,
				loading: false,
			};

		case "ACTIVATE_SEARCH":
			return {
				...state,
				isSearchActive: true,
			};

		case "DEACTIVATE_SEARCH":
			return {
				...state,
				isSearchActive: false,
			};

		case "CLEAR_SEARCH":
			return {
				...state,
				searchQuery: "",
				searchResults: [],
				isSearchActive: false,
				resultCount: 0,
				error: null,
			};

		case "SET_LOADING":
			return {
				...state,
				loading: action.payload,
			};

		case "SET_ERROR":
			return {
				...state,
				error: action.payload,
				loading: false,
			};

		default:
			return state;
	}
}

// Context type
interface SearchContextType {
	state: SearchState;
	dispatch: React.Dispatch<SearchAction>;
}

// Create context
const SearchContext = createContext<SearchContextType | undefined>(undefined);

// Provider component
export function SearchProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(searchReducer, initialState);

	return (
		<SearchContext.Provider value={{ state, dispatch }}>
			{children}
		</SearchContext.Provider>
	);
}

// Custom hook to use search context
export function useSearch() {
	const context = useContext(SearchContext);
	if (context === undefined) {
		throw new Error("useSearch must be used within a SearchProvider");
	}
	return context;
}
