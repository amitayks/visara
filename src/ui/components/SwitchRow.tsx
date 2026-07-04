/**
 * SwitchRow primitive — a full-width toggle row. The whole row is ONE
 * accessibility element with role "switch" announcing its on/off state.
 */

import { StyleSheet, useAppTheme } from "@ui/theme";
import { Pressable, Switch, View } from "react-native";
import { Text } from "./Text";

export interface SwitchRowProps {
	title: string;
	subtitle?: string;
	value: boolean;
	onValueChange: (value: boolean) => void;
	disabled?: boolean;
	testID?: string;
}

export function SwitchRow({
	title,
	subtitle,
	value,
	onValueChange,
	disabled = false,
	testID,
}: SwitchRowProps) {
	const { theme } = useAppTheme();

	return (
		<Pressable
			onPress={() => onValueChange(!value)}
			disabled={disabled}
			style={styles.row}
			accessibilityRole="switch"
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			accessibilityState={{ checked: value, disabled }}
			testID={testID}
		>
			<View style={styles.texts}>
				<Text
					variant="body"
					color={disabled ? "textTertiary" : "textPrimary"}
					numberOfLines={1}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="footnote" color="textSecondary" numberOfLines={2}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<Switch
				value={value}
				onValueChange={onValueChange}
				disabled={disabled}
				trackColor={{
					false: theme.colors.border,
					true: theme.colors.accent,
				}}
				ios_backgroundColor={theme.colors.border}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			/>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
		minHeight: theme.spacing.huge,
	},
	texts: {
		flex: 1,
		gap: theme.spacing.xxs,
	},
}));
