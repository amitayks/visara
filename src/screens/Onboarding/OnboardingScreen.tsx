import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
	OnboardingTemplate,
	type OnboardingScreen as OnboardingScreenType,
} from "@components/templates/OnboardingTemplate";
import { Icon } from "@components/atoms/Icon";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useSettings } from "@contexts/SettingsContext";
import { useToast } from "@contexts/ToastContext";
import {
	requestPermission,
	PermissionType,
	PermissionStatus,
	openSettings,
} from "@utils/permissions";

// Screen 1: Welcome
function WelcomeContent({
	colors,
}: {
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	return (
		<View style={styles.container}>
			<View
				style={[
					styles.iconContainer,
					{ backgroundColor: colors.buttonPrimary },
				]}
			>
				<Icon
					name="folder-multiple-image"
					size={64}
					color={colors.buttonPrimaryText}
				/>
			</View>

			<View>
				<Text style={[styles.title, { color: colors.text }]}>
					Welcome to Visara
				</Text>

				<Text style={[styles.description, { color: colors.textSecondary }]}>
					Your intelligent photo gallery that helps you organize and find your
					photos effortlessly.
				</Text>
			</View>

			<View style={styles.featuresList}>
				<View style={styles.featureItem}>
					<Icon name="magnify" size="medium" color={colors.buttonPrimary} />
					<Text style={[styles.featureText, { color: colors.text }]}>
						Search photos with natural language
					</Text>
				</View>

				<View style={styles.featureItem}>
					<Icon name="auto-fix" size="medium" color={colors.buttonPrimary} />
					<Text style={[styles.featureText, { color: colors.text }]}>
						Automatic smart organization
					</Text>
				</View>

				<View style={styles.featureItem}>
					<Icon
						name="shield-check"
						size="medium"
						color={colors.buttonPrimary}
					/>
					<Text style={[styles.featureText, { color: colors.text }]}>
						100% private and secure
					</Text>
				</View>
			</View>
		</View>
	);
}

// Screen 2: AI Features
function AIFeaturesContent({
	colors,
}: {
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	return (
		<View style={styles.container}>
			<View
				style={[
					styles.iconContainer,
					{ backgroundColor: colors.buttonPrimary },
				]}
			>
				<Icon name="brain" size={64} color={colors.buttonPrimaryText} />
			</View>

			<View>
				<Text style={[styles.title, { color: colors.text }]}>
					Intelligent AI
				</Text>

				<Text style={[styles.description, { color: colors.textSecondary }]}>
					Powerful on-device AI analyzes your photos to make them easily
					searchable and organized.
				</Text>
			</View>

			<View style={styles.capabilitiesList}>
				<View style={styles.capabilityItem}>
					<Icon
						name="image-search"
						size="medium"
						color={colors.buttonPrimary}
					/>
					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Object Detection
						</Text>
						<Text
							style={[
								styles.capabilityDescription,
								{ color: colors.textSecondary },
							]}
						>
							Automatically identifies objects, scenes, and concepts in your
							photos
						</Text>
					</View>
				</View>

				<View style={styles.capabilityItem}>
					<Icon
						name="text-recognition"
						size="medium"
						color={colors.buttonPrimary}
					/>

					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Text Recognition
						</Text>
						<Text
							style={[
								styles.capabilityDescription,
								{ color: colors.textSecondary },
							]}
						>
							Extracts text from documents, receipts, and screenshots
						</Text>
					</View>
				</View>

				<View style={styles.capabilityItem}>
					<Icon name="folder-star" size="medium" color={colors.buttonPrimary} />
					<View style={styles.capabilityContent}>
						<Text style={[styles.capabilityTitle, { color: colors.text }]}>
							Smart Albums
						</Text>
						<Text
							style={[
								styles.capabilityDescription,
								{ color: colors.textSecondary },
							]}
						>
							Creates albums for receipts, documents, ID cards, and more
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

// Screen 3: Privacy
function PrivacyContent({
	colors,
}: {
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	return (
		<View style={styles.container}>
			<View
				style={[
					styles.iconContainer,
					{ backgroundColor: colors.buttonPrimary },
				]}
			>
				<Icon name="shield-lock" size={64} color={colors.buttonPrimaryText} />
			</View>

			<View>
				<Text style={[styles.title, { color: colors.text }]}>
					Privacy Matters
				</Text>

				<Text style={[styles.description, { color: colors.textSecondary }]}>
					All processing happens on your device. Your photos never leave your
					phone.
				</Text>
			</View>

			<View style={styles.guaranteesList}>
				<View style={styles.guaranteeItem}>
					<Icon name="check" size="medium" color={colors.buttonPrimary} />
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							100% On-Device Processing
						</Text>
						<Text
							style={[
								styles.guaranteeDescription,
								{ color: colors.textSecondary },
							]}
						>
							All AI analysis runs locally on your device without internet
						</Text>
					</View>
				</View>

				{/* <View style={styles.guaranteeItem}>
					<Icon name="check" size="medium" color={colors.buttonPrimary} />
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							No Cloud Uploads
						</Text>
						<Text
							style={[
								styles.guaranteeDescription,
								{ color: colors.textSecondary },
							]}
						>
							Your photos and data stay on your device, always
						</Text>
					</View>
				</View> */}

				<View style={styles.guaranteeItem}>
					<Icon name="check" size="medium" color={colors.buttonPrimary} />
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							Encrypted Storage
						</Text>
						<Text
							style={[
								styles.guaranteeDescription,
								{ color: colors.textSecondary },
							]}
						>
							All processed data is encrypted with device-level security
						</Text>
					</View>
				</View>

				<View style={styles.guaranteeItem}>
					<Icon name="check" size="medium" color={colors.buttonPrimary} />
					<View style={styles.guaranteeContent}>
						<Text style={[styles.guaranteeTitle, { color: colors.text }]}>
							No Analytics or Tracking
						</Text>
						<Text
							style={[
								styles.guaranteeDescription,
								{ color: colors.textSecondary },
							]}
						>
							We don't collect, track, or share any of your information
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

// Screen 4: Permissions
function PermissionsContent({
	colors,
}: {
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	return (
		<View style={styles.container}>
			<View
				style={[
					styles.iconContainer,
					{ backgroundColor: colors.buttonPrimary },
				]}
			>
				<Icon name="key" size={64} color={colors.buttonPrimaryText} />
			</View>

			<View>
				<Text style={[styles.title, { color: colors.text }]}>Permissions</Text>

				<Text style={[styles.description, { color: colors.textSecondary }]}>
					To organize your photos, we need a few permissions. Here's why each
					one is needed:
				</Text>
			</View>

			<View style={styles.permissionsList}>
				<View style={styles.permissionItem}>
					<Icon
						name="folder-image"
						size="medium"
						color={colors.buttonPrimary}
					/>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Storage Access (Required)
						</Text>
						<Text
							style={[
								styles.permissionDescription,
								{ color: colors.textSecondary },
							]}
						>
							Full access to read and write your photos, videos, and documents
						</Text>
					</View>
				</View>

				<View style={styles.permissionItem}>
					<Icon
						name="bell-outline"
						size="medium"
						color={colors.buttonPrimary}
					/>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Notifications (Required)
						</Text>
						<Text
							style={[
								styles.permissionDescription,
								{ color: colors.textSecondary },
							]}
						>
							Shows progress updates for background AI processing
						</Text>
					</View>
				</View>

				<View style={styles.permissionItem}>
					<Icon name="camera" size="medium" color={colors.buttonPrimary} />
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Camera Access (Optional)
						</Text>
						<Text
							style={[
								styles.permissionDescription,
								{ color: colors.textSecondary },
							]}
						>
							Allows you to capture new photos directly in the app
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

export function OnboardingScreen() {
	const { colors } = useTheme();
	const { dispatch } = useSettings();
	const { showError, showWarning, showInfo } = useToast();

	const handleComplete = async () => {
		// Request REQUIRED permissions: Storage Read/Write + Notifications
		try {
			// 1. Request Storage Read permission (REQUIRED)
			const storageReadResult = await requestPermission(
				PermissionType.STORAGE_READ,
			);

			// Handle BLOCKED (user selected "Never ask again")
			if (storageReadResult.status === PermissionStatus.BLOCKED) {
				showError(
					"Storage permission is permanently blocked. Please enable it in Settings.",
					{
						action: { text: "Open Settings", onPress: openSettings },
					},
				);
				return; // Cannot continue without storage access
			}

			// Handle DENIED (user denied but can ask again)
			if (storageReadResult.status !== PermissionStatus.GRANTED) {
				showError("Storage access is required. Please grant permission.");
				return; // Cannot continue without storage access
			}

			// 2. Request Storage Write permission (REQUIRED)
			const storageWriteResult = await requestPermission(
				PermissionType.STORAGE_WRITE,
			);

			if (storageWriteResult.status === PermissionStatus.BLOCKED) {
				showError(
					"Storage permission is permanently blocked. Please enable it in Settings to use Visara.",
					{
						action: { text: "Open Settings", onPress: openSettings },
					},
				);
				return; // Cannot continue without storage access
			}

			if (storageWriteResult.status !== PermissionStatus.GRANTED) {
				showError("Storage access is required. Please grant permission.");
				return; // Cannot continue without storage access
			}

			// 3. Request Notifications permission (soft-required - warn but continue)
			const notificationsResult = await requestPermission(
				PermissionType.NOTIFICATIONS,
			);

			if (notificationsResult.status === PermissionStatus.BLOCKED) {
				showWarning(
					"Notifications are permanently blocked. You won't see processing progress updates.",
					{
						action: { text: "Open Settings", onPress: openSettings },
					},
				);
			} else if (notificationsResult.status === PermissionStatus.DENIED) {
				showInfo(
					"You won't receive notifications about processing progress, but Visara will work normally.",
				);
			}

			// 4. Request Camera permission (OPTIONAL - just inform if not granted)
			const cameraResult = await requestPermission(
				PermissionType.CAMERA,
				false,
			);

			if (cameraResult.status === PermissionStatus.BLOCKED) {
				showInfo(
					"Camera is blocked. You can grant it later in Settings if you want to capture photos in-app.",
				);
			} else if (cameraResult.status === PermissionStatus.DENIED) {
				// Silent - camera is optional, don't spam user
			}

			// All required permissions granted, complete onboarding
			dispatch({ type: "SET_ONBOARDING_COMPLETED", payload: true });
		} catch (error) {
			console.error("Permission request failed:", error);
			showError("Failed to request permissions. Please try again.");
		}
	};

	const screens: OnboardingScreenType[] = useMemo(
		() => [
			{
				id: "welcome",
				content: <WelcomeContent colors={colors} />,
			},
			{
				id: "ai-features",
				content: <AIFeaturesContent colors={colors} />,
			},
			{
				id: "privacy",
				content: <PrivacyContent colors={colors} />,
			},
			{
				id: "permissions",
				content: <PermissionsContent colors={colors} />,
			},
		],
		[colors],
	);

	return (
		<OnboardingTemplate
			screens={screens}
			onComplete={handleComplete}
			showSkip={true}
			testID="onboarding-screen"
		/>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.xl,
	},
	iconContainer: {
		width: 120,
		height: 120,
		borderRadius: 60,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: Spacing.xl,
	},
	title: {
		fontSize: Typography.fontSize.xxxl,
		fontWeight: Typography.fontWeight.bold,
		textAlign: "center",
		marginBottom: Spacing.md,
	},
	description: {
		fontSize: Typography.fontSize.lg,
		textAlign: "center",
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.lg,
		marginBottom: Spacing.xxl,
	},
	// Welcome screen styles
	featuresList: {
		width: "100%",
		gap: Spacing.xxl + Spacing.md,
		marginBottom: Spacing.xxl + Spacing.md,
	},
	featureItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: Spacing.xl,
	},
	featureText: {
		fontSize: Typography.fontSize.md,
	},
	// AI Features screen styles
	capabilitiesList: {
		width: "100%",
		gap: Spacing.lg,
	},
	capabilityItem: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: Spacing.md,
	},
	capabilityIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	capabilityContent: {
		// flex: 1,
		gap: Spacing.xs / 2,
	},
	capabilityTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	capabilityDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
		// width: "60%",
	},
	// Privacy screen styles
	guaranteesList: {
		width: "100%",
		gap: Spacing.md,
	},
	guaranteeItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: Spacing.md,
	},
	guaranteeContent: {
		gap: Spacing.xs / 2,
	},
	guaranteeTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	guaranteeDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
	// Permissions screen styles
	permissionsList: {
		width: "100%",
		gap: Spacing.lg,
		// marginBottom: Spacing.xl,
	},
	permissionItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: Spacing.md,
	},
	permissionIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	permissionContent: {
		gap: Spacing.xs / 2,
	},
	permissionTitle: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	permissionDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
	footerNote: {
		fontSize: Typography.fontSize.sm,
		textAlign: "center",
		fontStyle: "italic",
	},
});
