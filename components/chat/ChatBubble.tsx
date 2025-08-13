import type React from "react";
import {
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import type { ChatMessage } from "../../stores/chatStore";

interface ChatBubbleProps {
	message: ChatMessage;
	onDocumentPress?: (documentId: string) => void;
}
// not used at the app //
export const ChatBubble: React.FC<ChatBubbleProps> = ({
	message,
	onDocumentPress,
}) => {
	const isUser = message.sender === "user";

	const renderDocuments = () => {
		if (!message.documents || message.documents.length === 0) {
			return null;
		}

		return (
			<View style={styles.documentsContainer}>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.documentsScroll}
				>
					{message.documents.map((doc, index) => (
						<TouchableOpacity
							key={`${doc.id}-${index}`}
							style={styles.documentCard}
							onPress={() => onDocumentPress?.(doc.id)}
						>
							<View style={styles.documentImageContainer}>
								<Image
									source={{ uri: doc.uri }}
									style={styles.documentImage}
									resizeMode="cover"
								/>
								<View style={styles.documentTypeIndicator}>
									<Icon
										name={getDocumentIcon(doc.type)}
										size={12}
										color="#FFFFFF"
									/>
								</View>
							</View>
							<Text style={styles.documentTitle} numberOfLines={2}>
								{doc.title}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
			</View>
		);
	};

	const getDocumentIcon = (type: string) => {
		switch (type) {
			case "receipt":
				return "receipt-outline";
			case "invoice":
				return "document-text-outline";
			case "id":
				return "card-outline";
			case "letter":
				return "mail-outline";
			case "form":
				return "clipboard-outline";
			case "screenshot":
				return "phone-portrait-outline";
			default:
				return "document-outline";
		}
	};

	const formatTime = (date: Date) => {
		return new Intl.DateTimeFormat("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		}).format(date);
	};

	return (
		<View style={[styles.container, isUser && styles.userContainer]}>
			<View
				style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}
			>
				{message.isLoading ? (
					<View style={styles.loadingContainer}>
						<View style={styles.loadingDot} />
						<View style={[styles.loadingDot, styles.loadingDotDelay1]} />
						<View style={[styles.loadingDot, styles.loadingDotDelay2]} />
					</View>
				) : (
					<>
						<Text
							style={[styles.messageText, isUser && styles.userMessageText]}
						>
							{message.text}
						</Text>
						{renderDocuments()}
					</>
				)}
			</View>

			<Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
				{formatTime(message.timestamp)}
			</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		marginBottom: 16,
		alignItems: "flex-start",
		paddingHorizontal: 16,
	},
	userContainer: {
		alignItems: "flex-end",
	},
	bubble: {
		maxWidth: "80%",
		padding: 12,
		borderRadius: 18,
		marginBottom: 4,
	},
	userBubble: {
		backgroundColor: "#007AFF",
		borderBottomRightRadius: 4,
	},
	aiBubble: {
		backgroundColor: "#F2F2F7",
		borderBottomLeftRadius: 4,
	},
	messageText: {
		fontSize: 16,
		lineHeight: 20,
		color: "#000000",
	},
	userMessageText: {
		color: "#FFFFFF",
	},
	timestamp: {
		fontSize: 11,
		color: "#999999",
		marginLeft: 8,
	},
	userTimestamp: {
		marginLeft: 0,
		marginRight: 8,
	},
	documentsContainer: {
		marginTop: 12,
	},
	documentsScroll: {
		paddingRight: 16,
	},
	documentCard: {
		backgroundColor: "#FFFFFF",
		borderRadius: 8,
		padding: 8,
		marginRight: 8,
		alignItems: "center",
		width: 100,
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 1,
		},
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	documentImageContainer: {
		position: "relative",
		marginBottom: 6,
	},
	documentImage: {
		width: 80,
		height: 80,
		borderRadius: 6,
		backgroundColor: "#F2F2F7",
	},
	documentTypeIndicator: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 20,
		height: 20,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	documentTitle: {
		fontSize: 11,
		color: "#666666",
		textAlign: "center",
		lineHeight: 13,
	},
	loadingContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 8,
	},
	loadingDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "#666666",
		marginHorizontal: 2,
		opacity: 0.3,
	},
	loadingDotDelay1: {
		opacity: 0.6,
	},
	loadingDotDelay2: {
		opacity: 0.9,
	},
});
