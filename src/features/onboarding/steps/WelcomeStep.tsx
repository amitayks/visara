/**
 * Welcome step. Copy contract (BINDING, onboarding-experience spec): states
 * the one-time Wi-Fi model download with fully-offline analysis after it,
 * and that photos and personal data never leave the device.
 */

import { StepScaffold } from "../StepScaffold";
import { InfoRow, RowCard } from "./rows";

export function WelcomeStep({ isActive }: { isActive: boolean }) {
	return (
		<StepScaffold
			icon="image-multiple"
			title="Welcome to Visara"
			description="Your photos, organized and searchable — privately, on this device."
			isActive={isActive}
		>
			<RowCard>
				<InfoRow
					icon="magnify"
					title="Search naturally"
					note="Type what you remember — “dog on the beach” — and find it."
				/>
				<InfoRow
					icon="auto-fix"
					title="Organizes itself"
					note="Smart albums build themselves as your photos are analyzed."
				/>
				<InfoRow
					icon="wifi"
					title="One-time model download"
					note="The optional AI model downloads once over Wi-Fi — analysis then runs fully offline."
				/>
				<InfoRow
					icon="shield-check"
					title="Private by design"
					note="Your photos and personal data never leave your device."
				/>
			</RowCard>
		</StepScaffold>
	);
}
