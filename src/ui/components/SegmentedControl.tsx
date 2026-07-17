/**
 * SegmentedControl primitive — exclusive choice among 2-4 options
 * (e.g. appearance light/dark/system). Announced as a radio group.
 */

import { StyleSheet } from "@ui/theme";
import { Pressable, View } from "react-native";
import { Text } from "./Text";

export interface SegmentedControlOption<T extends string> {
	label: string;
	value: T;
}

export interface SegmentedControlProps<T extends string> {
	options: readonly SegmentedControlOption<T>[];
	value: T;
	onChange: (value: T) => void;
	testID?: string;
}

export function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
	testID,
}: SegmentedControlProps<T>) {
	return (
		<View style={styles.track} accessibilityRole="radiogroup" testID={testID}>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<Pressable
						key={option.value}
						onPress={() => onChange(option.value)}
						style={styles.segment(selected)}
						accessibilityRole="radio"
						accessibilityLabel={option.label}
						accessibilityState={{ checked: selected, selected }}
					>
						<Text
							variant="subhead"
							color={selected ? "textOnAccent" : "textSecondary"}
							numberOfLines={1}
						>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	track: {
		flexDirection: "row",
		backgroundColor: theme.colors.surfacePressed,
		borderRadius: theme.radii.md,
		padding: theme.spacing.xxs,
		gap: theme.spacing.xxs,
	},
	segment: (selected: boolean) => ({
		flex: 1,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		paddingVertical: theme.spacing.sm,
		paddingHorizontal: theme.spacing.md,
		borderRadius: theme.radii.sm,
		backgroundColor: selected ? theme.colors.accent : "transparent",
	}),
}));
