import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { BorderRadius, Spacing } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useEffect, useRef } from "react";
import {
	StyleSheet,
	TextInput,
	type ViewStyle,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

interface SearchBarProps {
	value: string;
	onChangeText: (text: string) => void;
	onClose: () => void;
	onSearch: () => void;
	placeholder?: string;
	autoFocus?: boolean;
	style?: ViewStyle;
	testID?: string;
}

export function SearchBar({
	value,
	onChangeText,
	onClose,
	onSearch,
	placeholder = "Search your photos...",
	autoFocus = true,
	style,
	testID,
}: SearchBarProps) {
	const { colors } = useTheme();
	const inputRef = useRef<TextInput>(null);
	const scale = useSharedValue(0.95);
	const opacity = useSharedValue(0);

	useEffect(() => {
		// Animate in
		scale.value = withSpring(1, { damping: 20, stiffness: 300 });
		opacity.value = withSpring(1, { damping: 20, stiffness: 300 });

		// Auto-focus if enabled
		if (autoFocus) {
			setTimeout(() => {
				inputRef.current?.focus();
			}, 100);
		}
	}, [autoFocus, scale, opacity]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));

	return (
		<Animated.View
			style={[
				styles.container,
				{
					backgroundColor: colors.navigationBackground,
					borderTopColor: colors.navigationBorder,
				},
				animatedStyle,
				style,
			]}
			testID={testID}
		>
			{/* Close button */}
			<Button
				variant="icon"
				size="small"
				onPress={onClose}
				icon={<Icon name="close" size="small" />}
				testID={`${testID}-close`}
			/>

			{/* Search input */}
			<TextInput
				ref={inputRef}
				style={[
					styles.input,
					{
						backgroundColor: colors.surfaceSecondary,
						color: colors.text,
						borderColor: colors.border,
					},
				]}
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={colors.textTertiary}
				returnKeyType="search"
				onSubmitEditing={onSearch}
				testID={`${testID}-input`}
			/>

			{/* Search button */}
			<Button
				variant="icon"
				size="small"
				onPress={onSearch}
				icon={<Icon name="magnify" size="small" />}
				testID={`${testID}-search`}
			/>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
		borderTopWidth: 1,
		gap: Spacing.sm,
	},
	input: {
		flex: 1,
		height: 40,
		paddingHorizontal: Spacing.md,
		borderRadius: BorderRadius.full,
		borderWidth: 1,
		fontSize: 16,
	},
});
