import React, { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	Modal,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { Document } from "../DocumentGrid/DocumentGrid";
import { showToast } from "../modals/Toast";
import { createStyles } from "./DocumentModal.style";

interface DocumentModalProps {
	visible: boolean;
	document: Document | null;
	onClose: () => void;
	onDelete: (doc: Document) => Promise<void>;
	onShare?: (doc: Document) => void;
}

interface InfoRowProps {
	icon: string;
	label: string;
	value?: string | null;
}

const InfoRow: React.FC<InfoRowProps & { styles: any; iconColors: any }> = ({
	icon,
	label,
	value,
	styles,
	iconColors,
}) => {
	if (!value) return null;

	return (
		<View style={styles.infoRow}>
			<Icon
				name={icon}
				size={20}
				color={iconColors.secondary}
				style={styles.infoIcon}
			/>
			<View style={styles.infoContent}>
				<Text style={styles.infoLabel}>{label}</Text>
				<Text style={styles.infoValue}>{value}</Text>
			</View>
		</View>
	);
};

interface ActionButtonProps {
	icon: string;
	label: string;
	onPress: () => void;
	color: string;
}

const ActionButton: React.FC<ActionButtonProps & { styles: any }> = ({
	icon,
	label,
	onPress,
	color,
	styles,
}) => (
	<TouchableOpacity
		style={[styles.actionButton, { backgroundColor: `${color}15` }]}
		onPress={onPress}
		activeOpacity={0.7}
	>
		<Icon name={icon} size={24} color={color} />
		<Text style={[styles.actionLabel, { color }]}>{label}</Text>
	</TouchableOpacity>
);

const DocumentSkeleton: React.FC<{ styles: any }> = ({ styles }) => (
	<View style={styles.skeleton}>
		{/* <View style={styles.skeletonImage} /> */}
		<View style={styles.skeletonInfo}>
			<View style={styles.skeletonRow} />
			<View style={styles.skeletonRow} />
			<View style={styles.skeletonRow} />
		</View>
	</View>
);

export const DocumentModal: React.FC<DocumentModalProps> = ({
	visible,
	document,
	onClose,
	onDelete,
	onShare,
}) => {
	const { theme, isDark } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	const [loading, setLoading] = useState(true);
	// const [imageLoaded, setImageLoaded] = useState(false);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		if (visible && document) {
			setLoading(true);
			// setImageLoaded(false);
			// Wait for animation to complete before loading content
			setTimeout(() => setLoading(false), 400);
		}
	}, [visible, document]);

	const handleDelete = async () => {
		if (!document) return;

		setDeleting(true);
		try {
			await onDelete(document);
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

	const formatDate = (date?: Date) => {
		if (!date) return "No date";
		return new Date(date).toLocaleDateString("en-US", {
			weekday: "short",
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	};

	const formatCurrency = (amount?: number) => {
		if (!amount) return null;
		return `$${amount.toFixed(2)}`;
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
						{/* <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity> */}
					</View>

					<ScrollView
						style={styles.content}
						showsVerticalScrollIndicator={false}
					>
						{loading ? (
							<DocumentSkeleton styles={styles} />
						) : (
							<>
								{/* <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: document?.imageUri }}
                    style={styles.image}
                    onLoad={() => setImageLoaded(true)}
                    resizeMode="contain"
                  />
                  {!imageLoaded && (
                    <ActivityIndicator
                      style={styles.imageLoader}
                      size="large"
                      color="#6366F1"
                    />
                  )}
                </View> */}

								<View style={styles.infoSection}>
									<InfoRow
										icon="document-text"
										label="Type"
										value={document?.documentType}
										styles={styles}
										iconColors={iconColors}
									/>
									<InfoRow
										icon="business"
										label="Vendor"
										value={document?.vendor || "Unknown"}
										styles={styles}
										iconColors={iconColors}
									/>
									<InfoRow
										icon="calendar"
										label="Date"
										value={formatDate(document?.date)}
										styles={styles}
										iconColors={iconColors}
									/>
									<InfoRow
										icon="cash"
										label="Amount"
										value={formatCurrency(document?.totalAmount)}
										styles={styles}
										iconColors={iconColors}
									/>
								</View>
							</>
						)}
					</ScrollView>

					{/* Fixed Action Bar at Bottom */}
					<View style={styles.actionBar}>
						{!loading ? (
							<>
								<ActionButton
									icon="share-social"
									label="Share"
									onPress={handleShare}
									color={theme.accent}
									styles={styles}
								/>
								<ActionButton
									icon="trash"
									label="Delete"
									onPress={handleDelete}
									color={theme.error}
									styles={styles}
								/>
							</>
						) : (
							<>
								<View style={styles.actionButtonSkeleton} />
								<View style={styles.actionButtonSkeleton} />
							</>
						)}
					</View>

					{deleting && (
						<View style={styles.deletingOverlay}>
							<ActivityIndicator size="large" color="#FFFFFF" />
						</View>
					)}
				</Animated.View>
			</View>
		</Modal>
	);
};
