import { Thumbnail } from "@components/atoms/Thumbnail";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";

interface AlbumCardProps {
	coverImageUri?: string;
	name: string;
	itemCount: number;
	onPress: () => void;
	onLongPress?: () => void;
	style?: ViewStyle;
	testID?: string;
}

export function AlbumCard({
	coverImageUri,
	name,
	itemCount,
	onPress,
	onLongPress,
	style,
	testID,
}: AlbumCardProps) {
	const { colors, shadows } = useTheme();

	return (
		<Pressable
			style={[
				styles.container,
				{
					backgroundColor: colors.surface,
				},
				shadows.md,
				style,
			]}
			onPress={onPress}
			onLongPress={onLongPress}
			testID={testID}
		>
			{/* Cover Image */}
			<Thumbnail uri={coverImageUri} size={120} aspectRatio={1} />

			{/* Album Info */}
			<View style={styles.info}>
				<Text
					style={[
						styles.name,
						{
							color: colors.text,
						},
					]}
					numberOfLines={1}
				>
					{name}
				</Text>
				<Text
					style={[
						styles.count,
						{
							color: colors.textSecondary,
						},
					]}
				>
					{itemCount} {itemCount === 1 ? "item" : "items"}
				</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		borderRadius: BorderRadius.lg,
		padding: Spacing.sm,
		width: 140,
	},
	info: {
		marginTop: Spacing.sm,
		gap: Spacing.xs / 2,
	},
	name: {
		fontSize: Typography.fontSize.md,
		fontWeight: Typography.fontWeight.semibold,
	},
	count: {
		fontSize: Typography.fontSize.sm,
	},
});
