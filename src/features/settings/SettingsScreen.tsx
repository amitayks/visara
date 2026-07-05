/**
 * Settings screen (settings-experience spec) — content only; it renders as a
 * native-stack route whose header (title "Settings") is set by the navigator.
 * Sections: Appearance, Processing, AI Model, Data Management, About.
 */

import { Pipeline, ThermalService } from "@backend/facade";
import type { DeliveryStatus } from "@backend/types";
import { useFocusEffect } from "@react-navigation/native";
import { useModelStore } from "@state/modelStore";
import { useProcessingStore } from "@state/processingStore";
import { useSettingsStore } from "@state/settingsStore";
import {
	Dialog,
	ListItem,
	ListSection,
	SegmentedControl,
	SwitchRow,
	Text,
	toast,
} from "@ui/components";
import { StyleSheet, type ThemeMode, useAppTheme } from "@ui/theme";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import DeviceInfo from "react-native-device-info";
import { AiModelSection } from "./AiModelSection";
import {
	clearImageCaches,
	DELETE_ALL_CONFIRM_PHRASE,
	deleteAllData,
} from "./dataActions";

const THEME_OPTIONS: ReadonlyArray<{ label: string; value: ThemeMode }> = [
	{ label: "Light", value: "light" },
	{ label: "Dark", value: "dark" },
	{ label: "System", value: "system" },
];

/**
 * Best-effort pause reason mirroring `BackgroundTaskService`'s gating
 * precedence (battery saver → night window → thermal). The orchestrator's
 * `paused` event carries no reason, so this derives one from the same inputs
 * the drain gate reads.
 */
export function derivePauseReason(input: {
	batterySaver: boolean;
	nightProcessing: boolean;
	charging: boolean | null;
	thermalThrottled: boolean;
	hour: number;
}): string {
	const outsideNightWindow = !(input.hour >= 0 && input.hour < 6);
	if (input.batterySaver && input.charging === false) {
		return "battery saver, waiting for charging";
	}
	if (input.nightProcessing && outsideNightWindow) {
		return "night processing, waiting for 00:00–06:00";
	}
	if (input.thermalThrottled) {
		return "thermal throttling";
	}
	if (input.batterySaver && input.charging === null) {
		return "battery saver";
	}
	return "paused by the system";
}

/**
 * Free disk + charging snapshot, refreshed on screen focus and on
 * delivery/pause transitions — never on a polling interval (contract rule).
 */
function useDeviceVitals(
	deliveryStatus: DeliveryStatus | undefined,
	isPaused: boolean,
): { freeDisk: number | null; charging: boolean | null } {
	const [vitals, setVitals] = useState<{
		freeDisk: number | null;
		charging: boolean | null;
	}>({ freeDisk: null, charging: null });

	const refresh = useCallback(() => {
		void (async () => {
			try {
				const [freeDisk, charging] = await Promise.all([
					DeviceInfo.getFreeDiskStorage(),
					DeviceInfo.isBatteryCharging(),
				]);
				setVitals({ freeDisk, charging });
			} catch {
				// Advisory readings only — keep the last known values.
			}
		})();
	}, []);

	useFocusEffect(refresh);
	useEffect(() => {
		refresh();
	}, [deliveryStatus, isPaused, refresh]);

	return vitals;
}

export function SettingsScreen() {
	const { theme } = useAppTheme();

	const themeMode = useSettingsStore((s) => s.theme);
	const setTheme = useSettingsStore((s) => s.setTheme);
	const batterySaver = useSettingsStore((s) => s.batterySaver);
	const setBatterySaver = useSettingsStore((s) => s.setBatterySaver);
	const nightProcessing = useSettingsStore((s) => s.nightProcessing);
	const setNightProcessing = useSettingsStore((s) => s.setNightProcessing);

	const isProcessing = useProcessingStore((s) => s.isProcessing);
	const isPaused = useProcessingStore((s) => s.isPaused);
	const processed = useProcessingStore((s) => s.processed);
	const total = useProcessingStore((s) => s.total);
	const failedCount = useProcessingStore((s) => s.failedCount);

	const deliveryStatus = useModelStore((s) => s.state?.status);
	const { freeDisk, charging } = useDeviceVitals(deliveryStatus, isPaused);

	const [deleteVisible, setDeleteVisible] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const [confirmError, setConfirmError] = useState(false);
	const [wiping, setWiping] = useState(false);
	const [clearingCache, setClearingCache] = useState(false);

	const appVersion = useMemo(() => DeviceInfo.getVersion(), []);

	const statusText = useMemo(() => {
		const counts =
			total > 0 ? `${processed} of ${total} processed` : "Nothing queued";
		const parts: string[] = [];
		if (isPaused) {
			parts.push(
				`Paused — ${derivePauseReason({
					batterySaver,
					nightProcessing,
					charging,
					thermalThrottled: ThermalService.isThrottledForDrain(),
					hour: new Date().getHours(),
				})}`,
			);
		} else if (isProcessing) {
			parts.push("Processing");
		}
		parts.push(counts);
		if (failedCount > 0) {
			parts.push(`${failedCount} failed`);
		}
		return parts.join(" · ");
	}, [
		batterySaver,
		charging,
		failedCount,
		isPaused,
		isProcessing,
		nightProcessing,
		processed,
		total,
	]);

	const handleRerunAnalysis = useCallback(() => {
		// Fire-and-forget by spec: the sweep is idempotent service-side and the
		// tap must never block on it.
		void Pipeline.reprocess().catch((error) => {
			console.warn("SettingsScreen: reprocess failed", error);
		});
		toast("Re-analysis started");
	}, []);

	const handleClearCache = useCallback(() => {
		if (clearingCache) return;
		setClearingCache(true);
		void (async () => {
			try {
				await clearImageCaches();
				toast.success("Cache cleared");
			} catch {
				toast.error("Couldn't clear the cache");
			} finally {
				setClearingCache(false);
			}
		})();
	}, [clearingCache]);

	const openDeleteDialog = useCallback(() => {
		if (wiping) return;
		setConfirmText("");
		setConfirmError(false);
		setDeleteVisible(true);
	}, [wiping]);

	const closeDeleteDialog = useCallback(() => {
		setDeleteVisible(false);
		setConfirmText("");
		setConfirmError(false);
	}, []);

	const handleConfirmDeleteAll = useCallback(() => {
		if (confirmText.trim() !== DELETE_ALL_CONFIRM_PHRASE) {
			// Typed-confirm gate: the destructive action stays unavailable until
			// the phrase matches exactly; a failed confirmation deletes nothing.
			setConfirmError(true);
			return;
		}
		closeDeleteDialog();
		setWiping(true);
		void (async () => {
			try {
				await deleteAllData();
				toast.success("All data deleted — re-scanning your library");
			} catch {
				toast.error("Couldn't delete all data");
			} finally {
				setWiping(false);
			}
		})();
	}, [closeDeleteDialog, confirmText]);

	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={styles.content}
			contentInsetAdjustmentBehavior="automatic"
			testID="settings-screen"
		>
			<ListSection title="Appearance">
				<View style={styles.segmentWrap}>
					<SegmentedControl
						options={THEME_OPTIONS}
						value={themeMode}
						onChange={setTheme}
						testID="settings-theme"
					/>
				</View>
			</ListSection>

			<ListSection title="Processing">
				<SwitchRow
					title="Battery saver"
					subtitle="Pause processing while the device is not charging"
					value={batterySaver}
					onValueChange={setBatterySaver}
					testID="settings-battery-saver"
				/>
				<SwitchRow
					title="Night processing"
					subtitle="Process only between 00:00 and 06:00"
					value={nightProcessing}
					onValueChange={setNightProcessing}
					testID="settings-night-processing"
				/>
				<ListItem
					title="Status"
					subtitle={statusText}
					leadingIcon="image-multiple-outline"
					testID="settings-pipeline-status"
				/>
				<ListItem
					title="Re-run analysis"
					subtitle="Re-scan the library and refresh outdated results"
					leadingIcon="refresh"
					onPress={handleRerunAnalysis}
					testID="settings-rerun-analysis"
				/>
			</ListSection>

			<AiModelSection freeDisk={freeDisk} />

			<ListSection title="Data Management">
				<ListItem
					title={clearingCache ? "Clearing cache…" : "Clear cache"}
					subtitle="Remove cached image and thumbnail data"
					leadingIcon="broom"
					onPress={handleClearCache}
					testID="settings-clear-cache"
				/>
				<ListItem
					title={wiping ? "Deleting all data…" : "Delete all data"}
					subtitle="Remove analyzed data and re-scan. Photos and settings are kept"
					leadingIcon="delete-forever"
					destructive
					onPress={openDeleteDialog}
					testID="settings-delete-all"
				/>
			</ListSection>

			<ListSection
				title="About"
				footer="All processing happens on this device. Your photos and personal data never leave it."
			>
				<ListItem
					title="Version"
					leadingIcon="information-outline"
					trailing={
						<Text variant="subhead" color="textSecondary">
							{appVersion}
						</Text>
					}
					testID="settings-version"
				/>
			</ListSection>

			<Dialog
				visible={deleteVisible}
				title="Delete all data"
				message={`This deletes all analyzed data — media records, labels, text, embeddings, and search indexes. Your photos, settings, and the AI model stay. Type ${DELETE_ALL_CONFIRM_PHRASE} to confirm.`}
				confirmLabel="Delete"
				destructive
				onConfirm={handleConfirmDeleteAll}
				onCancel={closeDeleteDialog}
			>
				<TextInput
					value={confirmText}
					onChangeText={(text) => {
						setConfirmText(text);
						setConfirmError(false);
					}}
					placeholder={DELETE_ALL_CONFIRM_PHRASE}
					placeholderTextColor={theme.colors.textTertiary}
					autoCapitalize="characters"
					autoCorrect={false}
					style={styles.confirmInput}
					accessibilityLabel={`Type ${DELETE_ALL_CONFIRM_PHRASE} to confirm deletion`}
					testID="settings-delete-confirm-input"
				/>
				{confirmError ? (
					<Text variant="footnote" color="danger">
						{`Type ${DELETE_ALL_CONFIRM_PHRASE} exactly to confirm.`}
					</Text>
				) : null}
			</Dialog>
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	screen: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	content: {
		padding: theme.spacing.lg,
		paddingBottom: rt.insets.bottom + theme.spacing.xxl,
	},
	segmentWrap: {
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
	},
	confirmInput: {
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		borderRadius: theme.radii.md,
		paddingHorizontal: theme.spacing.md,
		paddingVertical: theme.spacing.sm,
		color: theme.colors.textPrimary,
		backgroundColor: theme.colors.surface,
		...theme.typography.body,
	},
}));
