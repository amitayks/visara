import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { ProgressBar } from "@components/atoms/ProgressBar";
import { Thumbnail } from "@components/atoms/Thumbnail";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect } from "react";
import {
	ActivityIndicator,
	Dimensions,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

interface ProcessingFile {
	uri: string;
	fileName: string;
	progress: number;
}

interface UploadDrawerProps {
	visible: boolean;
	onClose: () => void;
	onSelectFromStorage: () => void;
	onCaptureFromCamera: () => void;
	// Processing overlay state
	isProcessing?: boolean;
	processingFile?: ProcessingFile | null;
	style?: ViewStyle;
	testID?: string;
}

export function UploadDrawer({
	visible,
	onClose,
	onSelectFromStorage,
	onCaptureFromCamera,
	isProcessing = false,
	processingFile = null,
	testID,
}: UploadDrawerProps) {
	const { colors, shadows } = useTheme();
	const screenHeight = Dimensions.get("window").height;

	const snapPoints = {
		closed: screenHeight,
		peek: screenHeight * 0.75, // 25% visible
	};

	const translateY = useSharedValue(snapPoints.closed);

	useEffect(() => {
		if (visible) {
			translateY.value = withSpring(snapPoints.peek, { damping: 20, stiffness: 300 });
		} else {
			translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		}
	}, [visible, translateY, snapPoints.peek, snapPoints.closed]);

	const handleClose = useCallback(() => {
		translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		setTimeout(() => {
			onClose();
		}, 300);
	}, [onClose, translateY, snapPoints.closed]);

	const handleSelectFromStorage = useCallback(() => {
		onSelectFromStorage();
		// Keep drawer open to show processing overlay
	}, [onSelectFromStorage]);

	const handleCaptureFromCamera = useCallback(() => {
		onCaptureFromCamera();
		// Keep drawer open to show processing overlay
	}, [onCaptureFromCamera]);

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
				translateY.value = withSpring(snapPoints.peek, { damping: 20, stiffness: 300 });
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
						<Text style={[styles.processingTitle, { color: colors.text }]}>Processing...</Text>

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
							<ProgressBar progress={processingFile.progress} height={6} style={styles.progressBar} />
							<Text style={[styles.progressText, { color: colors.textSecondary }]}>
								{Math.round(processingFile.progress * 100)}%
							</Text>
						</View>

						{/* Circular Progress Indicator */}
						<ActivityIndicator size="large" color={colors.buttonPrimary} style={styles.spinner} />
					</View>
				) : (
					// Upload Options
					<View style={styles.optionsContainer}>
						<Text style={[styles.title, { color: colors.text }]}>Add Photos</Text>

						<View style={styles.buttonContainer}>
							<Button
								variant="primary"
								size="large"
								onPress={handleSelectFromStorage}
								icon={<Icon name="folder-image" size="medium" />}
								style={styles.optionButton}
							>
								Select from Storage
							</Button>

							<Button
								variant="secondary"
								size="large"
								onPress={handleCaptureFromCamera}
								icon={<Icon name="camera" size="medium" />}
								style={styles.optionButton}
							>
								Capture from Camera
							</Button>
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
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
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
		paddingHorizontal: Spacing.md,
		paddingTop: Spacing.md,
		paddingBottom: Spacing.xl,
	},
	title: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: Spacing.lg,
	},
	buttonContainer: {
		gap: Spacing.md,
	},
	optionButton: {
		width: "100%",
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
