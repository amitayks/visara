import React, {
	createContext,
	type ReactNode,
	useContext,
	useReducer,
} from "react";

// Theme options
export type Theme = "light" | "dark" | "system";

// User preferences
export interface UserPreferences {
	gridZoomLevel: 3 | 4 | 11;
	defaultModalZoom: number;
	onboardingCompleted: boolean;
}

// Settings state
export interface SettingsState {
	theme: Theme;
	batterySaver: boolean;
	nightProcessing: boolean;
	preferences: UserPreferences;
	loading: boolean;
	error: string | null;
}

// Settings actions
export type SettingsAction =
	| { type: "SET_THEME"; payload: Theme }
	| { type: "TOGGLE_BATTERY_SAVER" }
	| { type: "TOGGLE_NIGHT_PROCESSING" }
	| { type: "SET_GRID_ZOOM_LEVEL"; payload: 3 | 4 | 11 }
	| { type: "SET_DEFAULT_MODAL_ZOOM"; payload: number }
	| { type: "SET_ONBOARDING_COMPLETED"; payload: boolean }
	| { type: "SET_PREFERENCES"; payload: UserPreferences }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null }
	| { type: "RESET_SETTINGS" };

// Initial state
const initialState: SettingsState = {
	theme: "system",
	batterySaver: false,
	nightProcessing: false,
	preferences: {
		gridZoomLevel: 4,
		defaultModalZoom: 1,
		onboardingCompleted: false,
	},
	loading: false,
	error: null,
};

// Reducer function
function settingsReducer(
	state: SettingsState,
	action: SettingsAction,
): SettingsState {
	switch (action.type) {
		case "SET_THEME":
			return {
				...state,
				theme: action.payload,
			};

		case "TOGGLE_BATTERY_SAVER":
			return {
				...state,
				batterySaver: !state.batterySaver,
			};

		case "TOGGLE_NIGHT_PROCESSING":
			return {
				...state,
				nightProcessing: !state.nightProcessing,
			};

		case "SET_GRID_ZOOM_LEVEL":
			return {
				...state,
				preferences: {
					...state.preferences,
					gridZoomLevel: action.payload,
				},
			};

		case "SET_DEFAULT_MODAL_ZOOM":
			return {
				...state,
				preferences: {
					...state.preferences,
					defaultModalZoom: action.payload,
				},
			};

		case "SET_ONBOARDING_COMPLETED":
			return {
				...state,
				preferences: {
					...state.preferences,
					onboardingCompleted: action.payload,
				},
			};

		case "SET_PREFERENCES":
			return {
				...state,
				preferences: action.payload,
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

		case "RESET_SETTINGS":
			return {
				...initialState,
				preferences: {
					...initialState.preferences,
					onboardingCompleted: state.preferences.onboardingCompleted,
				},
			};

		default:
			return state;
	}
}

// Context type
interface SettingsContextType {
	state: SettingsState;
	dispatch: React.Dispatch<SettingsAction>;
}

// Create context
const SettingsContext = createContext<SettingsContextType | undefined>(
	undefined,
);

// Provider component
export function SettingsProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(settingsReducer, initialState);

	return (
		<SettingsContext.Provider value={{ state, dispatch }}>
			{children}
		</SettingsContext.Provider>
	);
}

// Custom hook to use settings context
export function useSettings() {
	const context = useContext(SettingsContext);
	if (context === undefined) {
		throw new Error("useSettings must be used within a SettingsProvider");
	}
	return context;
}
