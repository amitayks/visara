import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useReducer,
} from "react";

/**
 * Navigation page indices
 * 0 = Main (PhotoGrid)
 * 1 = Albums
 */
export type PageIndex = 0 | 1;

/**
 * Navigation state for the app
 */
export interface NavigationState {
	/** Current page index (0 = Main, 1 = Albums) */
	currentPage: PageIndex;
	/** Whether search mode is active (search results replace main grid) */
	searchMode: boolean;
	/** Whether document filter mode is active */
	documentMode: boolean;
	/** Whether settings drawer is open */
	settingsDrawerOpen: boolean;
}

/**
 * Navigation actions
 */
export type NavigationAction =
	| { type: "SET_PAGE"; payload: PageIndex }
	| { type: "TOGGLE_SEARCH_MODE" }
	| { type: "ACTIVATE_SEARCH_MODE" }
	| { type: "DEACTIVATE_SEARCH_MODE" }
	| { type: "TOGGLE_DOCUMENT_MODE" }
	| { type: "TOGGLE_SETTINGS_DRAWER" }
	| { type: "OPEN_SETTINGS_DRAWER" }
	| { type: "CLOSE_SETTINGS_DRAWER" };

/** Initial navigation state */
const initialState: NavigationState = {
	currentPage: 0, // Start at Main page
	searchMode: false,
	documentMode: false,
	settingsDrawerOpen: false,
};

/**
 * Navigation reducer
 */
function navigationReducer(
	state: NavigationState,
	action: NavigationAction,
): NavigationState {
	switch (action.type) {
		case "SET_PAGE":
			return {
				...state,
				currentPage: action.payload,
				// Close search mode when switching pages
				searchMode: false,
			};

		case "TOGGLE_SEARCH_MODE":
			return {
				...state,
				searchMode: !state.searchMode,
				// Close settings drawer when entering search mode
				settingsDrawerOpen: state.searchMode ? state.settingsDrawerOpen : false,
			};

		case "ACTIVATE_SEARCH_MODE":
			return {
				...state,
				searchMode: true,
				settingsDrawerOpen: false,
			};

		case "DEACTIVATE_SEARCH_MODE":
			return {
				...state,
				searchMode: false,
			};

		case "TOGGLE_DOCUMENT_MODE":
			// If we're on Albums page, navigate to Main and activate document mode
			// If we're on Main page, just toggle document mode
			if (state.currentPage === 1) {
				return {
					...state,
					currentPage: 0,
					documentMode: true,
				};
			}
			return {
				...state,
				documentMode: !state.documentMode,
			};

		case "TOGGLE_SETTINGS_DRAWER":
			return {
				...state,
				settingsDrawerOpen: !state.settingsDrawerOpen,
				// Close search mode when opening settings drawer
				searchMode: state.settingsDrawerOpen ? state.searchMode : false,
			};

		case "OPEN_SETTINGS_DRAWER":
			return {
				...state,
				settingsDrawerOpen: true,
				searchMode: false,
			};

		case "CLOSE_SETTINGS_DRAWER":
			return {
				...state,
				settingsDrawerOpen: false,
			};

		default:
			return state;
	}
}

/**
 * Navigation context type
 */
interface NavigationContextType {
	state: NavigationState;
	dispatch: React.Dispatch<NavigationAction>;
	/** Helper: Navigate to Main page */
	goToMain: () => void;
	/** Helper: Navigate to Albums page */
	goToAlbums: () => void;
	/** Helper: Toggle search mode */
	toggleSearch: () => void;
	/** Helper: Toggle document mode */
	toggleDocuments: () => void;
	/** Helper: Toggle settings drawer */
	toggleSettings: () => void;
}

/** Create navigation context */
const NavigationContext = createContext<NavigationContextType | undefined>(
	undefined,
);

/**
 * Navigation provider component
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(navigationReducer, initialState);

	// Helper functions for common actions
	const goToMain = useCallback(() => {
		dispatch({ type: "SET_PAGE", payload: 0 });
	}, []);

	const goToAlbums = useCallback(() => {
		dispatch({ type: "SET_PAGE", payload: 1 });
	}, []);

	const toggleSearch = useCallback(() => {
		dispatch({ type: "TOGGLE_SEARCH_MODE" });
	}, []);

	const toggleDocuments = useCallback(() => {
		dispatch({ type: "TOGGLE_DOCUMENT_MODE" });
	}, []);

	const toggleSettings = useCallback(() => {
		dispatch({ type: "TOGGLE_SETTINGS_DRAWER" });
	}, []);

	const value: NavigationContextType = {
		state,
		dispatch,
		goToMain,
		goToAlbums,
		toggleSearch,
		toggleDocuments,
		toggleSettings,
	};

	return (
		<NavigationContext.Provider value={value}>
			{children}
		</NavigationContext.Provider>
	);
}

/**
 * Custom hook to use navigation context
 */
export function useNavigation() {
	const context = useContext(NavigationContext);
	if (context === undefined) {
		throw new Error("useNavigation must be used within a NavigationProvider");
	}
	return context;
}
