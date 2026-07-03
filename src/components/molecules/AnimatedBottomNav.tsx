import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { BorderRadius, Spacing } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useEffect } from "react";
import {
	Keyboard,
	Pressable,
	StyleSheet,
	TextInput,
	type ViewStyle,
} from "react-native";
import Animated, {
	Extrapolation,
	interpolate,
	useAnimatedKeyboard,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

interface AnimatedBottomNavProps {
	/** Whether search mode is active */
	searchMode: boolean;
	/** Whether document mode is active */
	documentMode: boolean;
	/** Current page index (0 = Main, 1 = Albums) */
	currentPage: number;

	// Search mode props
	searchQuery?: string;
	onSearchQueryChange?: (text: string) => void;
	onSearchSubmit?: () => void;

	// Button handlers
	onSearchPress: () => void;
	onDocumentsPress: () => void;
	onAlbumsPress: () => void;
	onSettingsPress: () => void;
	onSearchClose?: () => void;

	style?: ViewStyle;
	testID?: string;
}

const ANIMATION_DURATION = 300;

export function AnimatedBottomNav({
	searchMode,
	documentMode,
	currentPage,
	searchQuery = "",
	onSearchQueryChange,
	onSearchSubmit,
	onSearchPress,
	onDocumentsPress,
	onAlbumsPress,
	onSettingsPress,
	onSearchClose,
	style,
	testID,
}: AnimatedBottomNavProps) {
	const { colors, shadows } = useTheme();

	// Animation value: 0 = normal mode, 1 = search mode
	const animationProgress = useSharedValue(searchMode ? 1 : 0);

	// Keyboard animation hook
	const keyboard = useAnimatedKeyboard();

	// Update animation when searchMode changes
	useEffect(() => {
		animationProgress.value = withTiming(searchMode ? 1 : 0, {
			duration: ANIMATION_DURATION,
		});

		// Open keyboard in search mode
		if (searchMode) {
			setTimeout(() => {
				// Focus will be handled by TextInput autoFocus
			}, ANIMATION_DURATION);
		} else {
			Keyboard.dismiss();
		}
	}, [searchMode, animationProgress]);

	// Animated styles for container with keyboard avoidance
	const containerStyle = useAnimatedStyle(() => {
		// Base bottom position
		const baseBottom = 10;

		// Add keyboard height to bottom position
		const bottom = baseBottom + keyboard.height.value;

		return {
			bottom,
		};
	});

	// Animated styles for search icon (moves and scales)
	const searchIconStyle = useAnimatedStyle(() => {
		const translateX = interpolate(
			animationProgress.value,
			[0, 1],
			[0, -Spacing.sm],
			Extrapolation.CLAMP,
		);

		return {
			transform: [{ translateX }],
		};
	});

	// Animated styles for search input (fades in and expands)
	const searchInputStyle = useAnimatedStyle(() => ({
		opacity: animationProgress.value,
		width: interpolate(
			animationProgress.value,
			[0, 1],
			[0, 200],
			Extrapolation.CLAMP,
		),
	}));

	// Animated styles for normal mode buttons (fade out when search is active)
	const normalButtonsStyle = useAnimatedStyle(() => ({
		opacity: interpolate(
			animationProgress.value,
			[0, 1],
			[1, 0],
			Extrapolation.CLAMP,
		),
		pointerEvents: animationProgress.value < 0.5 ? "auto" : "none",
	}));

	// Animated styles for search mode elements (fade in when search is active)
	const searchModeStyle = useAnimatedStyle(() => ({
		opacity: animationProgress.value,
		pointerEvents: animationProgress.value > 0.5 ? "auto" : "none",
	}));

	// Handle search submit
	const handleSearchSubmit = () => {
		if (onSearchSubmit) {
			onSearchSubmit();
		}
		Keyboard.dismiss();
	};

	// Handle search close
	const handleSearchClose = () => {
		console.log("Closing search");
		if (onSearchClose) {
			onSearchClose();
		}
	};

	return (
		<Animated.View
			style={[
				styles.container,
				{
					backgroundColor: colors.navigationBackground,
					borderTopColor: colors.navigationBorder,
				},
				shadows.lg,
				containerStyle,
				style,
			]}
			testID={testID}
		>
			{/* Normal mode: 4 buttons - Always rendered, controlled by animation */}
			<Animated.View style={[styles.normalModeContainer, normalButtonsStyle]}>
				{/* Search button */}
				<Button
					variant="icon"
					onPress={onSearchPress}
					icon={
						<Icon
							name="magnify"
							size="medium"
							color={colors.navigationInactive}
						/>
					}
					testID={`${testID}-search`}
				/>

				{/* Documents button */}
				<Button
					variant="icon"
					onPress={onDocumentsPress}
					icon={
						<Icon
							name="file-document-outline"
							size="medium"
							color={
								documentMode
									? colors.navigationActive
									: colors.navigationInactive
							}
						/>
					}
					style={styles.button}
					testID={`${testID}-documents`}
				/>

				{/* Albums button */}
				<Button
					variant="icon"
					onPress={onAlbumsPress}
					icon={
						<Icon
							name="folder-multiple-image"
							size="medium"
							color={
								currentPage === 1
									? colors.navigationActive
									: colors.navigationInactive
							}
						/>
					}
					style={styles.button}
					testID={`${testID}-albums`}
				/>

				{/* Settings button */}
				<Button
					variant="icon"
					onPress={onSettingsPress}
					icon={
						<Icon
							name="cog-outline"
							size="medium"
							color={colors.navigationInactive}
						/>
					}
					style={styles.button}
					testID={`${testID}-settings`}
				/>
			</Animated.View>

			{/* Search mode UI - Always rendered, controlled by animation */}
			<Animated.View style={[styles.searchModeContainer, searchModeStyle]}>
				{/* Close button (left) */}
				<Pressable
					onPress={handleSearchClose}
					hitSlop={10}
					style={styles.closeButton}
				>
					<Icon name="close" size="medium" color={colors.text} />
				</Pressable>

				{/* Search input */}
				<Animated.View style={[styles.searchInputContainer, searchInputStyle]}>
					<TextInput
						value={searchQuery}
						onChangeText={onSearchQueryChange}
						onSubmitEditing={handleSearchSubmit}
						placeholder="Search your photos..."
						placeholderTextColor={colors.textSecondary}
						autoFocus={searchMode}
						returnKeyType="search"
						style={[
							styles.searchInput,
							{
								color: colors.text,
								backgroundColor: colors.surface,
							},
						]}
					/>
				</Animated.View>

				{/* Search icon (right) */}
				<Animated.View style={searchIconStyle}>
					<Pressable onPress={handleSearchSubmit} hitSlop={10}>
						<Icon
							name="magnify"
							size="medium"
							color={colors.navigationActive}
						/>
					</Pressable>
				</Animated.View>
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		left: Spacing.md,
		right: Spacing.md,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingVertical: Spacing.sm,
		paddingHorizontal: Spacing.md,
		borderRadius: BorderRadius.full,
		minHeight: 64,
	},
	normalModeContainer: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingHorizontal: Spacing.md,
	},
	searchModeContainer: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: Spacing.sm,
	},
	button: {
		// flex: 1,
	},
	closeButton: {
		paddingHorizontal: Spacing.xs,
	},
	searchInputContainer: {
		flex: 1,
		marginHorizontal: Spacing.sm,
	},
	searchInput: {
		height: 40,
		borderRadius: BorderRadius.lg,
		paddingHorizontal: Spacing.md,
		fontSize: 16,
	},
});
