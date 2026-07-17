/**
 * Onboarding step contents (onboarding-experience + onboarding-model-step
 * specs), ported from the legacy OnboardingScreen with the privacy copy
 * contract preserved (BINDING): the optional AI model is downloaded ONCE over
 * Wi-Fi and analysis then runs fully offline; photos and personal data never
 * leave the device; no copy claims AI analysis never uses the internet.
 */

import { GemmaModelDeliveryService, requestMediaAccess } from "@backend/facade";
import { type PermissionState, useSettingsStore } from "@state/settingsStore";
import { Button, Icon, iconSizes, Text, toast } from "@ui/components";
import { StyleSheet, type ThemeColors } from "@ui/theme";
import { type ReactNode, useCallback, useState } from "react";
import { Linking, ScrollView, View } from "react-native";

// --- Shared step scaffold ----------------------------------------------------

function StepLayout({
	icon,
	title,
	description,
	children,
}: {
	icon: string;
	title: string;
	description: string;
	children?: ReactNode;
}) {
	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
			showsVerticalScrollIndicator={false}
		>
			<View style={styles.iconCircle}>
				<Icon name={icon} size={iconSizes.xl} color="textOnAccent" />
			</View>
			<View style={styles.header}>
				<Text variant="title1" style={styles.centeredText}>
					{title}
				</Text>
				<Text
					variant="subhead"
					color="textSecondary"
					style={styles.centeredText}
				>
					{description}
				</Text>
			</View>
			{children ? <View style={styles.body}>{children}</View> : null}
		</ScrollView>
	);
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
	return (
		<View style={styles.featureRow}>
			<Icon name={icon} color="accent" />
			<Text variant="subhead" style={styles.rowText}>
				{text}
			</Text>
		</View>
	);
}

function DetailRow({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<View style={styles.detailRow}>
			<Icon name="check" color="accent" />
			<View style={styles.rowBody}>
				<Text variant="headline">{title}</Text>
				<Text variant="footnote" color="textSecondary">
					{description}
				</Text>
			</View>
		</View>
	);
}

function OutcomeNote({
	icon,
	color,
	title,
	note,
}: {
	icon: string;
	color: keyof ThemeColors;
	title: string;
	note: string;
}) {
	return (
		<View style={styles.detailRow}>
			<Icon name={icon} color={color} />
			<View style={styles.rowBody}>
				<Text variant="headline" color={color}>
					{title}
				</Text>
				<Text variant="footnote" color="textSecondary">
					{note}
				</Text>
			</View>
		</View>
	);
}

// --- Step 1: Welcome ----------------------------------------------------------

export function WelcomeStep() {
	return (
		<StepLayout
			icon="folder-multiple-image"
			title="Welcome to Visara"
			description="Your intelligent photo gallery that helps you organize and find your photos effortlessly."
		>
			<FeatureRow icon="magnify" text="Search photos with natural language" />
			<FeatureRow icon="auto-fix" text="Automatic smart organization" />
			<FeatureRow
				icon="wifi"
				text="Optional AI model: downloaded once over Wi-Fi, then analysis runs fully offline"
			/>
			<FeatureRow
				icon="shield-check"
				text="Your photos and personal data never leave your device"
			/>
		</StepLayout>
	);
}

// --- Step 2: Privacy ----------------------------------------------------------

export function PrivacyStep() {
	return (
		<StepLayout
			icon="shield-lock"
			title="Privacy Matters"
			description="All processing happens on your device. Your photos never leave your phone."
		>
			<DetailRow
				title="On-Device Processing"
				description="The AI model downloads once over Wi-Fi, then all analysis runs offline on your device — your photos never leave it"
			/>
			<DetailRow
				title="Encrypted Storage"
				description="All processed data is encrypted with device-level security"
			/>
			<DetailRow
				title="No Analytics or Tracking"
				description="We don't collect, track, or share any of your information"
			/>
		</StepLayout>
	);
}

// --- Step 3: Permissions --------------------------------------------------------

function PermissionOutcome({
	state,
	requesting,
	onRequest,
	onOpenSettings,
}: {
	state: PermissionState;
	requesting: boolean;
	onRequest: () => void;
	onOpenSettings: () => void;
}) {
	if (state === "granted") {
		return (
			<OutcomeNote
				icon="check"
				color="success"
				title="Photo access granted"
				note="Visara can now discover and organize your photos."
			/>
		);
	}
	if (state === "limited") {
		return (
			<OutcomeNote
				icon="check"
				color="warning"
				title="Limited photo access"
				note="Visara will organize the photos you selected. You can add more photos anytime from system settings."
			/>
		);
	}
	if (state === "denied") {
		return (
			<>
				<OutcomeNote
					icon="image-off-outline"
					color="danger"
					title="Photo access denied"
					note="Without photo access, Visara can't discover or organize your photos. You can still finish setup and grant access later."
				/>
				<Button
					title="Try again"
					onPress={onRequest}
					loading={requesting}
					testID="onboarding-permission-retry"
				/>
				<Button
					title="Open settings"
					variant="secondary"
					onPress={onOpenSettings}
					testID="onboarding-permission-settings"
				/>
			</>
		);
	}
	return (
		<Button
			title="Allow photo access"
			icon="folder-image"
			onPress={onRequest}
			loading={requesting}
			testID="onboarding-permission-request"
		/>
	);
}

export function PermissionsStep() {
	const permissionState = useSettingsStore((s) => s.permissionState);
	const setPermissionState = useSettingsStore((s) => s.setPermissionState);
	const [requesting, setRequesting] = useState(false);

	/** Real platform request (never assumes granted); outcome drives the UI. */
	const requestAccess = useCallback(async () => {
		setRequesting(true);
		try {
			const outcome = await requestMediaAccess();
			setPermissionState(outcome);
		} catch (error) {
			console.warn("Onboarding permission request failed", error);
			toast.error("Permission request failed. Please try again.");
		} finally {
			setRequesting(false);
		}
	}, [setPermissionState]);

	const openSettings = useCallback(() => {
		Linking.openSettings().catch(() => {
			toast.error("Could not open system settings.");
		});
	}, []);

	return (
		<StepLayout
			icon="folder-image"
			title="Photo Access"
			description="Visara needs access to your photo library to discover and organize your photos. You can continue setup either way."
		>
			<PermissionOutcome
				state={permissionState}
				requesting={requesting}
				onRequest={() => void requestAccess()}
				onOpenSettings={openSettings}
			/>
		</StepLayout>
	);
}

// --- Step 4: Optional on-device model -----------------------------------------

export function ModelStep({ onAdvance }: { onAdvance: () => void }) {
	const [phase, setPhase] = useState<"choice" | "requested">("choice");

	/**
	 * Start-or-defer contract (onboarding-model-step spec): "Download now"
	 * opts in and starts delivery FIRE-AND-FORGET — onboarding never awaits
	 * or blocks on the multi-gigabyte download; failures surface as toasts.
	 */
	const downloadNow = useCallback(() => {
		setPhase("requested");
		GemmaModelDeliveryService.setEnabled(true);
		GemmaModelDeliveryService.startDownload()
			.then((result) => {
				if (result.started) return;
				toast(
					result.reason === "notEnoughSpace"
						? "Not enough free space for the model set. You can download it later from Settings."
						: result.reason === "alreadyReady"
							? "The model is already downloaded."
							: "The download is already running.",
				);
				if (result.reason === "notEnoughSpace") {
					setPhase("choice");
				}
			})
			.catch((error) => {
				console.warn("Onboarding model download failed to start", error);
				toast.error(
					"Could not start the model download. You can try again from Settings.",
				);
				setPhase("choice");
			});
	}, []);

	return (
		<StepLayout
			icon="download"
			title="On-Device AI Model"
			description="For analysis and semantic search, Visara can download the optional on-device Gemma model set (a few gigabytes) once. The download is optional and only runs over Wi-Fi; after that, analysis runs fully offline — your photos never leave your device. The app works without it, and you can manage it anytime in Settings."
		>
			{phase === "requested" ? (
				<Text variant="subhead" color="success" style={styles.centeredText}>
					The download will run over Wi-Fi. You can pause or cancel it anytime
					in Settings.
				</Text>
			) : (
				<>
					<Button
						title="Download now"
						icon="download"
						onPress={downloadNow}
						testID="onboarding-model-download"
					/>
					<Button
						title="Download later"
						variant="secondary"
						onPress={onAdvance}
						testID="onboarding-model-defer"
					/>
				</>
			)}
		</StepLayout>
	);
}

// --- Step 5: Completion ---------------------------------------------------------

export function CompleteStep() {
	return (
		<StepLayout
			icon="check"
			title="You're all set"
			description="Visara will organize your photos privately, right on this device. Tap Get started to open your gallery."
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: theme.spacing.xxl,
		paddingVertical: theme.spacing.xl,
	},
	iconCircle: {
		alignSelf: "center",
		padding: theme.spacing.xxxl,
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.accent,
		marginBottom: theme.spacing.xxl,
	},
	header: {
		gap: theme.spacing.md,
	},
	centeredText: {
		textAlign: "center",
	},
	body: {
		marginTop: theme.spacing.xxl,
		gap: theme.spacing.lg,
	},
	featureRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
	},
	detailRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: theme.spacing.md,
	},
	rowText: {
		flex: 1,
	},
	rowBody: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
}));
