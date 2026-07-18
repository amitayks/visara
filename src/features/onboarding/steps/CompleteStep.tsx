/**
 * Completion step — celebratory success hero. The primary "Get started"
 * control lives in the screen footer and calls completeOnboarding().
 */

import { StepScaffold } from "../StepScaffold";

export function CompleteStep({ isActive }: { isActive: boolean }) {
	return (
		<StepScaffold
			icon="check"
			tint="success"
			title="You're all set"
			description="Visara will organize your photos privately, right on this device. Tap Get started to open your gallery."
			isActive={isActive}
		/>
	);
}
