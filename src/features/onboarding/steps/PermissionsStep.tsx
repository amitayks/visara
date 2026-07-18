/**
 * Permissions step — performs the REAL platform photo-permission request
 * (never assumes granted) and resolves it to an explicit granted / limited /
 * denied outcome. Denied is explained and recoverable (retry + open system
 * settings) and never blocks progression (onboarding-experience spec).
 */

import { requestMediaAccess } from "@backend/facade";
import { useSettingsStore } from "@state/settingsStore";
import { Button, toast } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { useCallback, useState } from "react";
import { Linking, View } from "react-native";
import { StepScaffold } from "../StepScaffold";
import { InfoRow, RowCard } from "./rows";

export function PermissionsStep({ isActive }: { isActive: boolean }) {
	const permissionState = useSettingsStore((s) => s.permissionState);
	const setPermissionState = useSettingsStore((s) => s.setPermissionState);
	const [requesting, setRequesting] = useState(false);

	/** Real platform request (never assumes granted); outcome drives the UI. */
	const requestAccess = useCallback(async () => {
		setRequesting(true);
		try {
			const outcome = await requestMediaAccess();
			setPermissionState(outcome);
		} catch (error) {
			console.warn("Onboarding permission request failed", error);
			toast.error("Permission request failed. Please try again.");
		} finally {
			setRequesting(false);
		}
	}, [setPermissionState]);

	const openSettings = useCallback(() => {
		Linking.openSettings().catch(() => {
			toast.error("Could not open system settings.");
		});
	}, []);

	return (
		<StepScaffold
			icon="folder-image"
			title="Photo access"
			description="Visara needs your photo library to discover and organize your photos. You can continue setup either way."
			isActive={isActive}
		>
			{permissionState === "granted" ? (
				<RowCard>
					<InfoRow
						tint="success"
						icon="check-circle-outline"
						title="Access granted"
						note="Visara can now discover and organize your photos."
					/>
				</RowCard>
			) : permissionState === "limited" ? (
				<RowCard>
					<InfoRow
						tint="warning"
						icon="image-multiple-outline"
						title="Limited access"
						note="Visara will organize the photos you selected. You can add more anytime from system settings."
					/>
				</RowCard>
			) : permissionState === "denied" ? (
				<View style={styles.stack}>
					<RowCard>
						<InfoRow
							tint="danger"
							icon="image-off-outline"
							title="Access denied"
							note="Without photo access, Visara can't discover or organize your photos. You can still finish setup and grant access later."
						/>
					</RowCard>
					<Button
						title="Try again"
						onPress={() => void requestAccess()}
						loading={requesting}
						testID="onboarding-permission-retry"
					/>
					<Button
						title="Open settings"
						variant="secondary"
						onPress={openSettings}
						testID="onboarding-permission-settings"
					/>
				</View>
			) : (
				<Button
					title="Allow photo access"
					icon="folder-image"
					onPress={() => void requestAccess()}
					loading={requesting}
					testID="onboarding-permission-request"
				/>
			)}
		</StepScaffold>
	);
}

const styles = StyleSheet.create((theme) => ({
	stack: {
		gap: theme.spacing.md,
	},
}));
