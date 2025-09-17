import React, { useEffect } from "react";
import { FlatList, View } from "react-native";
import Animated, {
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./SkeletonGrid.style";
import {
	COLUMNS,
	ITEM_HEIGHT,
	ITEM_WIDTH,
	CONTAINER_PADDING,
	SPACING,
} from "../DocumentGrid/documentGridConst";

interface SkeletonGridProps {
	count?: number;
}

const SkeletonCard: React.FC<{
	styles: any;
	theme: any;
	width: number;
	height: number;
}> = ({ styles, theme, width, height }) => {
	const shimmer = useSharedValue(0);

	useEffect(() => {
		shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1, false);
	}, []);

	const shimmerStyle = useAnimatedStyle(() => {
		const opacity = interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]);
		return { opacity };
	});

	return (
		<View style={styles.cardContainer}>
			<View style={[styles.skeletonCard, { width }]}>
				<View style={styles.imageContainer}>
					<Animated.View
						style={[
							styles.image,
							shimmerStyle,
							{ width: width, height: height },
						]}
					/>
				</View>
			</View>
		</View>
	);
};

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({ count = 12 }) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);

	// Generate skeleton items
	const skeletonData = Array.from({ length: count }, (_, index) => ({
		id: `skeleton-${index}`,
		index,
	}));

	const renderSkeletonItem = ({
		item,
	}: {
		item: { id: string; index: number };
	}) => <SkeletonCard styles={styles} theme={theme} width={ITEM_WIDTH} height={ITEM_HEIGHT} />;

	const keyExtractor = (item: { id: string; index: number }) => item.id;

	return (
		<FlatList
			data={skeletonData}
			renderItem={renderSkeletonItem}
			keyExtractor={keyExtractor}
			numColumns={COLUMNS}
			// Match DocumentGrid FlashList styling exactly
			contentContainerStyle={{
				paddingBottom: 100,
				// paddingRight: 12,
			}}
			showsVerticalScrollIndicator={false}
			scrollEnabled={false} // Disable scrolling for skeleton
		/>
	);
};
