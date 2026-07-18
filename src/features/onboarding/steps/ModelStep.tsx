/**
 * Optional on-device model step (onboarding-model-step spec): explains the
 * one-time, Wi-Fi-and-charging-gated download and offers start-or-defer.
 * "Download now" opts in and starts delivery FIRE-AND-FORGET — onboarding
 * never awaits or blocks on the multi-gigabyte download; failures surface
 * as toasts.
 */

import { GemmaModelDeliveryService } from "@backend/facade";
import { Button, toast } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { StepScaffold } from "../StepScaffold";
import { InfoRow, RowCard } from "./rows";

export function ModelStep({
	isActive,
	onAdvance,
}: {
	isActive: boolean;
	onAdvance: () => void;
}) {
	const [phase, setPhase] = useState<"choice" | "requested">("choice");

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
		<StepScaffold
			icon="creation"
			title="On-device AI"
			description="For analysis and semantic search, Visara can download the optional Gemma model set (a few gigabytes) — a one-time download that only runs over Wi-Fi while charging. After that, analysis runs fully offline and your photos never leave your device. The app works without it, and you can manage it anytime in Settings."
			isActive={isActive}
		>
			{phase === "requested" ? (
				<RowCard>
					<InfoRow
						tint="success"
						icon="check-circle-outline"
						title="Download scheduled"
						note="It runs over Wi-Fi while charging. Pause or cancel anytime in Settings."
					/>
				</RowCard>
			) : (
				<View style={styles.stack}>
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
				</View>
			)}
		</StepScaffold>
	);
}

const styles = StyleSheet.create((theme) => ({
	stack: {
		gap: theme.spacing.md,
	},
}));
