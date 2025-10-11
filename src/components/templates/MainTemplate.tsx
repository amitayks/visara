import { Icon } from "@components/atoms/Icon";
import { ProgressBar } from "@components/atoms/ProgressBar";
import { BottomNavContainer } from "@components/molecules/BottomNavContainer";
import { PhotoGrid } from "@components/organisms/PhotoGrid";
import type { MediaFile } from "@models/MediaFile";
import { BorderRadius, Spacing, Typography } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import {
	Image,
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type GridZoomLevel = 3 | 4 | 11;

interface MainTemplateProps {
	// Header
	logoSource?: number; // Require logo from local assets
	onPlusPress: () => void;

	// Progress bar
	isProcessing?: boolean;
	processingProgress?: number;
	processingCount?: string; // e.g., "42/150"

	// Photo grid
	mediaFiles: MediaFile[];
	gridColumns: GridZoomLevel;
	onMediaPress: (media: MediaFile, index: number) => void;
	onZoomChange?: (newColumns: GridZoomLevel) => void;

	// Bottom navigation
	activeNavButton?: "search" | "documents" | "albums" | "settings" | null;
	onSearchPress: () => void;
	onDocumentsPress: () => void;
	onAlbumsPress: () => void;
	onSettingsPress: () => void;

	style?: ViewStyle;
	testID?: string;
}

export function MainTemplate({
	logoSource,
	onPlusPress,
	isProcessing = false,
	processingProgress = 0,
	processingCount,
	mediaFiles,
	gridColumns,
	onMediaPress,
	onZoomChange,
	activeNavButton,
	onSearchPress,
	onDocumentsPress,
	onAlbumsPress,
	onSettingsPress,
	style,
	testID,
}: MainTemplateProps) {
	const { colors } = useTheme();

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]} testID={testID}>
			{/* Header */}
			<View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
				<View style={styles.headerLeft}>
					{logoSource ? (
						<Image source={logoSource} style={styles.logo} resizeMode="contain" />
					) : (
						<Text style={[styles.logoText, { color: colors.text }]}>Visara</Text>
					)}
				</View>

				<Pressable
					onPress={onPlusPress}
					style={styles.plusButton}
					hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
				>
					<Icon name="plus" size="medium" color={colors.text} />
				</Pressable>
			</View>

			{/* Progress Bar */}
			{isProcessing && (
				<View style={styles.progressContainer}>
					<ProgressBar progress={processingProgress} height={4} style={styles.progressBar} />
					{processingCount && (
						<Text style={[styles.progressText, { color: colors.textSecondary }]}>
							Processing {processingCount}
						</Text>
					)}
				</View>
			)}

			{/* Photo Grid */}
			<View style={styles.content}>
				<PhotoGrid
					mediaFiles={mediaFiles}
					columns={gridColumns}
					onMediaPress={onMediaPress}
					onZoomChange={onZoomChange}
					style={styles.photoGrid}
				/>
			</View>

			{/* Bottom Navigation */}
			<BottomNavContainer
				buttons={[
					{
						icon: "magnify",
						label: "Search",
						onPress: onSearchPress,
						active: activeNavButton === "search",
					},
					{
						icon: "file-document-outline",
						label: "Documents",
						onPress: onDocumentsPress,
						active: activeNavButton === "documents",
					},
					{
						icon: "folder-multiple-image",
						label: "Albums",
						onPress: onAlbumsPress,
						active: activeNavButton === "albums",
					},
					{
						icon: "cog-outline",
						label: "Settings",
						onPress: onSettingsPress,
						active: activeNavButton === "settings",
					},
				]}
				style={styles.bottomNav}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
		borderBottomWidth: 1,
	},
	headerLeft: {
		flex: 1,
	},
	logo: {
		width: 100,
		height: 32,
	},
	logoText: {
		fontSize: Typography.fontSize.xxl,
		fontWeight: Typography.fontWeight.bold,
	},
	plusButton: {
		padding: Spacing.xs,
		borderRadius: BorderRadius.full,
	},
	progressContainer: {
		paddingHorizontal: Spacing.md,
		paddingTop: Spacing.sm,
		paddingBottom: Spacing.xs,
	},
	progressBar: {
		marginBottom: Spacing.xs,
	},
	progressText: {
		fontSize: Typography.fontSize.sm,
		textAlign: "center",
	},
	content: {
		flex: 1,
	},
	photoGrid: {
		flex: 1,
	},
	bottomNav: {
		// BottomNavContainer already handles positioning 10px from bottom
	},
});
