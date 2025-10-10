import { Button } from "@components/atoms/Button";
import { Icon } from "@components/atoms/Icon";
import { BorderRadius, Spacing } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { StyleSheet, View, type ViewStyle } from "react-native";

interface NavButton {
	icon: string;
	label: string;
	onPress: () => void;
	active?: boolean;
}

interface BottomNavContainerProps {
	buttons: NavButton[];
	style?: ViewStyle;
	testID?: string;
}

export function BottomNavContainer({
	buttons,
	style,
	testID,
}: BottomNavContainerProps) {
	const { colors, shadows } = useTheme();

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: colors.navigationBackground,
					borderTopColor: colors.navigationBorder,
				},
				shadows.lg,
				style,
			]}
			testID={testID}
		>
			{buttons.map((button, index) => (
				<Button
					key={`${button.label}-${index}`}
					variant="icon"
					onPress={button.onPress}
					icon={
						<Icon
							name={button.icon}
							size="medium"
							color={
								button.active ? colors.navigationActive : colors.navigationInactive
							}
						/>
					}
					style={styles.button}
					testID={`${testID}-${button.label.toLowerCase()}`}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		bottom: Spacing.sm + Spacing.xs / 2, // 10px
		left: Spacing.md,
		right: Spacing.md,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingVertical: Spacing.sm,
		paddingHorizontal: Spacing.md,
		borderTopWidth: 1,
		borderRadius: BorderRadius.xl,
	},
	button: {
		flex: 1,
	},
});
