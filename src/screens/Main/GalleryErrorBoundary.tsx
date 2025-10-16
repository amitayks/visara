import React, {
	Component,
	type ErrorInfo,
	type ReactNode,
	useEffect,
} from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");
const THUMBNAIL_SIZE = width / 3 - 8; // 3 columns with 4px spacing

/**
 * Skeleton Item Component with shimmer animation
 */
function SkeletonItem() {
	const theme = useTheme();
	const opacity = useSharedValue(0.3);

	useEffect(() => {
		opacity.value = withRepeat(
			withSequence(
				withTiming(1, { duration: 1000 }),
				withTiming(0.3, { duration: 1000 }),
			),
			-1,
			false,
		);
	}, [opacity]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			style={[
				styles.skeletonItem,
				{
					width: THUMBNAIL_SIZE,
					height: THUMBNAIL_SIZE,
					backgroundColor: theme.colors.surfaceVariant,
				},
				animatedStyle,
			]}
		/>
	);
}

/**
 * Skeleton Grid Component - shows loading state
 */
function SkeletonGrid() {
	const theme = useTheme();

	return (
		<View
			style={[
				styles.skeletonContainer,
				{
					backgroundColor: theme.colors.background,
				},
			]}
		>
			{/* Header Skeleton */}
			<View style={styles.skeletonHeader}>
				<Animated.View
					style={[
						styles.skeletonLogo,
						{
							backgroundColor: theme.colors.surfaceVariant,
						},
					]}
				/>
				<Animated.View
					style={[
						styles.skeletonButton,
						{
							backgroundColor: theme.colors.surfaceVariant,
						},
					]}
				/>
			</View>

			{/* Grid Skeleton */}
			<View style={styles.skeletonGrid}>
				{Array.from({ length: 12 }).map((_, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton items don't need stable keys
					<SkeletonItem key={index} />
				))}
			</View>
		</View>
	);
}

/**
 * Gallery Error Boundary Props
 */
interface GalleryErrorBoundaryProps {
	children: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * Gallery Error Boundary State
 */
interface GalleryErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * Gallery Error Boundary Component
 * Specialized error boundary for Gallery screen with skeleton screen fallback
 *
 * Constitutional Compliance:
 * - Code Quality & Architecture (NON-NEGOTIABLE): Error boundaries at feature boundaries
 * - User Experience Excellence: Graceful fallback with skeleton screens
 */
export class GalleryErrorBoundary extends Component<
	GalleryErrorBoundaryProps,
	GalleryErrorBoundaryState
> {
	constructor(props: GalleryErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
		};
	}

	static getDerivedStateFromError(error: Error): GalleryErrorBoundaryState {
		return {
			hasError: true,
			error,
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Log error to console in development
		if (__DEV__) {
			console.error("GalleryErrorBoundary caught an error:", error, errorInfo);
		}

		// Call optional error handler
		if (this.props.onError) {
			this.props.onError(error, errorInfo);
		}
	}

	render(): ReactNode {
		if (this.state.hasError) {
			// Show skeleton screen as graceful degradation
			return <SkeletonGrid />;
		}

		return this.props.children;
	}
}

const styles = StyleSheet.create({
	skeletonContainer: {
		flex: 1,
	},
	skeletonHeader: {
		height: 60,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingTop: 8,
	},
	skeletonLogo: {
		width: 100,
		height: 32,
		borderRadius: 8,
	},
	skeletonButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
	},
	skeletonGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		padding: 4,
		gap: 4,
	},
	skeletonItem: {
		borderRadius: 8,
	},
});
