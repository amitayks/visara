import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import {
	type DeliveryState,
	type DeliveryStatus,
	GemmaModelDeliveryService,
} from "@services/model/GemmaModelDeliveryService";
import {
	type GemmaModelVariant,
	isDigestPinned,
} from "@services/model/gemmaModelManifest";
import { Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import DeviceInfo from "react-native-device-info";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
	notPresent: "Not downloaded",
	queued: "Queued",
	downloading: "Downloading",
	paused: "Paused",
	verifying: "Verifying",
	ready: "Ready",
	failed: "Failed",
};

const VARIANT_LABELS: Record<GemmaModelVariant, string> = {
	mlx: "MLX (iOS)",
	vulkan: "Vulkan (Android)",
	aicore: "AICore (on-device)",
};

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** index;
	return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? "B"}`;
}

/**
 * Settings "AI Model" section (change: ai-model-settings). Data-driven from
 * `GemmaModelDeliveryService` via a live subscription plus a free-disk poll, so
 * it reflects delivery-state transitions without reopening the drawer. Renders
 * status/progress, variant, size-vs-free-disk, the opt-in enable toggle, the
 * download lifecycle controls, and the EXPOSED "Re-run analysis" seam (which
 * wires no active Tier-1 drain in this change).
 */
export function AiModelSection() {
	const { colors } = useTheme();
	const manifest = useMemo(() => GemmaModelDeliveryService.getManifest(), []);

	const [state, setState] = useState<DeliveryState>(() =>
		GemmaModelDeliveryService.getState(),
	);
	const [enabled, setEnabled] = useState<boolean>(() =>
		GemmaModelDeliveryService.isEnabled(),
	);
	const [freeDisk, setFreeDisk] = useState<number | null>(null);

	// Live delivery-state subscription (emits current state immediately).
	useEffect(() => GemmaModelDeliveryService.subscribe(setState), []);

	// Poll free disk (storage fills and empties).
	useEffect(() => {
		let active = true;
		const read = async () => {
			try {
				const free = await DeviceInfo.getFreeDiskStorage();
				if (active) setFreeDisk(free);
			} catch {
				// Advisory only; ignore read errors.
			}
		};
		void read();
		const id = setInterval(() => void read(), 4000);
		return () => {
			active = false;
			clearInterval(id);
		};
	}, []);

	const handleDownload = useCallback(async () => {
		const result = await GemmaModelDeliveryService.startDownload();
		if (!result.started) {
			Alert.alert("AI Model", result.message);
		}
	}, []);

	const handlePause = useCallback(async () => {
		await GemmaModelDeliveryService.pause();
	}, []);

	const handleResume = useCallback(async () => {
		await GemmaModelDeliveryService.resume();
	}, []);

	const handleCancel = useCallback(async () => {
		await GemmaModelDeliveryService.cancel();
	}, []);

	const handleDelete = useCallback(() => {
		Alert.alert(
			"Delete Model",
			"Remove the downloaded AI model to reclaim storage? You can download it again later over Wi-Fi.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: () => {
						void GemmaModelDeliveryService.deleteModel();
					},
				},
			],
		);
	}, []);

	const handleToggleEnabled = useCallback((next: boolean) => {
		GemmaModelDeliveryService.setEnabled(next);
		setEnabled(next);
	}, []);

	const handleReanalysis = useCallback(() => {
		GemmaModelDeliveryService.requestReanalysis();
	}, []);

	const modelSizeBytes =
		state.bytesTotal > 0 ? state.bytesTotal : manifest.expectedBytes;
	const percent =
		state.bytesTotal > 0
			? Math.min(
					100,
					Math.round((state.bytesDownloaded / state.bytesTotal) * 100),
				)
			: 0;
	const insufficientSpace = freeDisk !== null && freeDisk < modelSizeBytes;
	const pinned = isDigestPinned(manifest);
	const ready = enabled && state.status === "ready" && state.checksumVerified;

	const isActive = state.status === "queued" || state.status === "downloading";
	const isPaused = state.status === "paused";
	const isVerifying = state.status === "verifying";
	const hasFiles =
		state.status === "ready" || state.status === "verifying" || isPaused;

	return (
		<View style={styles.section}>
			<Text style={[styles.sectionTitle, { color: colors.text }]}>
				AI Model
			</Text>

			<Text style={[styles.description, { color: colors.textSecondary }]}>
				Optional on-device Gemma model for advanced analysis. It downloads once
				over Wi-Fi, then runs fully offline. The app works without it.
			</Text>

			{/* Status + variant */}
			<View style={styles.metaRow}>
				<Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
					Status
				</Text>
				<Text style={[styles.metaValue, { color: colors.text }]}>
					{STATUS_LABELS[state.status]}
				</Text>
			</View>
			<View style={styles.metaRow}>
				<Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
					Variant
				</Text>
				<Text style={[styles.metaValue, { color: colors.text }]}>
					{VARIANT_LABELS[state.variant]}
				</Text>
			</View>
			<View style={styles.metaRow}>
				<Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
					Size / Free
				</Text>
				<Text style={[styles.metaValue, { color: colors.text }]}>
					{`~${formatBytes(modelSizeBytes)} / ${
						freeDisk !== null ? formatBytes(freeDisk) : "…"
					}`}
				</Text>
			</View>

			{/* Progress while a transfer is active */}
			{(isActive || isPaused) && (
				<View style={styles.progressBlock}>
					<Text style={[styles.progressText, { color: colors.text }]}>
						{`${percent}% · ${formatBytes(state.bytesDownloaded)} / ${formatBytes(
							modelSizeBytes,
						)}`}
					</Text>
					{state.waitingReason && (
						<Text style={[styles.waitingText, { color: colors.warning }]}>
							{state.waitingReason}
						</Text>
					)}
				</View>
			)}

			{/* Insufficient-space warning (surfaced instead of a generic error) */}
			{insufficientSpace && state.status !== "ready" && (
				<Text style={[styles.warningText, { color: colors.warning }]}>
					Not enough free space for the model plus headroom.
				</Text>
			)}

			{/* Downloaded-but-unverifiable (POC: digest not yet pinned) */}
			{isVerifying && !pinned && (
				<Text style={[styles.warningText, { color: colors.textSecondary }]}>
					Downloaded — integrity verification pending configuration.
				</Text>
			)}

			{/* Failure reason */}
			{state.status === "failed" && state.error && (
				<Text style={[styles.warningText, { color: colors.error }]}>
					{state.error}
				</Text>
			)}

			{/* Lifecycle controls */}
			<View style={styles.controlsRow}>
				{(state.status === "notPresent" || state.status === "failed") && (
					<Button
						variant="primary"
						size="small"
						onPress={handleDownload}
						icon={<Icon name="download" size="small" />}
						style={styles.controlButton}
					>
						{state.status === "failed" ? "Retry" : "Download"}
					</Button>
				)}
				{isActive && (
					<Button
						variant="secondary"
						size="small"
						onPress={handlePause}
						icon={<Icon name="pause" size="small" />}
						style={styles.controlButton}
					>
						Pause
					</Button>
				)}
				{isPaused && (
					<Button
						variant="primary"
						size="small"
						onPress={handleResume}
						icon={<Icon name="play" size="small" />}
						style={styles.controlButton}
					>
						Resume
					</Button>
				)}
				{(isActive || isPaused) && (
					<Button
						variant="secondary"
						size="small"
						onPress={handleCancel}
						icon={<Icon name="close" size="small" />}
						style={styles.controlButton}
					>
						Cancel
					</Button>
				)}
				{hasFiles && !isActive && (
					<Button
						variant="secondary"
						size="small"
						onPress={handleDelete}
						icon={<Icon name="delete-outline" size="small" />}
						style={styles.controlButton}
					>
						Delete
					</Button>
				)}
			</View>

			{/* Opt-in enable toggle */}
			<View style={styles.settingRow}>
				<View style={styles.settingInfo}>
					<Text style={[styles.settingLabel, { color: colors.text }]}>
						Use on-device model
					</Text>
					<Text
						style={[styles.settingDescription, { color: colors.textSecondary }]}
					>
						Enable Gemma analysis once the model is downloaded and verified
					</Text>
				</View>
				<Switch
					value={enabled}
					onValueChange={handleToggleEnabled}
					trackColor={{ false: colors.border, true: colors.buttonPrimary }}
					thumbColor={colors.surface}
				/>
			</View>

			{/* Exposed re-run seam (no active Tier-1 drain wired) */}
			<View style={styles.settingRow}>
				<View style={styles.settingInfo}>
					<Text style={[styles.settingLabel, { color: colors.text }]}>
						Re-run analysis
					</Text>
					<Text
						style={[styles.settingDescription, { color: colors.textSecondary }]}
					>
						{ready
							? "Re-analyze your library with the on-device model"
							: "Available once the model is downloaded and enabled"}
					</Text>
				</View>
				<Button
					variant="secondary"
					size="small"
					onPress={handleReanalysis}
					disabled={!ready}
				>
					Re-run
				</Button>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		marginBottom: Spacing.xl,
	},
	sectionTitle: {
		fontSize: Typography.fontSize.lg,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: Spacing.md,
	},
	description: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
		marginBottom: Spacing.md,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: Spacing.xs,
	},
	metaLabel: {
		fontSize: Typography.fontSize.sm,
	},
	metaValue: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.medium,
	},
	progressBlock: {
		paddingVertical: Spacing.sm,
		gap: Spacing.xs / 2,
	},
	progressText: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.medium,
	},
	waitingText: {
		fontSize: Typography.fontSize.sm,
	},
	warningText: {
		fontSize: Typography.fontSize.sm,
		marginTop: Spacing.xs,
	},
	controlsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: Spacing.sm,
		marginTop: Spacing.md,
		marginBottom: Spacing.sm,
	},
	controlButton: {
		minWidth: 96,
	},
	settingRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: Spacing.sm,
	},
	settingInfo: {
		flex: 1,
		marginRight: Spacing.md,
	},
	settingLabel: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.medium,
		marginBottom: Spacing.xs / 2,
	},
	settingDescription: {
		fontSize: Typography.fontSize.sm,
		lineHeight: Typography.lineHeight.relaxed * Typography.fontSize.sm,
	},
});
