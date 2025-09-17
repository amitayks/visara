import React, { useState, useCallback, useRef, useEffect } from "react";
import {
	View,
	TextInput,
	StyleSheet,
	TouchableOpacity,
	Text,
	ActivityIndicator,
	Platform,
	Keyboard,
	ScrollView,
	Modal,
	TouchableWithoutFeedback,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
	interpolate,
} from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
// import { AutocompleteDropdown } from "react-native-autocomplete-dropdown"; // Removed - package issues
import { useTheme } from "../../../contexts/ThemeContext";
import { useSearchStore } from "../../../stores/searchStore";
import { MiniSearchService } from "../../../services/search/MiniSearchService";
import { AutocompleteService } from "../../../services/search/AutocompleteService";
import type { SearchResult } from "../../../services/search/MiniSearchService";
import type { Suggestion } from "../../../services/search/AutocompleteService";
import { SearchSuggestionItem } from "./SearchSuggestionItem";
import { SearchHistory } from "./SearchHistory";

interface SearchBarProps {
	onResultsChange?: (results: SearchResult[]) => void;
	placeholder?: string;
	showHistory?: boolean;
	autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
	onResultsChange,
	placeholder = "Search documents...",
	showHistory = true,
	autoFocus = false,
}) => {
	const { theme, isDark } = useTheme();
	const {
		searchQuery,
		searchResults,
		isSearching,
		searchHistory,
		setSearchQuery,
		setSearchResults,
		setIsSearching,
		addToHistory,
	} = useSearchStore();

	const [localQuery, setLocalQuery] = useState(searchQuery);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [resultCount, setResultCount] = useState(0);

	const searchService = useRef(MiniSearchService.getInstance());
	const autocompleteService = useRef(AutocompleteService.getInstance());
	const searchTimeout = useRef<NodeJS.Timeout>();

	// Animation values
	const focusAnimation = useSharedValue(0);
	const clearButtonOpacity = useSharedValue(0);
	const searchIconOpacity = useSharedValue(1);
	const loadingOpacity = useSharedValue(0);
	const resultCountOpacity = useSharedValue(0);

	const styles = createStyles(theme, isDark);

	// Perform search
	const performSearch = useCallback(
		async (query: string) => {
			if (!query || query.trim().length === 0) {
				setSearchResults([]);
				setResultCount(0);
				onResultsChange?.([]);
				resultCountOpacity.value = withSpring(0);
				return;
			}

			setIsSearching(true);
			try {
				const results = await searchService.current.search(query, {
					fuzzy: 0.2,
					prefix: true,
					limit: 50,
				});

				setSearchResults(results);
				setResultCount(results.length);
				onResultsChange?.(results);

				// Animate result count
				resultCountOpacity.value = withSpring(results.length > 0 ? 1 : 0);

				// Add to history if results found
				if (results.length > 0) {
					await autocompleteService.current.addToHistory(query, results.length);
					addToHistory(query);
				}
			} catch (error) {
				console.error("[SearchBar] Search error:", error);
				setSearchResults([]);
				setResultCount(0);
				resultCountOpacity.value = withSpring(0);
			} finally {
				setIsSearching(false);
			}
		},
		[onResultsChange, setSearchResults, setIsSearching, addToHistory],
	);

	// Debounced search
	const handleSearchChange = useCallback(
		(text: string) => {
			setLocalQuery(text);
			setSearchQuery(text);

			// Clear previous timeout
			if (searchTimeout.current) {
				clearTimeout(searchTimeout.current);
			}

			// Update clear button visibility and search icon visibility
			clearButtonOpacity.value = withSpring(text.length > 0 ? 1 : 0);
			searchIconOpacity.value = withSpring(text.length > 0 ? 0 : 1);

			// Get suggestions
			if (text.length >= 2) {
				autocompleteService.current
					.getSuggestions(text, {
						includeHistory: true,
						includeKeywords: true,
						includeSmart: true,
						limit: 8,
					})
					.then((suggs) => {
						setSuggestions(suggs);
						setShowSuggestions(true);
					});
			} else {
				setSuggestions([]);
				setShowSuggestions(false);
			}

			// Perform search after debounce
			searchTimeout.current = setTimeout(() => {
				performSearch(text);
			}, 300);
		},
		[setSearchQuery, performSearch, clearButtonOpacity],
	);

	// Handle suggestion selection
	// const handleSuggestionSelect = useCallback(
	// 	(suggestion: Suggestion) => {
	// 		const query = suggestion.title;
	// 		setLocalQuery(query);
	// 		setSearchQuery(query);
	// 		setShowSuggestions(false);
	// 		performSearch(query);
	// 		Keyboard.dismiss();
	// 	},
	// 	[setSearchQuery, performSearch],
	// );

	// Clear search
	const handleClear = useCallback(() => {
		setLocalQuery("");
		setSearchQuery("");
		setSearchResults([]);
		setResultCount(0);
		setSuggestions([]);
		setShowSuggestions(false);
		onResultsChange?.([]);
		clearButtonOpacity.value = withSpring(0);
		searchIconOpacity.value = withSpring(1);
		resultCountOpacity.value = withSpring(0);
	}, [setSearchQuery, setSearchResults, onResultsChange, clearButtonOpacity]);

	// Handle focus/blur
	const handleFocus = useCallback(() => {
		focusAnimation.value = withSpring(1);
		if (localQuery.length >= 2 && suggestions.length > 0) {
			setShowSuggestions(true);
		}
	}, [focusAnimation, localQuery, suggestions]);

	const handleBlur = useCallback(() => {
		focusAnimation.value = withSpring(0);
		// Delay to allow suggestion tap
		setTimeout(() => setShowSuggestions(false), 200);
	}, [focusAnimation]);

	// Sync local query with store query (for external updates like back button)
	useEffect(() => {
		if (searchQuery !== localQuery) {
			setLocalQuery(searchQuery);
			// Update animations to match the new state
			clearButtonOpacity.value = withSpring(searchQuery.length > 0 ? 1 : 0);
			searchIconOpacity.value = withSpring(searchQuery.length > 0 ? 0 : 1);
			// Update result count if clearing
			if (searchQuery.length === 0) {
				setResultCount(0);
				resultCountOpacity.value = withSpring(0);
			}
		}
	}, [searchQuery, localQuery, clearButtonOpacity, searchIconOpacity, resultCountOpacity]);

	// Loading animation
	useEffect(() => {
		loadingOpacity.value = withTiming(isSearching ? 1 : 0);
	}, [isSearching, loadingOpacity]);

	// Animated styles
	const containerAnimatedStyle = useAnimatedStyle(() => ({
		transform: [
			{
				scale: interpolate(focusAnimation.value, [0, 1], [1, 1.02]),
			},
		],
		shadowOpacity: interpolate(focusAnimation.value, [0, 1], [0.1, 0.2]),
	}));

	const clearButtonAnimatedStyle = useAnimatedStyle(() => ({
		opacity: clearButtonOpacity.value,
		transform: [
			{
				scale: clearButtonOpacity.value,
			},
		],
	}));

	const loadingAnimatedStyle = useAnimatedStyle(() => ({
		opacity: loadingOpacity.value,
	}));

	const searchIconAnimatedStyle = useAnimatedStyle(() => ({
		opacity: searchIconOpacity.value,
		transform: [
			{
				scale: searchIconOpacity.value,
			},
		],
	}));

	const resultCountAnimatedStyle = useAnimatedStyle(() => ({
		opacity: resultCountOpacity.value,
		transform: [
			{
				scale: resultCountOpacity.value,
			},
		],
	}));

	return (
		<View style={styles.wrapper}>
			<Animated.View style={[styles.container, containerAnimatedStyle]}>
				{/* Search Icon */}
				{/* <Animated.View style={searchIconAnimatedStyle}> */}
				<Icon name="search" size={20} color={theme.secondary} />
				{/* </Animated.View> */}

				{/* Text Input */}
				<TextInput
					style={styles.input}
					placeholder={placeholder}
					placeholderTextColor={theme.secondary}
					value={localQuery}
					onChangeText={handleSearchChange}
					onFocus={handleFocus}
					onBlur={handleBlur}
					autoCorrect={false}
					autoCapitalize="none"
					autoFocus={autoFocus}
					returnKeyType="search"
					onSubmitEditing={() => {
						if (localQuery) {
							performSearch(localQuery);
							setShowSuggestions(false);
						}
					}}
				/>

				{/* Right side buttons */}
				<View style={styles.rightContainer}>
					{/* Loading indicator */}
					<Animated.View
						style={[styles.loadingContainer, loadingAnimatedStyle]}
					>
						<ActivityIndicator size="small" color={theme.primary} />
					</Animated.View>

					{/* Result count */}
					{!isSearching && resultCount > 0 && localQuery.length > 0 && (
						<Animated.View
							style={[styles.resultCount, resultCountAnimatedStyle]}
						>
							<Text style={styles.resultCountText}>{resultCount}</Text>
						</Animated.View>
					)}

					{/* Clear button */}
					{localQuery.length > 0 && (
						<Animated.View style={clearButtonAnimatedStyle}>
							<TouchableOpacity
								onPress={handleClear}
								style={styles.clearButton}
							>
								<Icon name="close-circle" size={25} color={theme.tertiary} />
							</TouchableOpacity>
						</Animated.View>
					)}
				</View>
			</Animated.View>

			{/* Suggestions Dropdown */}
			{/* {showSuggestions && suggestions.length > 0 && (
				<View style={styles.suggestionsContainer}>
					<ScrollView
						style={styles.suggestionsList}
						keyboardShouldPersistTaps="handled"
						nestedScrollEnabled={true}
					>
						{suggestions.map((suggestion, index) => (
							<TouchableOpacity
								key={suggestion.id}
								onPress={() => handleSuggestionSelect(suggestion)}
								activeOpacity={0.7}
							>
								<SearchSuggestionItem
									item={suggestion}
									searchText={localQuery}
									theme={theme}
									isDark={isDark}
								/>
								{index < suggestions.length - 1 && (
									<View style={styles.separator} />
								)}
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>
			)} */}

			{/* Search History */}
			{/* {showHistory && !localQuery && searchHistory.length > 0 && (
				<SearchHistory
					onSelectSearch={(query) => {
						setLocalQuery(query);
						handleSearchChange(query);
					}}
					theme={theme}
					isDark={isDark}
				/>
			)} */}
		</View>
	);
};

const createStyles = (theme: any, isDark: boolean) =>
	StyleSheet.create({
		wrapper: {
			zIndex: 100,
			// backgroundColor: theme.background,
		},
		container: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.background,
			borderRadius: theme.borderRadius + 20,
			paddingHorizontal: 16,
			height: 60,
			borderWidth: 1,
			borderColor: theme.border,
			marginHorizontal: 10,
			marginBottom: 10,
			...Platform.select({
				ios: {
					shadowColor: "#000",
					shadowOffset: { width: 0, height: 2 },
					shadowRadius: 8,
					shadowOpacity: 0.1,
				},
				android: {
					elevation: 4,
				},
			}),
		},
		input: {
			flex: 1,
			fontSize: 16,
			color: theme.text,
			paddingHorizontal: 12,
		},
		rightContainer: {
			flexDirection: "row",
			alignItems: "center",
			// backgroundColor: theme.background,
		},
		loadingContainer: {
			marginRight: 8,
		},
		resultCount: {
			backgroundColor: theme.tertiary,
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: theme.borderRadius,
			marginRight: 8,
		},
		resultCountText: {
			color: theme.text,
			fontSize: 12,
			fontWeight: "600",
		},
		clearButton: {
			padding: 4,
		},
		suggestionsContainer: {
			position: "absolute",
			top: 55,
			left: 0,
			right: 0,
			maxHeight: 300,
			zIndex: 1000,
		},
		suggestionsList: {
			backgroundColor: theme.card,
			borderRadius: 8,
			borderWidth: 1,
			borderColor: theme.border,
			...Platform.select({
				ios: {
					shadowColor: "#000",
					shadowOffset: { width: 0, height: 2 },
					shadowRadius: 8,
					shadowOpacity: 0.15,
				},
				android: {
					elevation: 5,
				},
			}),
		},
		separator: {
			height: 1,
			backgroundColor: theme.border,
		},
	});
