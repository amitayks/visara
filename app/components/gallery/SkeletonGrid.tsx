import React, { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SkeletonGridProps {
	columns: number;
	count: number;
}

const SkeletonCard: React.FC<{ width: number; height: number; styles: any; theme: any }> = ({
	width,
	height,
	styles,
	theme,
}) => {
	const shimmer = useSharedValue(0);

	useEffect(() => {
		shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1, false);
	}, []);

	const shimmerStyle = useAnimatedStyle(() => {
		const opacity = interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]);
		return { opacity };
	});

	return (
		<View style={[styles.card, { width }]}>
			<Animated.View style={[styles.image, shimmerStyle, { width, height }]} />
			{/* Document type badge skeleton */}
			<View style={styles.typeBadge}>
				<Animated.View style={[styles.badgeIcon, shimmerStyle]} />
				<Animated.View style={[styles.badgeText, shimmerStyle]} />
			</View>
		</View>
	);
};

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
	columns,
	count,
}) => {
	const { theme, isDark } = useTheme();
	const styles = useThemedStyles(createStyles);
	const spacing = 15; // Match DocumentGrid spacing
	const containerPadding = 16;
	const itemWidth = (SCREEN_WIDTH - containerPadding * 2 - spacing) / columns;

	// Generate random heights for Pinterest-style layout
	const generateHeight = (index: number) => {
		// Use index for consistent heights across renders
		const seed = index * 123456789;
		const random = Math.abs(Math.sin(seed)) * 1000;
		const minHeight = itemWidth * 0.8;
		const maxHeight = itemWidth * 2.5;
		return minHeight + (random % (maxHeight - minHeight));
	};

	// Create masonry layout
	const createMasonryLayout = () => {
		const leftColumn: Array<{ index: number; height: number }> = [];
		const rightColumn: Array<{ index: number; height: number }> = [];
		let leftColumnHeight = 0;
		let rightColumnHeight = 0;

		for (let i = 0; i < count; i++) {
			const height = generateHeight(i);

			if (leftColumnHeight <= rightColumnHeight) {
				leftColumn.push({ index: i, height });
				leftColumnHeight += height + spacing;
			} else {
				rightColumn.push({ index: i, height });
				rightColumnHeight += height + spacing;
			}
		}

		return { leftColumn, rightColumn };
	};

	const { leftColumn, rightColumn } = createMasonryLayout();

	const renderColumn = (
		columnItems: Array<{ index: number; height: number }>,
		isLeft: boolean,
	) => (
		<View
			style={[styles.column, isLeft ? styles.leftColumn : styles.rightColumn]}
		>
			{columnItems.map((item) => (
				<View key={item.index} style={styles.cardContainer}>
					<SkeletonCard width={itemWidth} height={item.height} styles={styles} theme={theme} />
				</View>
			))}
		</View>
	);

	return (
		<View style={styles.container}>
			<View style={styles.masonryContainer}>
				{renderColumn(leftColumn, true)}
				{renderColumn(rightColumn, false)}
			</View>
		</View>
	);
};

const createStyles = (theme: any) => StyleSheet.create({
	container: {
		paddingHorizontal: 16,
		paddingTop: 16,
	},
	masonryContainer: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	column: {
		flex: 1,
	},
	leftColumn: {
		marginRight: 7.5, // Half of spacing (15/2)
	},
	rightColumn: {
		marginLeft: 7.5, // Half of spacing (15/2)
	},
	cardContainer: {
		marginBottom: 15, // Match DocumentGrid spacing
	},
	card: {
		backgroundColor: theme.surface,
		borderRadius: 12,
		overflow: "hidden",
		shadowColor: theme.shadow,
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 10, // Match DocumentCard elevation
		position: "relative",
	},
	image: {
		backgroundColor: theme.skeleton,
	},
	typeBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	badgeIcon: {
		width: 12,
		height: 12,
		backgroundColor: theme.skeleton,
		borderRadius: 2,
		marginRight: 4,
	},
	badgeText: {
		width: 40,
		height: 11,
		backgroundColor: theme.skeleton,
		borderRadius: 2,
	},
});
