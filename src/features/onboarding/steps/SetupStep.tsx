/**
 * Setup finale — one tap runs the whole first-run sequence (photo access,
 * Android notifications, model download auto-start) as a live checklist,
 * then onboarding completes on its own. The sequence itself lives in
 * useSetupSequence (owned by OnboardingScreen so the footer CTA can drive
 * it); this step renders its state. A denied photo permission shows the
 * recovery actions here (retry + open system settings) while the footer
 * offers continue-anyway.
 */

import { Button } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { View } from "react-native";
import { StepScaffold } from "../StepScaffold";
import type { SetupSequence, SetupTaskId } from "../useSetupSequence";
import { RowCard, TaskRow } from "./rows";

const TASK_PRESENTATION: Record<SetupTaskId, { icon: string; title: string }> =
	{
		photos: { icon: "image-multiple-outline", title: "Photo access" },
		notifications: { icon: "bell-outline", title: "Notifications" },
		model: { icon: "creation", title: "On-device AI model" },
	};

export function SetupStep({
	isActive,
	setup,
}: {
	isActive: boolean;
	setup: SetupSequence;
}) {
	return (
		<StepScaffold
			icon="rocket-launch"
			title="One tap to set up"
			description="Visara asks for what it needs, schedules the one-time AI model download, and takes you straight to your gallery."
			isActive={isActive}
		>
			<RowCard>
				{setup.tasks.map((task) => (
					<TaskRow
						key={task.id}
						icon={TASK_PRESENTATION[task.id].icon}
						title={TASK_PRESENTATION[task.id].title}
						note={task.note}
						status={task.status}
					/>
				))}
			</RowCard>

			{setup.phase === "blocked" ? (
				<View style={styles.recovery}>
					<Button
						title="Try again"
						onPress={setup.run}
						testID="onboarding-setup-retry"
					/>
					<Button
						title="Open settings"
						variant="secondary"
						onPress={setup.openSettings}
						testID="onboarding-setup-settings"
					/>
				</View>
			) : null}
		</StepScaffold>
	);
}

const styles = StyleSheet.create((theme) => ({
	recovery: {
		marginTop: theme.spacing.md,
		gap: theme.spacing.md,
	},
}));
