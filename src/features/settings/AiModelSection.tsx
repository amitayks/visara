/**
 * Settings "AI Model" section (ai-model-settings spec, v2). Data-driven from
 * `useModelStore` — the modelStore mirrors `GemmaModelDeliveryService`'s
 * emit-on-subscribe stream, so BOTH the delivery state and the enabled flag
 * track the service truth (never a component-local snapshot that can drift
 * when the preference changes from another surface).
 */

import { GemmaModelDeliveryService, Pipeline } from "@backend/facade";
import {
	DISK_HEADROOM_BYTES,
	MODEL_TOTAL_BYTES,
} from "@backend/model/manifest";
import type { DeliveryStatus } from "@backend/types";
import { useModelStore } from "@state/modelStore";
import {
	Button,
	Dialog,
	ListSection,
	SwitchRow,
	Text,
	toast,
} from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useState } from "react";
import { View } from "react-native";

const STATUS_LABELS: Record<DeliveryStatus, string> = {
	idle: "Not downloaded",
	downloading: "Downloading",
	paused: "Paused",
	verifying: "Verifying",
	ready: "Ready",
	failed: "Failed",
};

/** Human copy for a rejected/failed start (derived from the state reason). */
const REASON_COPY: Record<string, string> = {
	notEnoughSpace: "Not enough free space for the model set plus headroom.",
	checksumMismatch:
		"A downloaded file failed integrity verification and was removed. Retry the download.",
	network: "The download hit a network error. It will resume on retry.",
	alreadyActive: "The download is already running.",
	alreadyReady: "The model is already downloaded and verified.",
	unknown: "The download could not start.",
};

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** index;
	return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? "B"}`;
}

export interface AiModelSectionProps {
	/** Fetched by the screen on focus + delivery-state change (no polling). */
	freeDisk: number | null;
}

export function AiModelSection({ freeDisk }: AiModelSectionProps) {
	const storeState = useModelStore((s) => s.state);
	const enabled = useModelStore((s) => s.enabled);
	const setEnabled = useModelStore((s) => s.setEnabled);
	// Before bootstrap attaches the subscription the store holds null; the
	// service getter returns the same persisted state the first emit carries.
	const state = storeState ?? GemmaModelDeliveryService.getState();

	const [deleteVisible, setDeleteVisible] = useState(false);

	const handleDownload = useCallback(() => {
		void (async () => {
			try {
				const result = await GemmaModelDeliveryService.startDownload();
				if (result.started) {
					// Starting a multi-GB download IS the opt-in: pre-enable so
					// analysis starts hands-free the moment verification
					// completes. Otherwise a fresh install / post-wipe download
					// leaves the pipeline parked on "model not ready" behind a
					// second, easy-to-miss toggle even though the model shows
					// Ready. The toggle still turns analysis off afterwards.
					setEnabled(true);
				} else {
					toast(REASON_COPY[result.reason ?? "unknown"] ?? REASON_COPY.unknown);
				}
			} catch {
				toast.error("Couldn't start the model download");
			}
		})();
	}, [setEnabled]);

	const handlePause = useCallback(() => {
		void GemmaModelDeliveryService.pause().catch(() => {
			toast.error("Couldn't pause the download");
		});
	}, []);

	const handleResume = useCallback(() => {
		void GemmaModelDeliveryService.resume().catch(() => {
			toast.error("Couldn't resume the download");
		});
	}, []);

	const handleCancel = useCallback(() => {
		void GemmaModelDeliveryService.cancel().catch(() => {
			toast.error("Couldn't cancel the download");
		});
	}, []);

	const handleDeleteModel = useCallback(() => {
		setDeleteVisible(false);
		void GemmaModelDeliveryService.deleteModel()
			.then(() => toast("Model deleted"))
			.catch(() => toast.error("Couldn't delete the model files"));
	}, []);

	const handleReanalysis = useCallback(() => {
		void Pipeline.reprocess().catch((error) => {
			console.warn("AiModelSection: reprocess failed", error);
			toast.error("Couldn't start re-analysis");
		});
	}, []);

	const modelSizeBytes =
		state.bytesTotal > 0 ? state.bytesTotal : MODEL_TOTAL_BYTES;
	const percent =
		state.bytesTotal > 0
			? Math.min(
					100,
					Math.round((state.bytesDownloaded / state.bytesTotal) * 100),
				)
			: 0;
	const insufficientSpace =
		freeDisk !== null &&
		modelSizeBytes > 0 &&
		freeDisk < modelSizeBytes + DISK_HEADROOM_BYTES;
	const ready = enabled && state.status === "ready";

	const isActive = state.status === "downloading";
	const isPaused = state.status === "paused";
	const isVerifying = state.status === "verifying";
	const hasFiles =
		state.status === "ready" ||
		isVerifying ||
		isPaused ||
		state.artifacts.some((a) => a.verified || a.bytesDownloaded > 0);

	return (
		<ListSection title="AI Model">
			<View style={styles.overview}>
				<Text variant="footnote" color="textSecondary">
					Optional on-device Gemma model set for analysis and search. It
					downloads once over Wi-Fi, then runs fully offline. The app works
					without it.
				</Text>

				<View style={styles.metaRow}>
					<Text variant="subhead" color="textSecondary">
						Status
					</Text>
					<Text variant="subhead" testID="ai-model-status">
						{STATUS_LABELS[state.status]}
					</Text>
				</View>
				<View style={styles.metaRow}>
					<Text variant="subhead" color="textSecondary">
						Model
					</Text>
					<Text variant="subhead">Gemma 4 E2B + EmbeddingGemma</Text>
				</View>
				<View style={styles.metaRow}>
					<Text variant="subhead" color="textSecondary">
						Size / Free
					</Text>
					<Text variant="subhead">
						{`~${formatBytes(modelSizeBytes)} / ${
							freeDisk !== null ? formatBytes(freeDisk) : "…"
						}`}
					</Text>
				</View>

				{isActive || isPaused ? (
					<View style={styles.progressBlock}>
						<Text variant="subhead" testID="ai-model-progress">
							{`${percent}% · ${formatBytes(state.bytesDownloaded)} of ${formatBytes(modelSizeBytes)}`}
						</Text>
					</View>
				) : null}

				{insufficientSpace && state.status !== "ready" ? (
					<Text variant="footnote" color="warning">
						Not enough free space for the model set plus headroom.
					</Text>
				) : null}

				{state.status === "failed" && state.errorReason ? (
					<Text variant="footnote" color="danger">
						{REASON_COPY[state.errorReason] ?? REASON_COPY.unknown}
					</Text>
				) : null}

				<View style={styles.controlsRow}>
					{state.status === "idle" || state.status === "failed" ? (
						<Button
							title={state.status === "failed" ? "Retry" : "Download"}
							icon={state.status === "failed" ? "refresh" : "download"}
							onPress={handleDownload}
							testID="ai-model-download"
						/>
					) : null}
					{isActive ? (
						<Button
							title="Pause"
							variant="secondary"
							icon="pause"
							onPress={handlePause}
							testID="ai-model-pause"
						/>
					) : null}
					{isPaused ? (
						<Button
							title="Resume"
							icon="play"
							onPress={handleResume}
							testID="ai-model-resume"
						/>
					) : null}
					{isActive || isPaused ? (
						<Button
							title="Cancel"
							variant="secondary"
							icon="close"
							onPress={handleCancel}
							testID="ai-model-cancel"
						/>
					) : null}
					{hasFiles && !isActive ? (
						<Button
							title="Delete"
							variant="secondary"
							icon="delete-outline"
							onPress={() => setDeleteVisible(true)}
							testID="ai-model-delete"
						/>
					) : null}
				</View>
			</View>

			<SwitchRow
				title="Use on-device model"
				subtitle="Enable Gemma analysis once the model set is downloaded and verified"
				value={enabled}
				onValueChange={setEnabled}
				testID="ai-model-enabled"
			/>

			<View style={styles.reanalysisRow}>
				<View style={styles.reanalysisTexts}>
					<Text variant="body">Re-run analysis</Text>
					<Text variant="footnote" color="textSecondary">
						{ready
							? "Re-analyze your library with the on-device model"
							: "Available once the model is downloaded and enabled"}
					</Text>
				</View>
				<Button
					title="Re-run"
					variant="secondary"
					disabled={!ready}
					onPress={handleReanalysis}
					testID="ai-model-reanalyze"
				/>
			</View>

			<Dialog
				visible={deleteVisible}
				title="Delete model"
				message="Remove the downloaded AI model set to reclaim storage? You can download it again later over Wi-Fi."
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteModel}
				onCancel={() => setDeleteVisible(false)}
			/>
		</ListSection>
	);
}

const styles = StyleSheet.create((theme) => ({
	overview: {
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
		gap: theme.spacing.sm,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing.md,
	},
	progressBlock: {
		gap: theme.spacing.xxs,
	},
	controlsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing.sm,
		marginTop: theme.spacing.xs,
	},
	reanalysisRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
	},
	reanalysisTexts: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
}));
