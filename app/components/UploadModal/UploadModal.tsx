import React, { useCallback, useRef, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Modal,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import {
	ImagePickerResponse,
	launchCamera,
	launchImageLibrary,
	MediaType,
	PhotoQuality,
} from "react-native-image-picker";
import Animated, { Easing, FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { galleryScanner } from "../../../services/gallery/GalleryScanner";
import { useIconColors } from "../../../utils/iconColors";
import { showToast } from "../Toast/Toast";
import { createStyles } from "./UploadModal.style";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import BottomSheet from "@gorhom/bottom-sheet";

interface UploadModalProps {
	visible: boolean;
	onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
	visible,
	onClose,
}) => {
	const { theme, isDark } = useTheme();
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	const [processing, setProcessing] = useState(false);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);

	const bottomSheetRef = useRef<BottomSheet>(null);
	const snapPoints = React.useMemo(() => ["50%"], []);

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

	const handleLaunchCamera = () => {
		launchCamera(imagePickerOptions, handleImageResponse);
	};

	const handleImageResponse = (response: ImagePickerResponse) => {
		if (response.didCancel || response.errorMessage) {
			if (response.errorMessage) {
				showToast({
					type: "error",
					message: response.errorMessage,
					// icon: "alert-circle",
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

	const onUploadComplete = useCallback(async (imageUri: string) => {
		try {
			// Process the uploaded image
			await galleryScanner.processImage(imageUri);
			showToast({
				type: "success",
				message: "Document processed successfully",
				icon: "checkmark-circle",
			});
		} catch (error) {
			console.error("Upload processing error:", error);
			showToast({
				type: "error",
				message: "Failed to process document",
				icon: "alert-circle",
			});
		}
	}, []);

	const handleClose = () => {
		setSelectedImage(null);
		setProcessing(false);
		onClose();
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<GestureHandlerRootView style={styles.container}>
				{/* Background overlay */}
				<Animated.View
					entering={FadeIn.duration(200)}
					exiting={FadeOut.duration(150)}
					style={styles.backdrop}
				/>

				{/* <TouchableOpacity style={styles.backdrop} onPress={onClose}> */}
				{/* Bottom drawer */}
				<BottomSheet
					ref={bottomSheetRef}
					index={0}
					snapPoints={snapPoints}
					onClose={onClose}
					backgroundStyle={[
						styles.bottomSheetBackground,
						{ backgroundColor: theme.surface },
					]}
					handleIndicatorStyle={[
						styles.bottomSheetHandle,
						{ backgroundColor: theme.text },
					]}
					enablePanDownToClose={true}
					animateOnMount={true}
				>
					<View style={styles.bottomSheetContent}>
						<View style={styles.header}>
							<Text style={styles.title}>Upload Document</Text>
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
								<Text style={styles.processingText}>
									Processing document...
								</Text>
							</View>
						) : (
							<View style={styles.content}>
								<Text style={styles.subtitle}>
									Choose or upload a document to scan
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
									</TouchableOpacity>

									<TouchableOpacity
										style={styles.optionButton}
										onPress={handleLaunchCamera}
										activeOpacity={0.7}
									>
										<View style={styles.optionIcon}>
											<Icon name="camera" size={32} color={iconColors.accent} />
										</View>
										<Text style={styles.optionTitle}>Camera</Text>
									</TouchableOpacity>
								</View>

								<View style={styles.tipContainer}>
									<Icon
										name="information-circle"
										size={20}
										color={iconColors.tertiary}
									/>
									<Text style={styles.tipText}>
										For best results, ensure the document is well-lit and
										clearly visible
									</Text>
								</View>
							</View>
						)}
					</View>
				</BottomSheet>
				{/* </TouchableOpacity> */}
			</GestureHandlerRootView>
		</Modal>
	);
};
