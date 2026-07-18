/**
 * Welcome step — the pitch. Copy contract (BINDING, onboarding-experience
 * spec): states that organization happens privately, on this device.
 */

import { StepScaffold } from "../StepScaffold";
import { FeatureRow, RowCard } from "./rows";

export function WelcomeStep({ isActive }: { isActive: boolean }) {
	return (
		<StepScaffold
			icon="image-multiple"
			title="Welcome to Visara"
			description="Your photos, organized and searchable — privately, on this device."
			isActive={isActive}
		>
			<RowCard>
				<FeatureRow
					icon="magnify"
					title="Search naturally"
					note="Type what you remember — “dog on the beach” — and find it."
				/>
				<FeatureRow
					icon="auto-fix"
					title="Organizes itself"
					note="Smart albums build themselves as your photos are analyzed."
				/>
			</RowCard>
		</StepScaffold>
	);
}
