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
import { showToast } from "../modals/Toast";
import { createStyles } from "./UploadModal.style";

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
