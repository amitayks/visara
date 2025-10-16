import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "react-native-paper";
import { Icon } from "./atoms/Icon";

/**
 * Error Boundary Props
 */
interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * Error Boundary State
 */
interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * Fallback UI Component shown when error boundary catches an error
 */
function DefaultFallback({
	error,
	onReset,
}: {
	error: Error;
	onReset: () => void;
}) {
	const theme = useTheme();

	return (
		<View
			style={[
				styles.fallbackContainer,
				{
					backgroundColor: theme.colors.background,
				},
			]}
		>
			<Icon name="alert-circle-outline" size={64} color={theme.colors.error} />
			<Text
				style={[
					styles.fallbackTitle,
					{
						color: theme.colors.onBackground,
					},
				]}
			>
				Something went wrong
			</Text>
			<Text
				style={[
					styles.fallbackMessage,
					{
						color: theme.colors.onSurfaceVariant,
					},
				]}
			>
				We encountered an unexpected error. Please try again.
			</Text>
			{__DEV__ && (
				<View style={styles.errorDetails}>
					<Text
						style={[
							styles.errorDetailsTitle,
							{
								color: theme.colors.error,
							},
						]}
					>
						Error Details (Dev Only):
					</Text>
					<Text
						style={[
							styles.errorDetailsText,
							{
								color: theme.colors.onSurfaceVariant,
							},
						]}
					>
						{error.message}
					</Text>
				</View>
			)}
			<TouchableOpacity
				style={[
					styles.retryButton,
					{
						backgroundColor: theme.colors.primary,
					},
				]}
				onPress={onReset}
			>
				<Text
					style={[
						styles.retryButtonText,
						{
							color: theme.colors.onPrimary,
						},
					]}
				>
					Try Again
				</Text>
			</TouchableOpacity>
		</View>
	);
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary onError={(error, errorInfo) => logErrorToService(error, errorInfo)}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * Constitutional Compliance:
 * - Code Quality & Architecture (NON-NEGOTIABLE): Error boundaries at feature boundaries
 * - User Experience Excellence: Graceful fallback UI with retry mechanism
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
		};
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		// Update state so the next render will show the fallback UI
		return {
			hasError: true,
			error,
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Log error to console in development
		if (__DEV__) {
			console.error("ErrorBoundary caught an error:", error, errorInfo);
		}

		// Call optional error handler (for future crash reporting)
		if (this.props.onError) {
			this.props.onError(error, errorInfo);
		}
	}

	handleReset = (): void => {
		this.setState({
			hasError: false,
			error: null,
		});
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// Custom fallback UI if provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// Default fallback UI
			return (
				<DefaultFallback
					error={this.state.error || new Error("Unknown error")}
					onReset={this.handleReset}
				/>
			);
		}

		return this.props.children;
	}
}

const styles = StyleSheet.create({
	fallbackContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	fallbackTitle: {
		fontSize: 24,
		fontWeight: "700",
		marginTop: 24,
		marginBottom: 12,
		textAlign: "center",
	},
	fallbackMessage: {
		fontSize: 16,
		fontWeight: "400",
		textAlign: "center",
		lineHeight: 24,
		marginBottom: 32,
	},
	errorDetails: {
		backgroundColor: "rgba(0, 0, 0, 0.05)",
		padding: 16,
		borderRadius: 8,
		marginBottom: 24,
		width: "100%",
		maxWidth: 400,
	},
	errorDetailsTitle: {
		fontSize: 14,
		fontWeight: "700",
		marginBottom: 8,
	},
	errorDetailsText: {
		fontSize: 12,
		fontWeight: "400",
		fontFamily: "monospace",
	},
	retryButton: {
		paddingHorizontal: 32,
		paddingVertical: 12,
		borderRadius: 8,
		elevation: 2,
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.25,
		shadowRadius: 4,
	},
	retryButtonText: {
		fontSize: 16,
		fontWeight: "600",
		textTransform: "uppercase",
	},
});
