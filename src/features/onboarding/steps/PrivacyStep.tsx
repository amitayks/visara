/**
 * Privacy step. Copy contract (BINDING, onboarding-experience spec): the
 * model downloads once over Wi-Fi and analysis then runs fully offline;
 * photos and personal data never leave the device; no copy claims AI
 * analysis never uses the internet.
 */

import { StepScaffold } from "../StepScaffold";
import { FeatureRow, RowCard } from "./rows";

export function PrivacyStep({ isActive }: { isActive: boolean }) {
	return (
		<StepScaffold
			icon="shield-lock"
			title="Private by design"
			description="Your photos and personal data never leave your device."
			isActive={isActive}
		>
			<RowCard>
				<FeatureRow
					icon="wifi"
					title="One download, then offline"
					note="The AI model downloads once over Wi-Fi — analysis then runs fully offline."
				/>
				<FeatureRow
					icon="lock-outline"
					title="Encrypted storage"
					note="Everything the AI learns is stored with device-level encryption."
				/>
				<FeatureRow
					icon="eye-off-outline"
					title="No tracking"
					note="No analytics, no accounts, no data collection."
				/>
			</RowCard>
		</StepScaffold>
	);
}
