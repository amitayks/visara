/**
 * OnboardingScreen — three-step flow (onboarding-experience spec):
 * welcome → privacy → setup finale on a horizontal pager over an ambient
 * animated backdrop, with progress dots and a phase-aware footer CTA.
 *
 * The finale's single CTA runs the whole first-run sequence (photo access,
 * Android notifications, model download auto-start) via useSetupSequence and
 * completes onboarding by itself; a denied photo permission pauses in a
 * recoverable blocked phase where the footer offers continue-anyway.
 *
 * Skip renders top-right on the story steps and jumps straight to the setup
 * step. Skip never completes onboarding, never requests a permission, and
 * never starts a model download — it is a pure jump.
 */

import { useSettingsStore } from "@state/settingsStore";
import { Button } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import PagerView, {
	type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { ProgressDots } from "./ProgressDots";
import { PrivacyStep, SetupStep, WelcomeStep } from "./steps";
import { useSetupSequence } from "./useSetupSequence";

const STEP_IDS = ["welcome", "privacy", "setup"] as const;
const LAST_STEP = STEP_IDS.length - 1;

export function OnboardingScreen() {
	const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
	const pagerRef = useRef<PagerView>(null);
	const [stepIndex, setStepIndex] = useState(0);
	const setup = useSetupSequence();
	const isSetupStep = stepIndex === LAST_STEP;
	const sequenceBusy = setup.phase === "running" || setup.phase === "finishing";

	const handlePageSelected = useCallback(
		(event: PagerViewOnPageSelectedEvent) => {
			setStepIndex(event.nativeEvent.position);
		},
		[],
	);

	const goToStep = useCallback((index: number) => {
		pagerRef.current?.setPage(index);
	}, []);

	/** Pure jump to the setup step (spec: Skip has no side effects). */
	const skipToSetup = useCallback(() => {
		goToStep(LAST_STEP);
	}, [goToStep]);

	const handleNext = useCallback(() => {
		goToStep(stepIndex + 1);
	}, [stepIndex, goToStep]);

	return (
		<View style={styles.root} testID="onboarding-screen">
			<AmbientBackdrop />

			<View style={styles.topBar}>
				{isSetupStep ? null : (
					<Button
						title="Skip"
						variant="ghost"
						onPress={skipToSetup}
						testID="onboarding-skip"
					/>
				)}
			</View>

			<PagerView
				ref={pagerRef}
				style={styles.pager}
				initialPage={0}
				scrollEnabled={!sequenceBusy}
				onPageSelected={handlePageSelected}
			>
				<View key="welcome" style={styles.page} collapsable={false}>
					<WelcomeStep isActive={stepIndex === 0} />
				</View>
				<View key="privacy" style={styles.page} collapsable={false}>
					<PrivacyStep isActive={stepIndex === 1} />
				</View>
				<View key="setup" style={styles.page} collapsable={false}>
					<SetupStep isActive={isSetupStep} setup={setup} />
				</View>
			</PagerView>

			<View style={styles.footer}>
				<ProgressDots steps={STEP_IDS} index={stepIndex} />
				{!isSetupStep ? (
					<Button
						title="Continue"
						onPress={handleNext}
						testID="onboarding-next"
					/>
				) : setup.phase === "blocked" ? (
					<Button
						title="Continue anyway"
						variant="secondary"
						onPress={completeOnboarding}
						testID="onboarding-next"
					/>
				) : (
					<Button
						title={
							setup.phase === "finishing"
								? "Opening your gallery"
								: setup.phase === "running"
									? "Setting up"
									: "Set up Visara"
						}
						loading={sequenceBusy}
						onPress={setup.run}
						testID="onboarding-next"
					/>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	root: {
		flex: 1,
		backgroundColor: theme.colors.background,
		paddingTop: rt.insets.top,
		paddingBottom: rt.insets.bottom + theme.spacing.lg,
	},
	topBar: {
		flexDirection: "row",
		justifyContent: "flex-end",
		paddingHorizontal: theme.spacing.lg,
		paddingTop: theme.spacing.sm,
		// Fixed-height row so pages don't reflow when Skip hides on the last step.
		minHeight: theme.spacing.huge + theme.spacing.sm,
	},
	pager: {
		flex: 1,
	},
	page: {
		flex: 1,
	},
	footer: {
		paddingHorizontal: theme.spacing.xxl,
		paddingTop: theme.spacing.lg,
		gap: theme.spacing.xl,
	},
}));
