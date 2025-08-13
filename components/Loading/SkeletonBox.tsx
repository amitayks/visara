import React, { useEffect } from "react";
import { DimensionValue, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
	Easing,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
// Using a simple View instead of LinearGradient for React Native compatibility
// import LinearGradient from "react-native-linear-gradient";

interface SkeletonBoxProps {
	width?: DimensionValue;
	height?: number;
	borderRadius?: number;
	style?: ViewStyle;
	variant?: "rectangular" | "rounded" | "circular";
	shimmerColors?: string[];
	animationDuration?: number;
}
// not used at the app //
export function SkeletonBox({
	width = "100%",
	height = 20,
	borderRadius = 4,
	style,
	variant = "rectangular",
	shimmerColors = ["#F0F0F0", "#E0E0E0", "#F0F0F0"],
	animationDuration = 1500,
}: SkeletonBoxProps) {
	const shimmerTranslate = useSharedValue(-1);

	useEffect(() => {
		shimmerTranslate.value = withRepeat(
			withTiming(1, {
				duration: animationDuration,
				easing: Easing.linear,
			}),
			-1,
			false,
		);
	}, [shimmerTranslate, animationDuration]);

	const shimmerStyle = useAnimatedStyle(() => {
		const translateX = interpolate(
			shimmerTranslate.value,
			[-1, 1],
			[-300, 300],
		);

		return {
			transform: [{ translateX }],
		};
	});

	// Calculate border radius based on variant
	const getBorderRadius = () => {
		switch (variant) {
			case "circular":
				return typeof height === "number" ? height / 2 : 50;
			case "rounded":
				return borderRadius * 2;
			default:
				return borderRadius;
		}
	};

	const containerStyle: ViewStyle = {
		width,
		height,
		borderRadius: getBorderRadius(),
		overflow: "hidden",
		backgroundColor: shimmerColors[0],
		...style,
	};

	return (
		<View style={containerStyle}>
			<Animated.View style={[styles.shimmerContainer, shimmerStyle]}>
				<View
					style={[
						styles.shimmerGradient,
						{
							backgroundColor: shimmerColors[1], // Use middle color for shimmer effect
							opacity: 0.7,
						},
					]}
				/>
			</Animated.View>
		</View>
	);
}

// Predefined skeleton variants for common use cases
export function SkeletonText({
	lines = 1,
	lineHeight = 16,
	spacing = 8,
	lastLineWidth = "60%",
	style,
}: {
	lines?: number;
	lineHeight?: number;
	spacing?: number;
	lastLineWidth?: DimensionValue;
	style?: ViewStyle;
}) {
	return (
		<View style={[styles.textContainer, style]}>
			{Array.from({ length: lines }, (_, index) => (
				<SkeletonBox
					key={index}
					height={lineHeight}
					width={index === lines - 1 ? lastLineWidth : "100%"}
					borderRadius={lineHeight / 2}
					style={index > 0 ? { marginTop: spacing } : undefined}
				/>
			))}
		</View>
	);
}

export function SkeletonCard({
	imageHeight = 120,
	hasText = true,
	textLines = 2,
	style,
}: {
	imageHeight?: number;
	hasText?: boolean;
	textLines?: number;
	style?: ViewStyle;
}) {
	return (
		<View style={[styles.cardContainer, style]}>
			{/* Image skeleton */}
			<SkeletonBox
				height={imageHeight}
				borderRadius={8}
				style={styles.cardImage}
			/>

			{hasText && (
				<View style={styles.cardContent}>
					<SkeletonText
						lines={textLines}
						lineHeight={14}
						spacing={6}
						lastLineWidth="70%"
					/>

					{/* Metadata skeletons */}
					<View style={styles.cardMetadata}>
						<SkeletonBox
							width={60}
							height={12}
							borderRadius={6}
							style={styles.metadataItem}
						/>
						<SkeletonBox
							width={40}
							height={12}
							borderRadius={6}
							style={styles.metadataItem}
						/>
					</View>
				</View>
			)}
		</View>
	);
}

// Grid-specific skeleton for masonry layout
export function SkeletonMasonryItem({
	height,
	style,
}: {
	height: number;
	style?: ViewStyle;
}) {
	return (
		<View style={[styles.masonryItem, { height }, style]}>
			<SkeletonBox
				height={height * 0.7}
				borderRadius={8}
				style={styles.masonryImage}
			/>

			<View style={styles.masonryContent}>
				<SkeletonText lines={1} lineHeight={12} style={styles.masonryTitle} />

				<View style={styles.masonryMetadata}>
					<SkeletonBox width={50} height={10} borderRadius={5} />
					<SkeletonBox width={30} height={10} borderRadius={5} />
				</View>

				{/* Confidence bar skeleton */}
				<SkeletonBox
					height={3}
					borderRadius={1.5}
					style={styles.confidenceBar}
				/>
			</View>
		</View>
	);
}

// Loading dots animation
export function LoadingDots({
	size = 6,
	color = "#CCCCCC",
	spacing = 4,
}: {
	size?: number;
	color?: string;
	spacing?: number;
}) {
	const dot1Scale = useSharedValue(0.8);
	const dot2Scale = useSharedValue(0.8);
	const dot3Scale = useSharedValue(0.8);

	useEffect(() => {
		const animateDot = (
			dotScale: Animated.SharedValue<number>,
			delay: number,
		) => {
			dotScale.value = withRepeat(
				withTiming(1.2, {
					duration: 600,
					easing: Easing.inOut(Easing.ease),
				}),
				-1,
				true,
			);
		};

		// Stagger the animations
		setTimeout(() => animateDot(dot1Scale, 0), 0);
		setTimeout(() => animateDot(dot2Scale, 200), 200);
		setTimeout(() => animateDot(dot3Scale, 400), 400);
	}, [dot1Scale, dot2Scale, dot3Scale]);

	const dot1Style = useAnimatedStyle(() => ({
		transform: [{ scale: dot1Scale.value }],
	}));

	const dot2Style = useAnimatedStyle(() => ({
		transform: [{ scale: dot2Scale.value }],
	}));

	const dot3Style = useAnimatedStyle(() => ({
		transform: [{ scale: dot3Scale.value }],
	}));

	const dotStyle = {
		width: size,
		height: size,
		borderRadius: size / 2,
		backgroundColor: color,
		marginHorizontal: spacing / 2,
	};

	return (
		<View style={styles.dotsContainer}>
			<Animated.View style={[dotStyle, dot1Style]} />
			<Animated.View style={[dotStyle, dot2Style]} />
			<Animated.View style={[dotStyle, dot3Style]} />
		</View>
	);
}

const styles = StyleSheet.create({
	shimmerContainer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	shimmerGradient: {
		flex: 1,
		width: 300,
	},
	textContainer: {
		// Base container styles
	},
	cardContainer: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		overflow: "hidden",
		shadowColor: "#000000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	cardImage: {
		width: "100%",
	},
	cardContent: {
		padding: 12,
	},
	cardMetadata: {
		flexDirection: "row",
		marginTop: 8,
		gap: 8,
	},
	metadataItem: {
		// Individual metadata item styles
	},
	masonryItem: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		overflow: "hidden",
		shadowColor: "#000000",
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	masonryImage: {
		width: "100%",
	},
	masonryContent: {
		padding: 12,
		flex: 1,
	},
	masonryTitle: {
		marginBottom: 4,
	},
	masonryMetadata: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 8,
	},
	confidenceBar: {
		marginTop: "auto",
	},
	dotsContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
});
