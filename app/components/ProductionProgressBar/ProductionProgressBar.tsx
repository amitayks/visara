import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSpring,
	FadeIn,
	FadeOut,
} from "react-native-reanimated";
import {
	progressTracker,
	SimpleProgress,
} from "../../../services/progress/ProductionProgressTracker";

export const ProductionProgressBar: React.FC = () => {
	const [progress, setProgress] = useState<SimpleProgress>({
		isActive: false,
		currentFile: null,
		processed: 0,
		total: 0,
		percentage: 0,
	});

	const progressWidth = useSharedValue(0);

	useEffect(() => {
		const subscription = progressTracker
			.getProgress$()
			.subscribe((newProgress) => {
				setProgress(newProgress);
				progressWidth.value = withSpring(newProgress.percentage, {
					damping: 20,
					stiffness: 90,
				});
			});

		return () => subscription.unsubscribe();
	}, []);

	const progressBarStyle = useAnimatedStyle(() => ({
		width: `${progressWidth.value}%`,
	}));

	if (!progress.isActive) {
		return null;
	}

	const getFileName = (path: string | null): string => {
		if (!path) return "Preparing...";
		if (path === "Complete!") return path;
		const parts = path.split("/");
		return parts[parts.length - 1] || "Processing...";
	};

	const getETAText = (): string => {
		if (
			!progress.estimatedTimeRemaining ||
			progress.estimatedTimeRemaining <= 0
		) {
			return `${progress.percentage}%`;
		}
		const seconds = Math.round(progress.estimatedTimeRemaining / 1000);
		if (seconds < 60) return `${progress.percentage}% • ${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		return `${progress.percentage}% • ${minutes}m`;
	};

	return (
		<Animated.View
			entering={FadeIn.duration(300)}
			exiting={FadeOut.duration(300)}
			style={styles.container}
		>
			<Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
				{getFileName(progress.currentFile)}
			</Text>

			<View style={styles.progressBarContainer}>
				<Animated.View style={[styles.progressBar, progressBarStyle]} />
			</View>

			<View style={styles.footer}>
				<Text style={styles.count}>
					{progress.processed}/{progress.total}
				</Text>
				<Text style={styles.percentage}>{getETAText()}</Text>
			</View>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: "rgba(0, 0, 0, 0.9)",
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderRadius: 12,
		marginHorizontal: 16,
		marginBottom: 16,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	fileName: {
		color: "#FFFFFF",
		fontSize: 14,
		fontWeight: "500",
		marginBottom: 8,
		textAlign: "center",
	},
	progressBarContainer: {
		height: 4,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		borderRadius: 2,
		overflow: "hidden",
		marginBottom: 8,
	},
	progressBar: {
		height: "100%",
		backgroundColor: "#007AFF",
		borderRadius: 2,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	count: {
		color: "#FFFFFF",
		fontSize: 12,
		opacity: 0.7,
	},
	percentage: {
		color: "#FFFFFF",
		fontSize: 12,
		fontWeight: "600",
	},
});
