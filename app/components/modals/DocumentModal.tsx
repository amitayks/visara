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
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	SlideInDown,
	SlideOutDown,
} from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { Document } from "../gallery/DocumentGrid";
import { showToast } from "./Toast";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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

const createStyles = (theme: any) =>
	StyleSheet.create({
		backdrop: {
			flex: 1,
			backgroundColor: theme.overlay,
			justifyContent: "flex-end",
		},
		container: {
			backgroundColor: theme.surface,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			minHeight: SCREEN_HEIGHT * 0.7,
			maxHeight: SCREEN_HEIGHT * 0.9,
			marginTop: SCREEN_HEIGHT * 0.1,
			shadowColor: theme.shadow,
			shadowOffset: {
				width: 0,
				height: -10,
			},
			shadowOpacity: 0.25,
			shadowRadius: 20,
			elevation: 15,
		},
		// handle: {
		//   width: 40,
		//   height: 4,
		//   backgroundColor: '#DDD',
		//   borderRadius: 2,
		//   alignSelf: 'center',
		//   marginTop: 12,
		// },
		header: {
			alignItems: "center",
			paddingHorizontal: 20,
			paddingVertical: 16,
			borderBottomWidth: 1,
			borderBottomColor: theme.borderLight,
		},
		title: {
			fontSize: 20,
			fontWeight: "600",
			color: theme.text,
		},
		// closeButton: {
		//   padding: 8,
		// },
		content: {
			flexGrow: 1,
		},
		// imageContainer: {
		//   height: 300,
		//   backgroundColor: '#F5F5F5',
		//   margin: 20,
		//   borderRadius: 12,
		//   overflow: 'hidden',
		//   alignItems: 'center',
		//   justifyContent: 'center',
		// },
		// image: {
		//   width: '100%',
		//   height: '100%',
		// },
		// imageLoader: {
		//   position: 'absolute',
		// },
		infoSection: {
			paddingHorizontal: 20,
			paddingBottom: 20,
		},
		infoRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingVertical: 12,
			// borderBottomWidth: 0.5,
			// borderBottomColor: '#F0F0F0',
		},
		infoIcon: {
			marginRight: 16,
		},
		infoContent: {
			flex: 1,
		},
		infoLabel: {
			fontSize: 12,
			color: theme.textTertiary,
			marginBottom: 2,
		},
		infoValue: {
			fontSize: 16,
			color: theme.text,
			fontWeight: "500",
		},
		actionBar: {
			flexDirection: "row",
			paddingHorizontal: 20,
			paddingVertical: 16,
			paddingBottom: 20,
			gap: 12,
			backgroundColor: theme.surface,
			borderTopWidth: 1,
			borderTopColor: theme.borderLight,
		},
		actions: {
			flexDirection: "row",
			paddingHorizontal: 20,
			paddingBottom: 20,
			gap: 12,
		},
		actionButton: {
			flex: 1,
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "center",
			paddingVertical: 14,
			borderRadius: 12,
			gap: 8,
		},
		actionLabel: {
			fontSize: 16,
			fontWeight: "600",
		},
		skeleton: {
			padding: 20,
		},
		skeletonImage: {
			height: 300,
			backgroundColor: theme.skeleton,
			borderRadius: 12,
			marginBottom: 20,
		},
		skeletonInfo: {
			gap: 16,
		},
		skeletonRow: {
			height: 50,
			backgroundColor: theme.skeleton,
			borderRadius: 8,
		},
		deletingOverlay: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: theme.overlay,
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			alignItems: "center",
			justifyContent: "center",
		},
		actionBarSkeleton: {
			flexDirection: "row",
			gap: 12,
			flex: 1,
		},
		actionButtonSkeleton: {
			flex: 1,
			height: 52,
			backgroundColor: theme.skeleton,
			borderRadius: 12,
		},
	});
