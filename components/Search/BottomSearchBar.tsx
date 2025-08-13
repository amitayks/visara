import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	Dimensions,
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";

interface BottomSearchBarProps {
	onSearch: (query: string) => void;
	onQueryChange?: (query: string) => void;
	placeholder?: string;
	isSearching?: boolean;
	queries?: string[];
	onRemoveQuery?: (query: string) => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SEARCH_BAR_HEIGHT = 60;

// not used in the app //
export function BottomSearchBar({
	onSearch,
	onQueryChange,
	placeholder = "Search documents...",
	isSearching = false,
	queries = [],
	onRemoveQuery,
}: BottomSearchBarProps) {
	const [inputText, setInputText] = useState("");
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const inputRef = useRef<TextInput>(null);

	// Animated values
	const translateY = useSharedValue(0);
	const searchIconScale = useSharedValue(1);
	const inputOpacity = useSharedValue(1);

	// Handle keyboard events
	useEffect(() => {
		const keyboardWillShow = (event: any) => {
			const height = event.endCoordinates.height;
			setKeyboardHeight(height);
			translateY.value = withSpring(-height, {
				damping: 20,
				stiffness: 300,
			});
		};

		const keyboardWillHide = () => {
			setKeyboardHeight(0);
			translateY.value = withSpring(0, {
				damping: 20,
				stiffness: 300,
			});
		};

		const showListener = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
			keyboardWillShow,
		);
		const hideListener = Keyboard.addListener(
			Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
			keyboardWillHide,
		);

		return () => {
			showListener.remove();
			hideListener.remove();
		};
	}, [translateY]);

	// Handle input changes
	const handleInputChange = useCallback(
		(text: string) => {
			setInputText(text);
			onQueryChange?.(text);
		},
		[onQueryChange],
	);

	// Handle search submit
	const handleSubmit = useCallback(() => {
		if (inputText.trim()) {
			onSearch(inputText.trim());
			setInputText("");
			inputRef.current?.blur();
		}
	}, [inputText, onSearch]);

	// Handle search icon press
	const handleSearchPress = useCallback(() => {
		if (inputText.trim()) {
			// Animate search icon
			searchIconScale.value = withTiming(0.8, { duration: 100 }, () => {
				searchIconScale.value = withTiming(1, { duration: 100 });
				runOnJS(handleSubmit)();
			});
		} else {
			// Focus input if empty
			inputRef.current?.focus();
		}
	}, [inputText, handleSubmit, searchIconScale]);

	// Handle query chip removal
	const handleRemoveQuery = useCallback(
		(query: string) => {
			onRemoveQuery?.(query);
		},
		[onRemoveQuery],
	);

	// Animated styles
	const containerAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	const searchIconAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: searchIconScale.value }],
	}));

	const inputAnimatedStyle = useAnimatedStyle(() => ({
		opacity: inputOpacity.value,
	}));

	// Render query chips
	const renderQueryChips = () => {
		if (queries.length === 0) return null;

		return (
			<View style={styles.chipsContainer}>
				{queries.map((query, index) => (
					<QueryChip
						key={`${query}-${index}`}
						query={query}
						onRemove={() => handleRemoveQuery(query)}
					/>
				))}
			</View>
		);
	};

	return (
		<Animated.View style={[styles.container, containerAnimatedStyle]}>
			<SafeAreaView edges={["bottom"]} style={styles.safeArea}>
				{renderQueryChips()}

				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : "height"}
					style={styles.searchContainer}
				>
					<View style={styles.searchBar}>
						<TouchableOpacity
							style={styles.searchIconContainer}
							onPress={handleSearchPress}
							activeOpacity={0.7}
						>
							<Animated.View style={searchIconAnimatedStyle}>
								{isSearching ? (
									<Animated.View style={styles.loadingContainer}>
										<View style={styles.loadingDot} />
										<View
											style={[styles.loadingDot, styles.loadingDotDelay1]}
										/>
										<View
											style={[styles.loadingDot, styles.loadingDotDelay2]}
										/>
									</Animated.View>
								) : (
									<Icon name="search" size={20} color="#666666" />
								)}
							</Animated.View>
						</TouchableOpacity>

						<Animated.View style={[styles.inputContainer, inputAnimatedStyle]}>
							<TextInput
								ref={inputRef}
								style={styles.textInput}
								value={inputText}
								onChangeText={handleInputChange}
								placeholder={placeholder}
								placeholderTextColor="#999999"
								onSubmitEditing={handleSubmit}
								returnKeyType="search"
								blurOnSubmit={false}
								multiline={false}
								maxLength={100}
							/>
						</Animated.View>

						{inputText.length > 0 && (
							<TouchableOpacity
								style={styles.clearButton}
								onPress={() => {
									setInputText("");
									onQueryChange?.("");
								}}
								activeOpacity={0.7}
							>
								<Icon name="close-circle" size={20} color="#CCCCCC" />
							</TouchableOpacity>
						)}
					</View>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</Animated.View>
	);
}

// Query Chip Component
interface QueryChipProps {
	query: string;
	onRemove: () => void;
}

function QueryChip({ query, onRemove }: QueryChipProps) {
	const scale = useSharedValue(1);
	const opacity = useSharedValue(1);

	const handleRemove = useCallback(() => {
		scale.value = withTiming(0.8, { duration: 100 });
		opacity.value = withTiming(0, { duration: 150 }, () => {
			runOnJS(onRemove)();
		});
	}, [onRemove, scale, opacity]);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));

	useEffect(() => {
		// Animate in
		scale.value = withSpring(1, { damping: 15, stiffness: 300 });
		opacity.value = withTiming(1, { duration: 200 });
	}, [scale, opacity]);

	return (
		<Animated.View style={[styles.chip, animatedStyle]}>
			<Text style={styles.chipText} numberOfLines={1}>
				{query}
			</Text>
			<TouchableOpacity
				style={styles.chipRemoveButton}
				onPress={handleRemove}
				activeOpacity={0.7}
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			>
				<Icon name="close" size={14} color="#666666" />
			</TouchableOpacity>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: "#FFFFFF",
		borderTopWidth: 1,
		borderTopColor: "#E5E5E7",
	},
	safeArea: {
		backgroundColor: "transparent",
	},
	chipsContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		paddingHorizontal: 16,
		paddingTop: 12,
		gap: 8,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F2F2F7",
		borderRadius: 16,
		paddingHorizontal: 12,
		paddingVertical: 6,
		maxWidth: 200,
	},
	chipText: {
		fontSize: 14,
		color: "#333333",
		marginRight: 6,
		flex: 1,
	},
	chipRemoveButton: {
		padding: 2,
	},
	searchContainer: {
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F2F2F7",
		borderRadius: 20,
		paddingHorizontal: 16,
		paddingVertical: 10,
		minHeight: SEARCH_BAR_HEIGHT,
	},
	searchIconContainer: {
		marginRight: 12,
		padding: 4,
	},
	loadingContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	loadingDot: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: "#666666",
		opacity: 0.3,
	},
	loadingDotDelay1: {
		// Animation delay handled by React Native Reanimated
	},
	loadingDotDelay2: {
		// Animation delay handled by React Native Reanimated
	},
	inputContainer: {
		flex: 1,
	},
	textInput: {
		fontSize: 16,
		color: "#333333",
		paddingVertical: 0,
		includeFontPadding: false,
	},
	clearButton: {
		marginLeft: 8,
		padding: 4,
	},
});
