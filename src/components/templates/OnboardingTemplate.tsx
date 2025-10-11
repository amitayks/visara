import { Button } from "@components/atoms/Button";
import { BorderRadius, Spacing } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	StyleSheet,
	View,
	type ListRenderItem,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface OnboardingScreen {
	id: string;
	content: React.ReactElement;
}

interface OnboardingTemplateProps {
	screens: OnboardingScreen[];
	onComplete: () => void;
	onSkip?: () => void;
	showSkip?: boolean; // Show skip button after first screen
	style?: ViewStyle;
	testID?: string;
}

export function OnboardingTemplate({
	screens,
	onComplete,
	onSkip,
	showSkip = true,
	style,
	testID,
}: OnboardingTemplateProps) {
	const { colors } = useTheme();
	const flatListRef = useRef<FlatList<OnboardingScreen>>(null);
	const [currentIndex, setCurrentIndex] = useState(0);
	const screenWidth = Dimensions.get("window").width;

	const isLastScreen = currentIndex === screens.length - 1;
	const canSkip = showSkip && currentIndex > 0 && !isLastScreen;

	const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const offsetX = event.nativeEvent.contentOffset.x;
		const index = Math.round(offsetX / screenWidth);
		setCurrentIndex(index);
	}, [screenWidth]);

	const handleNext = useCallback(() => {
		if (isLastScreen) {
			onComplete();
		} else {
			const nextIndex = currentIndex + 1;
			flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
			setCurrentIndex(nextIndex);
		}
	}, [currentIndex, isLastScreen, onComplete]);

	const handleSkip = useCallback(() => {
		if (onSkip) {
			onSkip();
		}
	}, [onSkip]);

	const renderItem: ListRenderItem<OnboardingScreen> = useCallback(({ item }) => {
		return (
			<View style={[styles.screenContainer, { width: screenWidth }]}>
				{item.content}
			</View>
		);
	}, [screenWidth]);

	const keyExtractor = useCallback((item: OnboardingScreen) => item.id, []);

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }, style]}
			edges={["top", "bottom"]}
			testID={testID}
		>
			{/* Horizontal Scrollable Screens */}
			<FlatList
				ref={flatListRef}
				data={screens}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				bounces={false}
				style={styles.flatList}
			/>

			{/* Footer with Dots Indicator and Buttons */}
			<View style={styles.footer}>
				{/* Dots Indicator */}
				<View style={styles.dotsContainer}>
					{screens.map((screen, index) => (
						<View
							key={screen.id}
							style={[
								styles.dot,
								{
									backgroundColor: index === currentIndex
										? colors.buttonPrimary
										: colors.border,
								},
								index === currentIndex && styles.activeDot,
							]}
						/>
					))}
				</View>

				{/* Buttons */}
				<View style={styles.buttonsContainer}>
					{canSkip && onSkip && (
						<Button
							variant="text"
							size="medium"
							onPress={handleSkip}
							style={styles.skipButton}
						>
							Skip
						</Button>
					)}

					<Button
						variant="primary"
						size="large"
						onPress={handleNext}
						style={styles.nextButton}
					>
						{isLastScreen ? "Get Started" : "Next"}
					</Button>
				</View>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	flatList: {
		flex: 1,
	},
	screenContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: Spacing.xl,
	},
	footer: {
		paddingHorizontal: Spacing.xl,
		paddingBottom: Spacing.xl,
		paddingTop: Spacing.lg,
	},
	dotsContainer: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: Spacing.xl,
		gap: Spacing.xs,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: BorderRadius.full,
	},
	activeDot: {
		width: 24,
		height: 8,
		borderRadius: BorderRadius.full,
	},
	buttonsContainer: {
		gap: Spacing.md,
	},
	skipButton: {
		alignSelf: "center",
	},
	nextButton: {
		width: "100%",
	},
});
