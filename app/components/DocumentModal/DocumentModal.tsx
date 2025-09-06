import React, { useCallback, useState } from "react";
import {
	ActivityIndicator,
	Linking,
	Modal,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { copyToClipboard } from "../../../utils/clipboard";
import { formatDate, formatCurrency } from "../../../utils/format";
import { useIconColors } from "../../../utils/iconColors";
import { ActionButton } from "../ActionButton";
import { Document } from "../DocumentGrid/DocumentGrid";
import { showToast } from "../Toast/Toast";
import { createStyles } from "./DocumentModal.style";
import { InfoRow } from "../InfoRow";
import { useDocumentStore } from "../../../stores/documentStore";

interface DocumentModalProps {
	visible: boolean;
	document: Document | null;
	onClose: () => void;
	onShare?: (doc: Document) => void;
}

export const DocumentModal: React.FC<DocumentModalProps> = ({
	visible,
	document,
	onClose,
	onShare,
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const [deleting, setDeleting] = useState(false);

	const { deleteDocument } = useDocumentStore();

	const handleOpenInGallery = useCallback(async () => {
		if (!document?.imageUri) return;

		try {
			const canOpen = await Linking.canOpenURL(document.imageUri);
			if (canOpen) {
				await Linking.openURL(document.imageUri);
			} else {
				showToast({
					type: "error",
					message: "Cannot open this image in gallery",
					icon: "alert-circle",
				});
				onClose();
			}
		} catch (error) {
			console.error("Failed to open in gallery:", error);
			showToast({
				type: "error",
				message: "Cannot open this image in gallery",
				icon: "alert-circle",
			});
		}
	}, [document]);

	const handleDelete = async () => {
		if (!document) return;

		setDeleting(true);
		try {
			await deleteDocument(document.id);
			showToast({
				type: "success",
				message: "Document deleted successfully",
				icon: "checkmark-circle",
			});
			onClose();
		} catch (error) {
			showToast({
				type: "error",
				message: "Failed to delete document",
				icon: "alert-circle",
			});
		} finally {
			setDeleting(false);
		}
	};

	const handleShare = async () => {
		if (!document) return;

		if (onShare) {
			onShare(document);
		} else {
			try {
				await Share.share({
					message: `Document: ${document.vendor || "Unknown"}\nType: ${document.documentType}\nDate: ${formatDate(document.date)}`,
					url: document.imageUri,
				});
			} catch (error) {
				showToast({
					type: "error",
					message: "Failed to share document",
					icon: "alert-circle",
				});
			}
		}
	};

	const handleClipBoard = async () => {
		if (!document?.metadata) return;

		copyToClipboard(document.metadata, "Metadata");
		onClose();
	};

	return (
		<Modal
			visible={visible}
			animationType="fade"
			transparent
			onRequestClose={onClose}
		>
			<View style={styles.backdrop}>
				<TouchableOpacity
					style={StyleSheet.absoluteFillObject}
					activeOpacity={1}
					onPress={onClose}
				/>

				<Animated.View
					entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}
					exiting={FadeOut.duration(100)}
					style={styles.container}
				>
					{/* <View style={styles.handle} /> */}

					<View style={styles.header}>
						<Text style={styles.title}>Document Details</Text>
					</View>

					<ScrollView
						style={styles.content}
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.infoSection}>
							<InfoRow
								icon="document-text"
								label="Type"
								value={document?.documentType}
							/>
							<InfoRow
								icon="business"
								label="Vendor"
								value={document?.vendor || "Unknown"}
							/>
							<InfoRow
								icon="calendar"
								label="Date"
								value={formatDate(document?.date)}
							/>
							<InfoRow
								icon="cash"
								label="Amount"
								value={formatCurrency(document?.totalAmount)}
							/>
						</View>

						<View style={styles.actionBar}>
							<View style={styles.leftActionBar}>
								<ActionButton
									icon="image"
									label="Open"
									onPress={handleOpenInGallery}
									color={theme.primary}
								/>
								<ActionButton
									icon="share-social"
									label="Share"
									onPress={handleShare}
									color={theme.primary}
								/>
							</View>
							<View style={styles.rightActionBar}>
								<ActionButton
									icon="copy"
									label="Copy"
									onPress={handleClipBoard}
									color={theme.accent}
								/>
								<ActionButton
									icon="trash"
									label="Delete"
									onPress={handleDelete}
									color={theme.error}
								/>
							</View>
						</View>

						{deleting && (
							<View style={styles.deletingOverlay}>
								<ActivityIndicator size="large" color="#FFFFFF" />
							</View>
						)}
					</ScrollView>
				</Animated.View>
			</View>
		</Modal>
	);
};
