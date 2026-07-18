/**
 * OnboardingScreen — ordered step flow (onboarding-experience spec):
 * welcome → privacy → permissions → model → complete on a horizontal pager
 * (pager-view) with animated progress dots and a per-step primary control.
 * Steps receive `isActive` so their reveal animation plays on entry — via
 * Next and swipes alike.
 *
 * Skip renders top-right on every non-final step and jumps straight to the
 * final completion step. Skip never completes onboarding, never requests a
 * permission, and never starts a model download — it is a pure jump.
 *
 * The final step's primary action calls settingsStore.completeOnboarding();
 * the root navigator gate then swaps to the Shell automatically and the
 * bootstrap boot sequence takes over (services-ui-facade contract).
 */

import { useSettingsStore } from "@state/settingsStore";
import { Button } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import PagerView, {
	type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import { ProgressDots } from "./ProgressDots";
import {
	CompleteStep,
	ModelStep,
	PermissionsStep,
	PrivacyStep,
	WelcomeStep,
} from "./steps";

const STEP_IDS = [
	"welcome",
	"privacy",
	"permissions",
	"model",
	"complete",
] as const;
const LAST_STEP = STEP_IDS.length - 1;

export function OnboardingScreen() {
	const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
	const pagerRef = useRef<PagerView>(null);
	const [stepIndex, setStepIndex] = useState(0);
	const isLastStep = stepIndex === LAST_STEP;

	const handlePageSelected = useCallback(
		(event: PagerViewOnPageSelectedEvent) => {
			setStepIndex(event.nativeEvent.position);
		},
		[],
	);

	const goToStep = useCallback((index: number) => {
		pagerRef.current?.setPage(index);
	}, []);

	/**
	 * Jump-only navigation to the completion step. Used by Skip (spec: no
	 * completion, no permission request, no download) and by the model step's
	 * "Download later" (the step after model IS the completion step).
	 */
	const jumpToCompletion = useCallback(() => {
		goToStep(LAST_STEP);
	}, [goToStep]);

	const handleNext = useCallback(() => {
		if (stepIndex === LAST_STEP) {
			completeOnboarding();
			return;
		}
		goToStep(stepIndex + 1);
	}, [stepIndex, completeOnboarding, goToStep]);

	return (
		<View style={styles.root} testID="onboarding-screen">
			<View style={styles.topBar}>
				{isLastStep ? null : (
					<Button
						title="Skip"
						variant="ghost"
						onPress={jumpToCompletion}
						testID="onboarding-skip"
					/>
				)}
			</View>

			<PagerView
				ref={pagerRef}
				style={styles.pager}
				initialPage={0}
				onPageSelected={handlePageSelected}
			>
				<View key="welcome" style={styles.page} collapsable={false}>
					<WelcomeStep isActive={stepIndex === 0} />
				</View>
				<View key="privacy" style={styles.page} collapsable={false}>
					<PrivacyStep isActive={stepIndex === 1} />
				</View>
				<View key="permissions" style={styles.page} collapsable={false}>
					<PermissionsStep isActive={stepIndex === 2} />
				</View>
				<View key="model" style={styles.page} collapsable={false}>
					<ModelStep isActive={stepIndex === 3} onAdvance={jumpToCompletion} />
				</View>
				<View key="complete" style={styles.page} collapsable={false}>
					<CompleteStep isActive={stepIndex === LAST_STEP} />
				</View>
			</PagerView>

			<View style={styles.footer}>
				<ProgressDots steps={STEP_IDS} index={stepIndex} />
				<Button
					title={isLastStep ? "Get started" : "Next"}
					onPress={handleNext}
					testID="onboarding-next"
				/>
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
