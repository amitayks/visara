/**
 * Privacy step. Copy contract (BINDING, onboarding-experience spec): the
 * model downloads once over Wi-Fi and analysis then runs fully offline;
 * photos and personal data never leave the device; no copy claims AI
 * analysis never uses the internet.
 */

import { StepScaffold } from "../StepScaffold";
import { InfoRow, RowCard } from "./rows";

export function PrivacyStep({ isActive }: { isActive: boolean }) {
	return (
		<StepScaffold
			icon="shield-lock"
			title="Privacy first"
			description="Your photos and personal data never leave your device."
			isActive={isActive}
		>
			<RowCard>
				<InfoRow
					icon="memory"
					title="On-device analysis"
					note="The AI model downloads once over Wi-Fi; after that, every analysis runs fully offline."
				/>
				<InfoRow
					icon="lock-outline"
					title="Encrypted storage"
					note="Everything the AI learns is stored with device-level encryption."
				/>
				<InfoRow
					icon="eye-off-outline"
					title="No tracking"
					note="No analytics, no accounts, no data collection."
				/>
			</RowCard>
		</StepScaffold>
	);
}
