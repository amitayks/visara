import { Badge } from "@components/atoms/Badge";
import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { LabelTag } from "@components/atoms/LabelTag";
import type { Label } from "@models/Label";
import type { OcrText } from "@models/OcrText";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect } from "react";
import {
	Dimensions,
	ScrollView,
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

type SnapPoint = "closed" | "peek" | "half" | "full";

interface InfoDrawerProps {
	visible: boolean;
	labels?: Label[];
	ocrText?: OcrText | null;
	processingFailed?: boolean;
	onClose: () => void;
	onDelete?: () => void;
	onShare?: () => void;
	onCopy?: () => void;
	onOpen?: () => void;
	onStar?: () => void;
	onLabelPress?: (label: string) => void;
	style?: ViewStyle;
	testID?: string;
}

export function InfoDrawer({
	visible,
	labels = [],
	ocrText,
	processingFailed = false,
	onClose,
	onDelete,
	onShare,
	onCopy,
	onOpen,
	onStar,
	onLabelPress,
	testID,
}: InfoDrawerProps) {
	const { colors, shadows } = useTheme();
	const screenHeight = Dimensions.get("window").height;

	const snapPoints = {
		closed: screenHeight,
		peek: screenHeight * 0.9, // 10% visible
		half: screenHeight * 0.5,
		full: screenHeight * 0.1, // 90% visible
	};

	const translateY = useSharedValue(snapPoints.closed);

	useEffect(() => {
		if (visible) {
			translateY.value = withSpring(snapPoints.peek, { damping: 20, stiffness: 300 });
		} else {
			translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		}
	}, [visible, translateY, snapPoints.peek, snapPoints.closed]);

	const snapToPoint = useCallback((point: SnapPoint) => {
		translateY.value = withSpring(snapPoints[point], { damping: 20, stiffness: 300 });
	}, [translateY, snapPoints]);

	const handleClose = useCallback(() => {
		translateY.value = withSpring(snapPoints.closed, { damping: 20, stiffness: 300 });
		setTimeout(() => {
			onClose();
		}, 300);
	}, [onClose, translateY, snapPoints.closed]);

	// Pan gesture for dragging
	const pan = Gesture.Pan()
		.onUpdate((event) => {
			const newY = snapPoints.peek + event.translationY;
			if (newY >= snapPoints.full && newY <= snapPoints.closed) {
				translateY.value = newY;
			}
		})
		.onEnd((event) => {
			const velocity = event.velocityY;

			// Determine snap point based on position and velocity
			if (velocity > 500) {
				// Fast swipe down
				if (translateY.value < snapPoints.half) {
					runOnJS(snapToPoint)("half");
				} else {
					runOnJS(handleClose)();
				}
			} else if (velocity < -500) {
				// Fast swipe up
				if (translateY.value > snapPoints.half) {
					runOnJS(snapToPoint)("half");
				} else {
					runOnJS(snapToPoint)("full");
				}
			} else {
				// Snap to nearest point
				const distances = Object.entries(snapPoints).map(([key, value]) => ({
					key: key as SnapPoint,
					distance: Math.abs(translateY.value - value),
				}));
				const nearest = distances.reduce((min, curr) =>
					curr.distance < min.distance ? curr : min
				);

				if (nearest.key === "closed") {
					runOnJS(handleClose)();
				} else {
					runOnJS(snapToPoint)(nearest.key);
				}
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
				<ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
					{/* Processing Failed Badge */}
					{processingFailed && (
						<Badge status="failed" style={styles.failedBadge} />
					)}

					{/* Labels Section */}
					{labels.length > 0 && (
						<View style={styles.section}>
							<Text style={[styles.sectionTitle, { color: colors.text }]}>
								Detected Labels
							</Text>
							<View style={styles.labelContainer}>
								{labels.map((labelItem, index) => (
									<LabelTag
										key={`${labelItem.id}-${index}`}
										label={labelItem.label}
										confidence={labelItem.confidence}
										onPress={
											onLabelPress
												? () => onLabelPress(labelItem.label)
												: undefined
										}
										style={styles.labelTag}
									/>
								))}
							</View>
						</View>
					)}

					{/* OCR Text Section */}
					{ocrText && ocrText.text && (
						<View style={styles.section}>
							<Text style={[styles.sectionTitle, { color: colors.text }]}>
								Extracted Text
							</Text>
							<Text style={[styles.ocrText, { color: colors.textSecondary }]}>
								{ocrText.text}
							</Text>
						</View>
					)}

					{/* Action Buttons */}
					<View style={styles.actionsContainer}>
						{onDelete && (
							<Button
								variant="secondary"
								size="small"
								onPress={onDelete}
								icon={<Icon name="delete" size="small" />}
								style={styles.actionButton}
							>
								Delete
							</Button>
						)}
						{onShare && (
							<Button
								variant="secondary"
								size="small"
								onPress={onShare}
								icon={<Icon name="share-variant" size="small" />}
								style={styles.actionButton}
							>
								Share
							</Button>
						)}
						{onCopy && (
							<Button
								variant="secondary"
								size="small"
								onPress={onCopy}
								icon={<Icon name="content-copy" size="small" />}
								style={styles.actionButton}
							>
								Copy
							</Button>
						)}
						{onOpen && (
							<Button
								variant="secondary"
								size="small"
								onPress={onOpen}
								icon={<Icon name="open-in-new" size="small" />}
								style={styles.actionButton}
							>
								Open
							</Button>
						)}
						{onStar && (
							<Button
								variant="secondary"
								size="small"
								onPress={onStar}
								icon={<Icon name="star-outline" size="small" />}
								style={styles.actionButton}
							>
								Star
							</Button>
						)}
					</View>
				</ScrollView>
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
	content: {
		flex: 1,
		paddingHorizontal: Spacing.md,
	},
	failedBadge: {
		marginBottom: Spacing.md,
	},
	section: {
		marginBottom: Spacing.lg,
	},
	sectionTitle: {
		fontSize: Typography.fontSize.lg,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: Spacing.sm,
	},
	labelContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: Spacing.sm,
	},
	labelTag: {
		marginBottom: Spacing.xs,
	},
	ocrText: {
		fontSize: Typography.fontSize.md,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.md,
	},
	actionsContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: Spacing.sm,
		paddingBottom: Spacing.xl,
	},
	actionButton: {
		flex: 1,
		minWidth: 100,
	},
});
