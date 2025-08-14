import React, { useEffect } from "react";
import { Dimensions, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./SkeletonGrid.style";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SkeletonGridProps {
	columns: number;
	count: number;
}

const SkeletonCard: React.FC<{
	width: number;
	height: number;
	styles: any;
	theme: any;
}> = ({ width, height, styles, theme }) => {
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
	const { theme } = useTheme();
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
					<SkeletonCard
						width={itemWidth}
						height={item.height}
						styles={styles}
						theme={theme}
					/>
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
