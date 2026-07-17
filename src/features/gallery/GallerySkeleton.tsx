/**
 * Loading placeholder for the gallery grid — shown before the first database
 * emission and while a search request is in flight (search-experience spec:
 * "searching" renders a skeleton, never a blank grid).
 */

import { Skeleton } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import { View } from "react-native";

const ROWS = [0, 1, 2, 3] as const;
const COLUMNS = [0, 1, 2] as const;

export function GallerySkeleton() {
	return (
		<View
			style={styles.container}
			accessible
			accessibilityLabel="Loading photos"
			testID="gallery-skeleton"
		>
			{ROWS.map((row) => (
				<View key={row} style={styles.row}>
					{COLUMNS.map((column) => (
						<View key={column} style={styles.tile}>
							<Skeleton width="100%" height="100%" radius={0} />
						</View>
					))}
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	container: {
		flex: 1,
		paddingTop: rt.insets.top + theme.spacing.xs,
	},
	row: {
		flexDirection: "row",
	},
	tile: {
		flex: 1,
		aspectRatio: 1,
		padding: theme.spacing.xxs / 2,
	},
}));
