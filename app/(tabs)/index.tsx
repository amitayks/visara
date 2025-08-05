import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	I18nManager,
	KeyboardAvoidingView,
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { ChatMessage, type Message } from "../../components/chat/ChatMessage";
import type Document from "../../services/database/models/Document";
import { searchService } from "../../services/search/simpleSearchService";
import type { RootStackParamList, TabParamList } from "../../types/navigation";

type NavigationProp = CompositeNavigationProp<
	BottomTabNavigationProp<TabParamList, "Chat">,
	StackNavigationProp<RootStackParamList>
>;

export default function ChatScreen() {
	const navigation = useNavigation<NavigationProp>();
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "1",
			text: 'Hi! I can help you find documents in your gallery. Try asking me:\n• "Show receipts from last week"\n• "Find documents over $100"\n• "Search for Amazon invoices"\n• "מצא קבלות מהחודש האחרון"',
			user: false,
			timestamp: new Date(),
		},
	]);
	const [inputText, setInputText] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const flatListRef = useRef<FlatList>(null);

	const detectRTL = (text: string): boolean => {
		return /[\u0590-\u05FF]/.test(text);
	};

	const handleDocumentPress = useCallback(
		(document: Document) => {
			navigation.navigate("Document", { id: document.id });
		},
		[navigation],
	);

	const sendMessage = async () => {
		if (!inputText.trim() || isSearching) return;

		const isRTL = detectRTL(inputText);
		const userMessage: Message = {
			id: Date.now().toString(),
			text: inputText,
			user: true,
			timestamp: new Date(),
			isRTL,
		};

		setMessages((prev) => [...prev, userMessage]);
		setInputText("");
		setIsSearching(true);

		try {
			// Perform search
			const searchResult = await searchService.search(inputText);

			// Generate response
			const responseText = searchService.generateResponse(searchResult);

			const aiResponse: Message = {
				id: (Date.now() + 1).toString(),
				text: responseText,
				user: false,
				timestamp: new Date(),
				documents: searchResult.documents.slice(0, 10), // Limit to 10 results
			};

			setMessages((prev) => [...prev, aiResponse]);
		} catch (error) {
			console.error("Search error:", error);

			const errorMessage: Message = {
				id: (Date.now() + 1).toString(),
				text: "Sorry, I encountered an error while searching. Please try again.",
				user: false,
				timestamp: new Date(),
			};

			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsSearching(false);
		}
	};

	const renderMessage = ({ item }: { item: Message }) => (
		<ChatMessage message={item} onDocumentPress={handleDocumentPress} />
	);

	const renderSearchIndicator = () => {
		if (!isSearching) return null;

		return (
			<View style={styles.searchingContainer}>
				<ActivityIndicator size="small" color="#0066FF" />
				<Text style={styles.searchingText}>Searching...</Text>
			</View>
		);
	};

	return (
		<SafeAreaView style={styles.container}>
			<StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
			<View style={styles.header}>
				<Text style={styles.headerTitle}>Visara</Text>
				<TouchableOpacity
					style={styles.scanButton}
					onPress={() => navigation.navigate("OCRTest")}
				>
					<Icon name="scan-outline" size={24} color="#0066FF" />
				</TouchableOpacity>
			</View>

			<FlatList
				ref={flatListRef}
				data={messages}
				renderItem={renderMessage}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.messagesContainer}
				onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
				ListFooterComponent={renderSearchIndicator}
			/>

			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={styles.inputContainer}
			>
				<View style={styles.inputWrapper}>
					<TextInput
						style={[styles.textInput, detectRTL(inputText) && styles.rtlInput]}
						value={inputText}
						onChangeText={setInputText}
						placeholder="Ask about your documents..."
						placeholderTextColor="#999999"
						multiline
						onSubmitEditing={sendMessage}
						blurOnSubmit={false}
					/>
					<TouchableOpacity
						style={[
							styles.sendButton,
							(!inputText.trim() || isSearching) && styles.sendButtonDisabled,
						]}
						onPress={sendMessage}
						disabled={!inputText.trim() || isSearching}
					>
						<Icon
							name="send"
							size={20}
							color={inputText.trim() && !isSearching ? "#0066FF" : "#CCCCCC"}
						/>
					</TouchableOpacity>
				</View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#FAFAFA",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: "#FFFFFF",
		borderBottomWidth: 1,
		borderBottomColor: "#E5E5E7",
	},
	headerTitle: {
		fontSize: 24,
		fontWeight: "600",
		color: "#000000",
	},
	scanButton: {
		padding: 8,
	},
	messagesContainer: {
		paddingVertical: 16,
		flexGrow: 1,
	},
	searchingContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 16,
		gap: 8,
	},
	searchingText: {
		fontSize: 14,
		color: "#666666",
	},
	inputContainer: {
		backgroundColor: "#FFFFFF",
		borderTopWidth: 1,
		borderTopColor: "#E5E5E7",
	},
	inputWrapper: {
		flexDirection: "row",
		alignItems: "flex-end",
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	textInput: {
		flex: 1,
		backgroundColor: "#F2F2F7",
		borderRadius: 20,
		paddingHorizontal: 16,
		paddingVertical: 10,
		marginRight: 12,
		fontSize: 16,
		color: "#000000",
		maxHeight: 100,
		textAlign: I18nManager.isRTL ? "right" : "left",
	},
	rtlInput: {
		textAlign: "right",
		writingDirection: "rtl",
	},
	sendButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#F2F2F7",
		alignItems: "center",
		justifyContent: "center",
	},
	sendButtonDisabled: {
		opacity: 0.5,
	},
});
