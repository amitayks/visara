import type { ProcessingQueue } from "@models/ProcessingQueue";
import React, {
	createContext,
	type ReactNode,
	useContext,
	useReducer,
} from "react";

// Processing progress information
export interface ProcessingProgress {
	current: number;
	total: number;
	currentFileName?: string;
	estimatedTimeRemaining?: number; // milliseconds
}

// Failed file information
export interface FailedFile {
	mediaFileId: string;
	fileName: string;
	errorMessage: string;
	timestamp: number;
}

// Processing state
export interface ProcessingState {
	processingQueue: ProcessingQueue[];
	currentProgress: ProcessingProgress;
	isPaused: boolean;
	failedFiles: FailedFile[];
	isProcessing: boolean;
	lastCheckpoint?: number; // timestamp
	pauseReason?: string; // Reason for pause (e.g., "Low storage", "Memory threshold")
}

// Processing actions
export type ProcessingAction =
	| { type: "SET_PROCESSING_QUEUE"; payload: ProcessingQueue[] }
	| { type: "ADD_TO_QUEUE"; payload: ProcessingQueue }
	| { type: "REMOVE_FROM_QUEUE"; payload: string }
	| { type: "UPDATE_PROGRESS"; payload: ProcessingProgress }
	| { type: "SET_PAUSED"; payload: boolean }
	| { type: "PAUSE_WITH_REASON"; payload: string }
	| { type: "ADD_FAILED_FILE"; payload: FailedFile }
	| { type: "CLEAR_FAILED_FILES" }
	| { type: "START_PROCESSING" }
	| { type: "STOP_PROCESSING" }
	| { type: "SET_CHECKPOINT"; payload: number }
	| { type: "RESUME_FROM_CHECKPOINT" };

// Initial state
const initialState: ProcessingState = {
	processingQueue: [],
	currentProgress: {
		current: 0,
		total: 0,
	},
	isPaused: false,
	failedFiles: [],
	isProcessing: false,
};

// Reducer function
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "SET_PROCESSING_QUEUE":
			return {
				...state,
				processingQueue: action.payload,
				currentProgress: {
					...state.currentProgress,
					total: action.payload.length,
				},
			};

		case "ADD_TO_QUEUE":
			return {
				...state,
				processingQueue: [...state.processingQueue, action.payload],
				currentProgress: {
					...state.currentProgress,
					total: state.currentProgress.total + 1,
				},
			};

		case "REMOVE_FROM_QUEUE":
			return {
				...state,
				processingQueue: state.processingQueue.filter(
					(item) => item.id !== action.payload,
				),
				currentProgress: {
					...state.currentProgress,
					total: Math.max(0, state.currentProgress.total - 1),
				},
			};

		case "UPDATE_PROGRESS":
			return {
				...state,
				currentProgress: action.payload,
			};

		case "SET_PAUSED":
			return {
				...state,
				isPaused: action.payload,
				pauseReason: action.payload ? state.pauseReason : undefined,
			};

		case "PAUSE_WITH_REASON":
			return {
				...state,
				isPaused: true,
				pauseReason: action.payload,
			};

		case "ADD_FAILED_FILE":
			return {
				...state,
				failedFiles: [...state.failedFiles, action.payload],
			};

		case "CLEAR_FAILED_FILES":
			return {
				...state,
				failedFiles: [],
			};

		case "START_PROCESSING":
			return {
				...state,
				isProcessing: true,
				isPaused: false,
			};

		case "STOP_PROCESSING":
			return {
				...state,
				isProcessing: false,
				isPaused: false,
			};

		case "SET_CHECKPOINT":
			return {
				...state,
				lastCheckpoint: action.payload,
			};

		case "RESUME_FROM_CHECKPOINT":
			return {
				...state,
				isProcessing: true,
				isPaused: false,
				pauseReason: undefined,
			};

		default:
			return state;
	}
}

// Context type
interface ProcessingContextType {
	state: ProcessingState;
	dispatch: React.Dispatch<ProcessingAction>;
}

// Create context
const ProcessingContext = createContext<ProcessingContextType | undefined>(
	undefined,
);

// Provider component
export function ProcessingProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(processingReducer, initialState);

	return (
		<ProcessingContext.Provider value={{ state, dispatch }}>
			{children}
		</ProcessingContext.Provider>
	);
}

// Custom hook to use processing context
export function useProcessing() {
	const context = useContext(ProcessingContext);
	if (context === undefined) {
		throw new Error("useProcessing must be used within a ProcessingProvider");
	}
	return context;
}
