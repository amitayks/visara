import { BorderRadius } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

interface ThumbnailProps {
	uri?: string;
	size?: number;
	aspectRatio?: number;
	showLoader?: boolean;
	onPress?: () => void;
	testID?: string;
}

export function Thumbnail({
	uri,
	size = 100,
	aspectRatio = 1,
	showLoader = true,
	testID,
}: ThumbnailProps) {
	const { colors } = useTheme();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	// FlashList recycles this component across different media; reset per-uri
	// so a recycled cell doesn't inherit a stale loading/error state.
	useEffect(() => {
		setLoading(true);
		setError(false);
	}, [uri]);

	const handleLoadStart = () => {
		setLoading(true);
		setError(false);
	};

	const handleLoadEnd = () => {
		setLoading(false);
	};

	const handleError = () => {
		setLoading(false);
		setError(true);
	};

	const containerStyle = {
		width: size,
		aspectRatio,
		backgroundColor: colors.thumbnailPlaceholder,
	};

	return (
		<View style={[styles.container, containerStyle]} testID={testID}>
			{uri && !error ? (
				<Image
					source={{ uri }}
					style={styles.image}
					contentFit="cover"
					recyclingKey={uri}
					onLoadStart={handleLoadStart}
					onLoadEnd={handleLoadEnd}
					onError={handleError}
				/>
			) : (
				<View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
					{/* Placeholder for no image or error state */}
				</View>
			)}

			{uri && !error && loading && showLoader && (
				<View style={styles.loaderContainer}>
					<ActivityIndicator size="small" color={colors.accent} />
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		overflow: "hidden",
		borderRadius: BorderRadius.sm,
		position: "relative",
	},
	image: {
		width: "100%",
		height: "100%",
	},
	placeholder: {
		width: "100%",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
	},
	loaderContainer: {
		...StyleSheet.absoluteFill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.1)",
	},
});
