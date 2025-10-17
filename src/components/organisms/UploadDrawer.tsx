import { Icon } from "@components/atoms/Icon";
import { ProgressBar } from "@components/atoms/ProgressBar";
import { Thumbnail } from "@components/atoms/Thumbnail";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import {
	PermissionStatus,
	PermissionType,
	requestPermission,
	showPermissionDeniedAlert,
} from "@utils/permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Dimensions,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	type ViewStyle,
} from "react-native";
import { CameraRoll } from "@react-native-camera-roll/camera-roll";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { Camera, useCameraDevice } from "react-native-vision-camera";

interface ProcessingFile {
	uri: string;
	fileName: string;
	progress: number;
}

interface UploadDrawerProps {
	visible: boolean;
	onClose: () => void;
	onFilesSelected?: (files: Array<{ uri: string; type: string }>) => void;
	// Processing overlay state
	isProcessing?: boolean;
	processingFile?: ProcessingFile | null;
	style?: ViewStyle;
	testID?: string;
}

export function UploadDrawer({
	visible,
	onClose,
	onFilesSelected,
	isProcessing = false,
	processingFile = null,
	testID,
}: UploadDrawerProps) {
	const { colors, shadows } = useTheme();
	const screenHeight = Dimensions.get("window").height;
	const [showCamera, setShowCamera] = useState(false);
	const [contentHeight, setContentHeight] = useState(0);
	const device = useCameraDevice("back");
	const cameraRef = useRef<Camera>(null);

	// Calculate drawer height: content + handle + extra padding for safety
	const HANDLE_HEIGHT = 40; // Handle container height
	const EXTRA_PADDING = 260; // Extra padding for visual comfort
	const drawerHeight =
		contentHeight > 0
			? contentHeight - HANDLE_HEIGHT - EXTRA_PADDING
			: screenHeight * 0.3;

	const snapPoints = {
		closed: screenHeight,
		peek: screenHeight - drawerHeight,
	};

	const translateY = useSharedValue(snapPoints.closed);

	// Update translateY when contentHeight changes
	useEffect(() => {
		if (visible && contentHeight > 0) {
			translateY.value = withSpring(snapPoints.peek, {
				damping: 20,
				stiffness: 300,
			});
		}
	}, [contentHeight, visible, translateY, snapPoints.peek]);

	useEffect(() => {
		if (visible) {
			translateY.value = withSpring(snapPoints.peek, {
				damping: 20,
				stiffness: 300,
			});
		} else {
			translateY.value = withSpring(snapPoints.closed, {
				damping: 20,
				stiffness: 300,
			});
			setShowCamera(false);
		}
	}, [visible, translateY, snapPoints.peek, snapPoints.closed]);

	const handleClose = useCallback(() => {
		translateY.value = withSpring(snapPoints.closed, {
			damping: 20,
			stiffness: 300,
		});
		setTimeout(() => {
			onClose();
		}, 300);
	}, [onClose, translateY, snapPoints.closed]);

	const handleSelectFromStorage = useCallback(async () => {
		try {
			// Request photo library permission
			const photoLibraryPermission = await requestPermission(
				PermissionType.PHOTO_LIBRARY,
			);

			if (photoLibraryPermission.status !== PermissionStatus.GRANTED) {
				showPermissionDeniedAlert(PermissionType.PHOTO_LIBRARY);
				return;
			}

			// Get photos from camera roll
			const result = await CameraRoll.getPhotos({
				first: 1,
				assetType: "All", // Get both photos and videos
			});

			if (result.edges.length > 0 && onFilesSelected) {
				const files = result.edges.map((edge) => ({
					uri: edge.node.image.uri,
					type: edge.node.type,
				}));
				onFilesSelected(files);
			}
		} catch (error) {
			console.error("[UploadDrawer] Gallery selection error:", error);
			Alert.alert("Error", "Failed to access gallery. Please try again.", [
				{ text: "OK" },
			]);
		}
	}, [onFilesSelected]);

	const handleCaptureFromCamera = useCallback(async () => {
		try {
			// Request camera permission
			const cameraPermission = await requestPermission(PermissionType.CAMERA);

			if (cameraPermission.status !== PermissionStatus.GRANTED) {
				showPermissionDeniedAlert(PermissionType.CAMERA);
				return;
			}

			// Show camera view
			setShowCamera(true);
		} catch (error) {
			console.error("[UploadDrawer] Camera launch error:", error);
			Alert.alert("Error", "Failed to access camera. Please try again.", [
				{ text: "OK" },
			]);
		}
	}, []);

	const handleTakePhoto = useCallback(async () => {
		if (!cameraRef.current) return;

		try {
			const photo = await cameraRef.current.takePhoto({
				flash: "auto",
			});

			if (onFilesSelected && photo.path) {
				onFilesSelected([
					{
						uri:
							Platform.OS === "android" ? `file://${photo.path}` : photo.path,
						type: "image",
					},
				]);
			}

			setShowCamera(false);
		} catch (error) {
			console.error("[UploadDrawer] Photo capture error:", error);
			Alert.alert("Error", "Failed to capture photo. Please try again.", [
				{ text: "OK" },
			]);
		}
	}, [onFilesSelected]);

	// Pan gesture for dragging down to close
	const pan = Gesture.Pan()
		.onUpdate((event) => {
			const newY = snapPoints.peek + event.translationY;
			if (newY >= snapPoints.peek && newY <= snapPoints.closed) {
				translateY.value = newY;
			}
		})
		.onEnd((event) => {
			if (event.translationY > 100 || event.velocityY > 500) {
				runOnJS(handleClose)();
			} else {
				translateY.value = withSpring(snapPoints.peek, {
					damping: 20,
					stiffness: 300,
				});
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	if (!visible) {
		return null;
	}

	return (
		<GestureDetector gesture={pan}>
			<Animated.View
				style={[
					styles.container,
					{
						backgroundColor: colors.surface,
						borderTopColor: colors.border,
					},
					shadows.lg,
					animatedStyle,
				]}
				testID={testID}
			>
				{/* Drag Handle */}
				<View style={styles.handleContainer}>
					<View style={[styles.handle, { backgroundColor: colors.border }]} />
				</View>

				{/* Content */}
				{isProcessing && processingFile ? (
					// Processing Overlay
					<View style={styles.processingContainer}>
						<Text style={[styles.processingTitle, { color: colors.text }]}>
							Processing...
						</Text>

						{/* Thumbnail Preview */}
						<View style={styles.thumbnailPreview}>
							<Thumbnail
								uri={processingFile.uri}
								size={120}
								aspectRatio={1}
								showLoader={false}
							/>
						</View>

						{/* File Name */}
						<Text
							style={[styles.fileName, { color: colors.textSecondary }]}
							numberOfLines={1}
							ellipsizeMode="middle"
						>
							{processingFile.fileName}
						</Text>

						{/* Progress Bar */}
						<View style={styles.progressContainer}>
							<ProgressBar
								progress={processingFile.progress}
								height={6}
								style={styles.progressBar}
							/>
							<Text
								style={[styles.progressText, { color: colors.textSecondary }]}
							>
								{Math.round(processingFile.progress * 100)}%
							</Text>
						</View>

						{/* Circular Progress Indicator */}
						<ActivityIndicator
							size="large"
							color={colors.buttonPrimary}
							style={styles.spinner}
						/>
					</View>
				) : (
					// Upload Options
					<View
						style={styles.optionsContainer}
						onLayout={(event) => {
							const { height } = event.nativeEvent.layout;
							setContentHeight(height);
						}}
					>
						<View style={styles.header}>
							<Text style={[styles.title, { color: colors.text }]}>
								Upload Document
							</Text>
						</View>

						<View style={styles.content}>
							<Text style={[styles.subtitle, { color: colors.textSecondary }]}>
								Choose or upload a document to scan
							</Text>

							<View style={styles.optionsGrid}>
								<TouchableOpacity
									style={[
										styles.optionCard,
										{ backgroundColor: colors.surfaceSecondary },
									]}
									onPress={handleSelectFromStorage}
									activeOpacity={0.7}
								>
									<View style={styles.optionIconContainer}>
										<Icon
											name="image-multiple"
											size="large"
											color={colors.accent}
										/>
									</View>
									<Text style={[styles.optionTitle, { color: colors.text }]}>
										Gallery
									</Text>
								</TouchableOpacity>

								<TouchableOpacity
									style={[
										styles.optionCard,
										{ backgroundColor: colors.surfaceSecondary },
									]}
									onPress={handleCaptureFromCamera}
									activeOpacity={0.7}
								>
									<View style={styles.optionIconContainer}>
										<Icon
											name="camera-outline"
											size="large"
											color={colors.accent}
										/>
									</View>
									<Text style={[styles.optionTitle, { color: colors.text }]}>
										Camera
									</Text>
								</TouchableOpacity>
							</View>

							<View
								style={[
									styles.tipContainer,
									{ backgroundColor: colors.surfaceSecondary },
								]}
							>
								<Icon
									name="information-outline"
									size="medium"
									color={colors.textTertiary}
								/>
								<Text style={[styles.tipText, { color: colors.textSecondary }]}>
									For best results, ensure the document is well-lit and clearly
									visible
								</Text>
							</View>
						</View>
					</View>
				)}
			</Animated.View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		left: 0,
		right: 0,
		height: "100%",
		borderTopLeftRadius: BorderRadius.xl,
		borderTopRightRadius: BorderRadius.xl,
		borderTopWidth: 1,
	},
	handleContainer: {
		alignItems: "center",
		paddingVertical: Spacing.sm,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: BorderRadius.full,
	},
	optionsContainer: {
		flex: 1,
		paddingHorizontal: Spacing.lg,
		paddingBottom: Spacing.lg,
	},
	header: {
		alignItems: "center",
		paddingBottom: Spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: "rgba(0, 0, 0, 0.1)",
		marginBottom: Spacing.md,
	},
	title: {
		fontSize: Typography.fontSize.xl,
		fontWeight: Typography.fontWeight.semibold,
	},
	content: {
		flexDirection: "column",
		gap: Spacing.lg,
		paddingTop: Spacing.md,
	},
	subtitle: {
		fontSize: Typography.fontSize.md,
		textAlign: "center",
		lineHeight: Typography.lineHeight.normal * Typography.fontSize.md,
	},
	optionsGrid: {
		flexDirection: "row",
		gap: Spacing.md,
	},
	optionCard: {
		flex: 1,
		borderRadius: BorderRadius.lg,
		padding: Spacing.xl,
		gap: Spacing.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	optionIconContainer: {
		alignItems: "center",
		justifyContent: "center",
	},
	optionTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	tipContainer: {
		flexDirection: "row",
		alignItems: "center",
		padding: Spacing.md,
		borderRadius: BorderRadius.lg,
		gap: Spacing.sm,
	},
	tipText: {
		flex: 1,
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
	processingContainer: {
		flex: 1,
		paddingHorizontal: Spacing.md,
		paddingTop: Spacing.md,
		paddingBottom: Spacing.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	processingTitle: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: Spacing.xl,
	},
	thumbnailPreview: {
		marginBottom: Spacing.md,
		borderRadius: BorderRadius.md,
		overflow: "hidden",
	},
	fileName: {
		fontSize: Typography.fontSize.md,
		marginBottom: Spacing.lg,
		maxWidth: "80%",
		textAlign: "center",
	},
	progressContainer: {
		width: "100%",
		alignItems: "center",
		marginBottom: Spacing.xl,
	},
	progressBar: {
		width: "100%",
		marginBottom: Spacing.sm,
	},
	progressText: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.medium,
	},
	spinner: {
		marginTop: Spacing.md,
	},
});
