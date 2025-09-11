import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ScanProgressBar.style";
import type { ScanProgress } from "../../../services/gallery/GalleryScanner";

interface ScanProgressBarProps {
	progress: ScanProgress;
	animated?: boolean;
}

export const ScanProgressBar: React.FC<ScanProgressBarProps> = ({
	progress,
	animated = true,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	
	// Calculate actual progress percentage
	const progressPercentage = useMemo(() => {
		if (progress.scanType === 'monitoring' && progress.discoveredNewImages) {
			// For monitoring, show progress of new images only
			return progress.newFiles && progress.discoveredNewImages > 0
				? progress.newFiles / progress.discoveredNewImages
				: 0;
		}
		// For initial scan, show overall progress
		return progress.totalImages > 0 
			? progress.processedImages / progress.totalImages 
			: 0;
	}, [progress]);
	
	const animatedProgress = useSharedValue(0);
	const pulseAnimation = useSharedValue(0);

	useEffect(() => {
		animatedProgress.value = withSpring(progressPercentage, {
			damping: 20,
			stiffness: 90,
		});
	}, [progressPercentage]);

	useEffect(() => {
		if (animated && progress.isScanning) {
			pulseAnimation.value = withRepeat(
				withTiming(1, { duration: 1500 }),
				-1,
				true,
			);
		}
	}, [animated, progress.isScanning]);

	const progressStyle = useAnimatedStyle(() => ({
		width: `${animatedProgress.value * 100}%`,
	}));

	const pulseStyle = useAnimatedStyle(() => ({
		opacity: interpolate(pulseAnimation.value, [0, 1], [0.6, 1]),
	}));

	// Generate appropriate status text
	const getStatusText = () => {
		if (progress.scanType === 'monitoring') {
			if (progress.discoveredNewImages && progress.discoveredNewImages > 0) {
				return `Found ${progress.discoveredNewImages} new images`;
			}
			return "Monitoring for new images...";
		}
		
		switch (progress.phase) {
			case 'discovering':
				return "Discovering images...";
			case 'processing':
				return "Processing documents...";
			case 'fingerprinting':
				return "Analyzing images...";
			case 'completed':
				return "Scan complete";
			default:
				return "Scanning gallery...";
		}
	};

	// Generate progress numbers text
	const getProgressNumbers = () => {
		if (progress.scanType === 'monitoring' && progress.discoveredNewImages) {
			return `${progress.newFiles || 0}/${progress.discoveredNewImages}`;
		}
		
		if (progress.totalImages === 0) {
			return "Checking...";
		}
		
		return `${progress.processedImages}/${progress.totalImages}`;
	};

	// Don't show progress bar if not scanning or just completed
	if (!progress.isScanning && progress.scanType === 'completed') {
		return null;
	}

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{getStatusText()}</Text>
				<Text style={styles.count}>{getProgressNumbers()}</Text>
			</View>
			
			{progress.newFiles !== undefined && progress.newFiles > 0 && (
				<Text style={styles.subtitle}>
					{progress.newFiles} new • {progress.changedFiles || 0} changed
				</Text>
			)}
			
			<View style={styles.progressBar}>
				<Animated.View
					style={[
						styles.progressFill, 
						progressStyle, 
						animated && progress.isScanning && pulseStyle
					]}
				/>
			</View>
		</View>
	);
};