import React, { useState } from "react";
import {
	ActivityIndicator,
	Dimensions,
	Image,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import {
	ImagePickerResponse,
	// launchCamera,
	launchImageLibrary,
	MediaType,
	PhotoQuality,
} from "react-native-image-picker";
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
import { showToast } from "./Toast";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface UploadModalProps {
	visible: boolean;
	onClose: () => void;
	onUploadComplete: (imageUri: string) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
	visible,
	onClose,
	onUploadComplete,
}) => {
	const { theme, isDark } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	const [processing, setProcessing] = useState(false);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);

	const imagePickerOptions = {
		mediaType: "photo" as MediaType,
		includeBase64: false,
		maxHeight: 2000,
		maxWidth: 2000,
		quality: 0.8 as PhotoQuality,
	};

	const handleLaunchGallery = () => {
		launchImageLibrary(imagePickerOptions, handleImageResponse);
	};

	// const handleLaunchCamera = () => {
	// 	launchCamera(imagePickerOptions, handleImageResponse);
	// };

	const handleImageResponse = (response: ImagePickerResponse) => {
		if (response.didCancel || response.errorMessage) {
			if (response.errorMessage) {
				showToast({
					type: "error",
					message: response.errorMessage,
					icon: "alert-circle",
				});
			}
			return;
		}

		if (response.assets && response.assets[0]) {
			const imageUri = response.assets[0].uri;
			if (imageUri) {
				setSelectedImage(imageUri);
				processImage(imageUri);
			}
		}
	};

	const processImage = async (imageUri: string) => {
		setProcessing(true);

		try {
			await new Promise((resolve) => setTimeout(resolve, 1500));

			onUploadComplete(imageUri);
			showToast({
				type: "success",
				message: "Document uploaded successfully",
				icon: "checkmark-circle",
			});

			handleClose();
		} catch (error) {
			showToast({
				type: "error",
				message: "Failed to process document",
				icon: "alert-circle",
			});
		} finally {
			setProcessing(false);
		}
	};

	const handleClose = () => {
		setSelectedImage(null);
		setProcessing(false);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			animationType="fade"
			transparent
			onRequestClose={handleClose}
		>
			<View style={styles.backdrop}>
				<TouchableOpacity
					style={StyleSheet.absoluteFillObject}
					activeOpacity={1}
					onPress={handleClose}
				/>

				<Animated.View
					entering={FadeIn.duration(250).easing(Easing.out(Easing.cubic))}
					exiting={FadeOut.duration(200)}
					style={styles.container}
				>
					{/* <View style={styles.handle} /> */}

					<View style={styles.header}>
						<Text style={styles.title}>Upload Document</Text>
						{/* <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Icon name="close" size={24} color="#333" />
            </TouchableOpacity> */}
					</View>

					{processing ? (
						<View style={styles.processingContainer}>
							{selectedImage && (
								<Image
									source={{ uri: selectedImage }}
									style={styles.previewImage}
									resizeMode="contain"
								/>
							)}
							<ActivityIndicator size="large" color={theme.accent} />
							<Text style={styles.processingText}>Processing document...</Text>
						</View>
					) : (
						<View style={styles.content}>
							<Text style={styles.subtitle}>
								Choose a document from your gallery
							</Text>

							<View style={styles.options}>
								<TouchableOpacity
									style={styles.optionButton}
									onPress={handleLaunchGallery}
									activeOpacity={0.7}
								>
									<View style={styles.optionIcon}>
										<Icon name="images" size={32} color={iconColors.accent} />
									</View>
									<Text style={styles.optionTitle}>Gallery</Text>
									<Text style={styles.optionDescription}>
										Select from your photos
									</Text>
								</TouchableOpacity>

								{/* <TouchableOpacity
                  style={styles.optionButton}
                  onPress={handleLaunchCamera}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIcon}>
                    <Icon name="camera" size={32} color="#6366F1" />
                  </View>
                  <Text style={styles.optionTitle}>Camera</Text>
                  <Text style={styles.optionDescription}>
                    Take a new photo
                  </Text>
                </TouchableOpacity> */}
							</View>

							<View style={styles.tipContainer}>
								<Icon
									name="information-circle"
									size={20}
									color={iconColors.tertiary}
								/>
								<Text style={styles.tipText}>
									For best results, ensure the document is well-lit and clearly
									visible
								</Text>
							</View>
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
			paddingBottom: Platform.OS === "ios" ? 34 : 24,
			marginTop: SCREEN_HEIGHT * 0.1,
			minHeight: SCREEN_HEIGHT * 0.7,
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
		// 	width: 40,
		// 	height: 4,
		// 	backgroundColor: "#DDD",
		// 	borderRadius: 2,
		// 	alignSelf: "center",
		// 	marginTop: 12,
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
			flex: 1,
			justifyContent: "space-around",
			// alignItems: "center",
			padding: 20,
		},
		subtitle: {
			fontSize: 16,
			color: theme.textSecondary,
			textAlign: "center",
			marginBottom: 24,
		},
		options: {
			flexDirection: "row",
			gap: 16,
			marginBottom: 24,
		},
		optionButton: {
			flex: 1,
			backgroundColor: theme.surfaceSecondary,
			borderRadius: 16,
			padding: 20,
			alignItems: "center",
			borderWidth: 2,
			borderColor: theme.borderLight,
		},
		optionIcon: {
			width: 64,
			height: 64,
			borderRadius: 32,
			backgroundColor: theme.accentLight,
			alignItems: "center",
			justifyContent: "center",
			marginBottom: 12,
		},
		optionTitle: {
			fontSize: 16,
			fontWeight: "600",
			color: theme.text,
			marginBottom: 4,
		},
		optionDescription: {
			fontSize: 13,
			color: theme.textSecondary,
			textAlign: "center",
		},
		tipContainer: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.surfaceSecondary,
			padding: 12,
			borderRadius: 12,
			gap: 8,
		},
		tipText: {
			flex: 1,
			fontSize: 13,
			color: theme.textSecondary,
			lineHeight: 18,
		},
		processingContainer: {
			padding: 40,
			alignItems: "center",
		},
		previewImage: {
			width: 200,
			height: 200,
			marginBottom: 24,
			borderRadius: 12,
			backgroundColor: theme.surfaceSecondary,
		},
		processingText: {
			marginTop: 16,
			fontSize: 16,
			color: theme.textSecondary,
		},
	});
