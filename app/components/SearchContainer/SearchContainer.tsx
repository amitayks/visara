import React, { useCallback, useRef } from "react";
import {
	Keyboard,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, { SlideInDown, SlideOutUp } from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";

import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useDocumentStore } from "../../../stores/documentStore";
import { useSearchStore } from "../../../stores/searchStore";
import { useIconColors } from "../../../utils/iconColors";
import { showToast } from "../Toast";
import { createStyles } from "./SearchContainer.style";

export interface QueryChip {
	id: string;
	text: string;
	type: "search" | "filter" | "date" | "amount";
}

export const SearchContainer: React.FC = () => {
	const { theme } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);
	const inputRef = useRef<TextInput>(null);

	const { documents, setFilteredDocuments } = useDocumentStore();
	const {
		queryChips,
		addQueryChip,
		removeQueryChip,
		clearSearch,
		searchQuery,
		setSearchQuery,
	} = useSearchStore();

	const handleClearSearch = useCallback(() => {
		clearSearch();
		setFilteredDocuments(documents);
		Keyboard.dismiss();
	}, [clearSearch, documents, setFilteredDocuments]);

	const handleRemoveChip = useCallback(
		async (chipId: string) => {
			try {
				const docs = await removeQueryChip(chipId);
				if (docs.length === 0) {
					// No chips left, show all documents
					setFilteredDocuments(documents);
				} else {
					// Update with search results
					setFilteredDocuments(docs);
				}
			} catch (error) {
				showToast({
					type: "error",
					message: "Search failed",
				});
			}
		},
		[removeQueryChip, documents, setFilteredDocuments],
	);

	const handleSearch = useCallback(async () => {
		if (searchQuery.trim()) {
			try {
				const docs = await addQueryChip(searchQuery);
				setFilteredDocuments(docs);
			} catch (error) {
				showToast({
					type: "error",
					message: "Search failed",
				});
			}
		}
	}, [searchQuery, addQueryChip, setFilteredDocuments]);

	const handleInputChange = useCallback(
		(text: string) => {
			setSearchQuery(text);
			if (!text.trim() && queryChips.length === 0) {
				setFilteredDocuments(documents);
			}
		},
		[setSearchQuery, setFilteredDocuments, documents],
	);

	return (
		<View style={[styles.container]}>
			{queryChips.length > 0 && (
				<Animated.View style={styles.chipsContainer}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.chipsScrollContent}
					>
						<TouchableOpacity
							style={styles.CloseAllButton}
							onPress={handleClearSearch}
						>
							<Icon
								name="close-circle"
								style={{ color: theme.secondary }}
								size={20}
							/>
						</TouchableOpacity>
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
										onPress={() => handleRemoveChip(chip.id)}
										style={styles.removeButton}
										hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
									>
										<Icon
											name="close-circle"
											size={16}
											color={theme.secondary}
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
						value={searchQuery}
						onChangeText={handleInputChange}
						placeholder="Search documents..."
						placeholderTextColor={iconColors.placeholder}
						style={styles.input}
						returnKeyType="search"
						onSubmitEditing={handleSearch}
						autoFocus={false}
						selectionColor={theme.accent}
						autoCapitalize="none"
						autoCorrect={false}
					/>
				</View>

				<Animated.View style={[styles.sendButtonContainer]}>
					<TouchableOpacity
						onPress={handleSearch}
						activeOpacity={0.7}
						disabled={!(searchQuery.length > 0) || queryChips.length >= 4}
						style={styles.sendButton}
					>
						<Icon name="search" size={24} color={iconColors.accent} />
					</TouchableOpacity>
				</Animated.View>
			</View>
		</View>
	);
};
