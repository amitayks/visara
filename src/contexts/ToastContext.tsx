import trigger from "@mhpdev/react-native-haptics";
import React, {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
} from "react";
import Toast from "react-native-toast-message";

/**
 * Toast notification types
 */
export type ToastType = "success" | "error" | "warning" | "info";

/**
 * Toast action configuration
 */
export interface ToastAction {
	text: string;
	onPress: () => void;
}

/**
 * Toast options
 */
export interface ToastOptions {
	duration?: number;
	action?: ToastAction;
	position?: "top" | "bottom";
	visibilityTime?: number;
}

/**
 * Toast context value
 */
interface ToastContextValue {
	showError: (message: string, options?: ToastOptions) => void;
	showSuccess: (message: string, options?: ToastOptions) => void;
	showWarning: (message: string, options?: ToastOptions) => void;
	showInfo: (message: string, options?: ToastOptions) => void;
	hideToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const BOTTOM_OFFSET = 150; // Clear of bottom navigation (10px + 80px nav height + safe area)
const TOP_OFFSET = 60; // Clear of status bar

/**
 * ToastProvider Component
 * Provides global toast notification functionality throughout the app
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	/**
	 * Trigger haptic feedback for toast notifications
	 * Uses react-native-haptics for platform-specific feedback
	 */
	const triggerHaptic = useCallback((type: ToastType) => {
		try {
			if (type === "error") {
				trigger.notification("error");
			} else if (type === "warning") {
				trigger.notification("warning");
			} else if (type === "success") {
				trigger.notification("success");
			}
		} catch (error) {
			// Haptic feedback is optional, don't block on errors
			console.warn("Haptic feedback failed:", error);
		}
	}, []);

	/**
	 * Show error toast
	 * @param message - Error message to display
	 * @param options - Toast configuration options
	 */
	const showError = useCallback(
		(message: string, options?: ToastOptions) => {
			triggerHaptic("error");
			Toast.show({
				type: "error",
				text1: "Error",
				text2: message,
				position: options?.position || "bottom",
				visibilityTime: options?.visibilityTime || 5000,
				autoHide: true,
				topOffset: TOP_OFFSET,
				bottomOffset: BOTTOM_OFFSET,
				props: {
					action: options?.action,
				},
			});
		},
		[triggerHaptic],
	);

	/**
	 * Show success toast
	 * @param message - Success message to display
	 * @param options - Toast configuration options
	 */
	const showSuccess = useCallback(
		(message: string, options?: ToastOptions) => {
			triggerHaptic("success");
			Toast.show({
				type: "success",
				text1: "Success",
				text2: message,
				position: options?.position || "bottom",
				visibilityTime: options?.visibilityTime || 3000,
				autoHide: true,
				topOffset: TOP_OFFSET,
				bottomOffset: BOTTOM_OFFSET,
				props: {
					action: options?.action,
				},
			});
		},
		[triggerHaptic],
	);

	/**
	 * Show warning toast
	 * @param message - Warning message to display
	 * @param options - Toast configuration options
	 */
	const showWarning = useCallback(
		(message: string, options?: ToastOptions) => {
			triggerHaptic("warning");
			Toast.show({
				type: "warning",
				text1: "Warning",
				text2: message,
				position: options?.position || "bottom",
				visibilityTime: options?.visibilityTime || 4000,
				autoHide: true,
				topOffset: TOP_OFFSET,
				bottomOffset: BOTTOM_OFFSET,
				props: {
					action: options?.action,
				},
			});
		},
		[triggerHaptic],
	);

	/**
	 * Show info toast
	 * @param message - Info message to display
	 * @param options - Toast configuration options
	 */
	const showInfo = useCallback((message: string, options?: ToastOptions) => {
		Toast.show({
			type: "info",
			text1: "Info",
			text2: message,
			position: options?.position || "bottom",
			visibilityTime: options?.visibilityTime || 3000,
			autoHide: true,
			topOffset: TOP_OFFSET,
			bottomOffset: BOTTOM_OFFSET,
			props: {
				action: options?.action,
			},
		});
	}, []);

	/**
	 * Hide current toast
	 */
	const hideToast = useCallback(() => {
		Toast.hide();
	}, []);

	const value: ToastContextValue = {
		showError,
		showSuccess,
		showWarning,
		showInfo,
		hideToast,
	};

	return (
		<ToastContext.Provider value={value}>{children}</ToastContext.Provider>
	);
}

/**
 * Hook to access toast notifications
 * @throws Error if used outside ToastProvider
 */
export function useToast(): ToastContextValue {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within a ToastProvider");
	}
	return context;
}
