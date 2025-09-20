// app/components/ErrorBoundary.tsx
// React Error Boundary for graceful error handling

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

interface Props {
	children: React.ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	handleRestart = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			return (
				<SafeAreaView style={styles.container}>
					<View style={styles.content}>
						<View style={styles.iconContainer}>
							<Icon name="warning" size={64} color="#FF6B35" />
						</View>
						
						<Text style={styles.title}>Something went wrong</Text>
						<Text style={styles.message}>
							The app encountered an unexpected error. Please try restarting.
						</Text>

						<TouchableOpacity 
							style={styles.button} 
							onPress={this.handleRestart}
						>
							<Icon name="refresh" size={20} color="#FFFFFF" />
							<Text style={styles.buttonText}>Restart App</Text>
						</TouchableOpacity>

						{__DEV__ && this.state.error && (
							<View style={styles.errorDetails}>
								<Text style={styles.errorTitle}>Error Details:</Text>
								<Text style={styles.errorText}>{this.state.error.message}</Text>
							</View>
						)}
					</View>
				</SafeAreaView>
			);
		}

		return this.props.children;
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FFFFFF",
	},
	content: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	iconContainer: {
		marginBottom: 24,
	},
	title: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#333333",
		marginBottom: 12,
		textAlign: "center",
	},
	message: {
		fontSize: 16,
		color: "#666666",
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 32,
	},
	button: {
		flexDirection: "row",
		backgroundColor: "#0066FF",
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	buttonText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
		marginLeft: 8,
	},
	errorDetails: {
		marginTop: 32,
		padding: 16,
		backgroundColor: "#FFF5F5",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#FFDDDD",
		width: "100%",
	},
	errorTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#FF3B30",
		marginBottom: 8,
	},
	errorText: {
		fontSize: 12,
		color: "#666666",
		fontFamily: "monospace",
	},
});