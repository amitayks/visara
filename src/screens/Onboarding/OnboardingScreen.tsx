import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import {
	type OnboardingScreen as OnboardingScreenType,
	OnboardingTemplate,
} from "@components/templates/OnboardingTemplate";
import { useSettings } from "@contexts/SettingsContext";
import { GemmaModelDeliveryService } from "@services/model/GemmaModelDeliveryService";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
						Your photos never leave your device
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
							On-Device Processing
						</Text>
						<Text
							style={[
								styles.guaranteeDescription,
								{ color: colors.textSecondary },
							]}
						>
							The AI model downloads once over Wi-Fi, then all analysis runs
							offline on your device — your photos never leave it
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
							Photo Library Access
						</Text>
						<Text
							style={[
								styles.permissionDescription,
								{ color: colors.textSecondary },
							]}
						>
							Required to discover and organize all your photos
						</Text>
					</View>
				</View>

				<View style={styles.permissionItem}>
					<Icon name="camera" size="medium" color={colors.buttonPrimary} />
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Camera Access
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

				<View style={styles.permissionItem}>
					<Icon
						name="bell-outline"
						size="medium"
						color={colors.buttonPrimary}
					/>
					<View style={styles.permissionContent}>
						<Text style={[styles.permissionTitle, { color: colors.text }]}>
							Notifications
						</Text>
						<Text
							style={[
								styles.permissionDescription,
								{ color: colors.textSecondary },
							]}
						>
							Shows progress updates for background processing
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

// Screen 5: Optional on-device model
function ModelStepContent({
	colors,
}: {
	colors: ReturnType<typeof useTheme>["colors"];
}) {
	const [choice, setChoice] = useState<"idle" | "downloading" | "deferred">(
		"idle",
	);

	const handleDownload = useCallback(() => {
		// Fire-and-forget: onboarding NEVER awaits or blocks on the download.
		void GemmaModelDeliveryService.startDownload();
		setChoice("downloading");
	}, []);

	const handleDefer = useCallback(() => {
		setChoice("deferred");
	}, []);

	return (
		<View style={styles.container}>
			<View
				style={[
					styles.iconContainer,
					{ backgroundColor: colors.buttonPrimary },
				]}
			>
				<Icon
					name="download-circle-outline"
					size={64}
					color={colors.buttonPrimaryText}
				/>
			</View>

			<View>
				<Text style={[styles.title, { color: colors.text }]}>
					On-Device AI Model
				</Text>

				<Text style={[styles.description, { color: colors.textSecondary }]}>
					For advanced analysis, Visara can download an optional on-device AI
					model (a few gigabytes) once over Wi-Fi. After that it works fully
					offline — your photos never leave your device. It is optional; the app
					works without it, and you can manage it anytime in Settings.
				</Text>
			</View>

			<View style={styles.modelActions}>
				{choice === "downloading" ? (
					<Text style={[styles.modelStatus, { color: colors.success }]}>
						The download will run over Wi-Fi. You can pause or cancel it in
						Settings.
					</Text>
				) : choice === "deferred" ? (
					<Text style={[styles.modelStatus, { color: colors.textSecondary }]}>
						No problem — you can download it later from Settings.
					</Text>
				) : (
					<>
						<Button
							variant="primary"
							size="medium"
							onPress={handleDownload}
							icon={<Icon name="wifi" size="small" />}
							style={styles.modelButton}
						>
							Download on Wi-Fi
						</Button>
						<Button
							variant="secondary"
							size="medium"
							onPress={handleDefer}
							style={styles.modelButton}
						>
							Maybe later
						</Button>
					</>
				)}
			</View>
		</View>
	);
}

export function OnboardingScreen() {
	const { colors } = useTheme();
	const { dispatch } = useSettings();

	const handleComplete = async () => {
		// Request permissions before completing onboarding
		try {
			// const permissionsGranted =
			// 	await MediaDiscoveryService.requestPermissions();

			// Onboarding completes regardless of the permission outcome;
			// denied permissions degrade gracefully inside the gallery.
			// TODO: surface an alert explaining limited functionality when denied.
			dispatch({ type: "SET_ONBOARDING_COMPLETED", payload: true });
		} catch (error) {
			console.error("Permission request failed:", error);
			// Still complete onboarding even if permission request fails
			dispatch({ type: "SET_ONBOARDING_COMPLETED", payload: true });
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
				id: "model",
				content: <ModelStepContent colors={colors} />,
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
	modelActions: {
		width: "100%",
		gap: Spacing.md,
	},
	modelButton: {
		width: "100%",
	},
	modelStatus: {
		fontSize: Typography.fontSize.md,
		textAlign: "center",
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.md,
	},
	footerNote: {
		fontSize: Typography.fontSize.sm,
		textAlign: "center",
		fontStyle: "italic",
	},
});
