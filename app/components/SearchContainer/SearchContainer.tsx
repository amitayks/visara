import React, { useRef } from "react";
import {
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	ViewStyle,
} from "react-native";
import Animated, { SlideInDown, SlideOutUp } from "react-native-reanimated";
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

	const handleSubmit = () => {
		if (searchValue.trim()) {
			onSubmit();
		}
	};

	return (
		<View style={[styles.container, style]}>
			{queryChips.length > 0 && (
				<Animated.View
					// entering={SlideInDown.duration(300)}
					// exiting={SlideOutDown.duration(300)}
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
								entering={SlideInDown.delay(300)}
								exiting={SlideOutUp}
								style={styles.chipWrapper}
							>
								<View style={styles.chip}>
									<Text style={[styles.chipText]} numberOfLines={1}>
										{chip.text}
									</Text>
									<TouchableOpacity
										onPress={() => onRemoveChip(chip.id)}
										style={styles.removeButton}
										hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
									>
										<Icon name="close-circle" size={16} />
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

				<Animated.View style={[styles.sendButtonContainer]}>
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
