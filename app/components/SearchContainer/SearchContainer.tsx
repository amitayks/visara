import React, { useEffect, useRef } from "react";
import {
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	ViewStyle,
} from "react-native";
import Animated, {
	SlideInUp,
	SlideOutUp,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { createStyles } from "./SearchContainer.style";

export interface QueryChip {
	id: string;
	text: string;
	type: "search" | "filter" | "date" | "amount";
}

interface SearchContainerProps {
	searchValue: string;
	onSearchChange: (text: string) => void;
	onSubmit: () => void;
	queryChips: QueryChip[];
	onRemoveChip: (id: string) => void;
	placeholder?: string;
	showSendButton: boolean;
	autoFocus?: boolean;
	style?: ViewStyle;
}

export const SearchContainer: React.FC<SearchContainerProps> = ({
	searchValue,
	onSearchChange,
	onSubmit,
	queryChips,
	onRemoveChip,
	placeholder = "Search documents...",
	showSendButton,
	autoFocus = false,
	style,
}) => {
	const { theme } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	const inputRef = useRef<TextInput>(null);
	const buttonScale = useSharedValue(showSendButton ? 1 : 0);
	const buttonWidth = useSharedValue(showSendButton ? 56 : 0);

	const buttonStyle = useAnimatedStyle(() => ({
		transform: [
			{
				scale: withSpring(buttonScale.value, {
					damping: 20,
					stiffness: 120,
				}),
			},
		],
		opacity: buttonScale.value,
		width: withSpring(buttonWidth.value, {
			damping: 20,
			stiffness: 120,
		}),
	}));

	useEffect(() => {
		buttonScale.value = showSendButton ? 1 : 0;
		buttonWidth.value = showSendButton ? 56 : 0;
	}, [showSendButton]);

	const handleSubmit = () => {
		if (searchValue.trim()) {
			onSubmit();
			// Keep keyboard open for multiple searches - it will be dismissed on scroll
		}
	};

	const getChipColor = (type: QueryChip["type"]) => {
		switch (type) {
			case "search":
				return "#6366F1";
			case "filter":
				return "#10B981";
			case "date":
				return "#F59E0B";
			case "amount":
				return "#EC4899";
			default:
				return "#6366F1";
		}
	};

	const getChipIcon = (type: QueryChip["type"]) => {
		switch (type) {
			case "search":
				return "search";
			case "filter":
				return "filter";
			case "date":
				return "calendar";
			case "amount":
				return "cash";
			default:
				return "search";
		}
	};

	return (
		<View style={[styles.container, style]}>
			{/* Query Chips - Animated container that slides up/down */}
			{queryChips.length > 0 && (
				<Animated.View
					entering={SlideInUp.duration(300)}
					exiting={SlideOutUp.duration(300)}
					style={styles.chipsContainer}
				>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.chipsScrollContent}
						keyboardShouldPersistTaps="always"
					>
						{queryChips.map((chip) => (
							<Animated.View
								key={chip.id}
								entering={SlideInUp.delay(100)}
								exiting={SlideOutUp}
								style={styles.chipWrapper}
							>
								<View
									style={[
										styles.chip,
										{ backgroundColor: `${getChipColor(chip.type)}15` },
									]}
								>
									<Icon
										name={getChipIcon(chip.type)}
										size={14}
										color={getChipColor(chip.type)}
										style={styles.chipIcon}
									/>
									<Text
										style={[
											styles.chipText,
											{ color: getChipColor(chip.type) },
										]}
										numberOfLines={1}
									>
										{chip.text}
									</Text>
									<TouchableOpacity
										onPress={() => onRemoveChip(chip.id)}
										activeOpacity={0.7}
										style={styles.removeButton}
										hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
									>
										<Icon
											name="close-circle"
											size={16}
											color={getChipColor(chip.type)}
										/>
									</TouchableOpacity>
								</View>
							</Animated.View>
						))}
					</ScrollView>
				</Animated.View>
			)}

			{/* Search Input Row */}
			<View style={styles.searchInputRow}>
				<View style={styles.inputContainer}>
					<TextInput
						ref={inputRef}
						value={searchValue}
						onChangeText={onSearchChange}
						placeholder={placeholder}
						style={styles.input}
						returnKeyType="search"
						onSubmitEditing={handleSubmit}
						placeholderTextColor={iconColors.placeholder}
						autoFocus={autoFocus}
						selectionColor={theme.accent}
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>

				<Animated.View style={[styles.sendButtonContainer, buttonStyle]}>
					<TouchableOpacity
						onPress={handleSubmit}
						activeOpacity={0.7}
						disabled={!showSendButton}
						style={styles.sendButton}
					>
						<Icon name="send" size={22} color={iconColors.accent} />
					</TouchableOpacity>
				</Animated.View>
			</View>
		</View>
	);
};
