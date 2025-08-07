import { format } from "date-fns";
import type React from "react";
import {
	I18nManager,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import type Document from "../../services/database/models/Document";

export interface Message {
	id: string;
	text: string;
	user: boolean;
	timestamp: Date;
	documents?: Document[];
	isRTL?: boolean;
	searchHighlights?: Record<string, string[]>;
}

interface ChatMessageProps {
	message: Message;
	onDocumentPress?: (document: Document) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
	message,
	onDocumentPress,
}) => {
	const isUser = message.user;
	const isRTL =
		message.isRTL || (message.text && /[\u0590-\u05FF]/.test(message.text));

	const renderDocumentCard = (doc: Document) => (
		<TouchableOpacity
			key={doc.id}
			style={styles.documentCard}
			onPress={() => onDocumentPress?.(doc)}
			activeOpacity={0.8}
		>
			<Image
				source={{ uri: doc.imageUri }}
				style={styles.documentThumbnail}
				resizeMode="cover"
			/>
			<View style={styles.documentInfo}>
				<View style={styles.documentHeader}>
					<Text style={styles.documentType}>
						{doc.documentType ? doc.documentType.toUpperCase() : 'UNKNOWN'}
					</Text>
					{doc.confidence && (
						<Text style={styles.documentConfidence}>
							{(doc.confidence * 100).toFixed(0)}%
						</Text>
					)}
				</View>
				{doc.vendor && (
					<Text style={styles.documentVendor} numberOfLines={1}>
						{doc.vendor}
					</Text>
				)}
				<View style={styles.documentDetails}>
					{doc.totalAmount && (
						<Text style={styles.documentAmount}>
							{doc.currency || "USD"} {doc.totalAmount}
						</Text>
					)}
					{doc.date && (
						<Text style={styles.documentDate}>
							{format(new Date(doc.date), "MMM d, yyyy")}
						</Text>
					)}
				</View>
			</View>
		</TouchableOpacity>
	);

	return (
		<View
			style={[
				styles.messageContainer,
				isUser ? styles.userMessageContainer : styles.botMessageContainer,
			]}
		>
			<View
				style={[
					styles.messageBubble,
					isUser ? styles.userBubble : styles.botBubble,
				]}
			>
				<Text
					style={[
						styles.messageText,
						isUser ? styles.userText : styles.botText,
						...(isRTL ? [styles.rtlText] : []),
					]}
				>
					{message.text}
				</Text>

				{message.documents && message.documents.length > 0 && (
					<View style={styles.documentsContainer}>
						{message.documents.map(renderDocumentCard)}
					</View>
				)}

				<Text
					style={[
						styles.timestamp,
						isUser ? styles.userTimestamp : styles.botTimestamp,
					]}
				>
					{format(message.timestamp, "HH:mm")}
				</Text>
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	messageContainer: {
		paddingHorizontal: 16,
		paddingVertical: 4,
	},
	userMessageContainer: {
		alignItems: "flex-end",
	},
	botMessageContainer: {
		alignItems: "flex-start",
	},
	messageBubble: {
		maxWidth: "80%",
		borderRadius: 16,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	userBubble: {
		backgroundColor: "#007AFF",
		borderBottomRightRadius: 4,
	},
	botBubble: {
		backgroundColor: "#F2F2F7",
		borderBottomLeftRadius: 4,
	},
	messageText: {
		fontSize: 16,
		lineHeight: 20,
	},
	userText: {
		color: "#FFFFFF",
	},
	botText: {
		color: "#000000",
	},
	rtlText: {
		textAlign: "right",
		writingDirection: "rtl",
	},
	timestamp: {
		fontSize: 12,
		marginTop: 4,
	},
	userTimestamp: {
		color: "rgba(255, 255, 255, 0.7)",
	},
	botTimestamp: {
		color: "#666666",
	},
	documentsContainer: {
		marginTop: 12,
		gap: 8,
	},
	documentCard: {
		flexDirection: "row",
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		padding: 12,
		gap: 12,
		borderWidth: 1,
		borderColor: "#E5E5E7",
	},
	documentThumbnail: {
		width: 60,
		height: 60,
		borderRadius: 8,
		backgroundColor: "#F2F2F7",
	},
	documentInfo: {
		flex: 1,
		justifyContent: "space-between",
	},
	documentHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	documentType: {
		fontSize: 11,
		fontWeight: "600",
		color: "#0066FF",
		letterSpacing: 0.5,
	},
	documentConfidence: {
		fontSize: 11,
		color: "#34C759",
		fontWeight: "500",
	},
	documentVendor: {
		fontSize: 14,
		fontWeight: "500",
		color: "#000000",
		marginTop: 2,
	},
	documentDetails: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 4,
	},
	documentAmount: {
		fontSize: 14,
		fontWeight: "600",
		color: "#000000",
	},
	documentDate: {
		fontSize: 12,
		color: "#666666",
	},
});
