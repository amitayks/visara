import { BorderRadius } from "@theme/colors";
import { useTheme } from "@theme/useTheme";
import { memo, useState, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import FastImage from "react-native-fast-image";
import { ThumbnailService, type ThumbnailSize } from "@services/media/ThumbnailService";

interface ThumbnailProps {
	uri?: string;
	size?: number;
	aspectRatio?: number;
	showLoader?: boolean;
	onPress?: () => void;
	testID?: string;
}

/**
 * Thumbnail - High-frequency component (10k+ instances in PhotoGrid)
 * Optimized with React.memo to prevent unnecessary re-renders
 * Uses ThumbnailService for 3-tier caching (memory/disk/on-demand)
 */
export const Thumbnail = memo(function Thumbnail({
	uri,
	size = 100,
	aspectRatio = 1,
	showLoader = true,
	testID,
}: ThumbnailProps) {
	const { colors } = useTheme();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [thumbnailUri, setThumbnailUri] = useState<string | undefined>(undefined);

	// Load thumbnail from ThumbnailService (3-tier cache)
	useEffect(() => {
		if (!uri) {
			setThumbnailUri(undefined);
			setLoading(false);
			return;
		}

		let isCancelled = false;
		setLoading(true);

		// Determine thumbnail size based on component size
		let thumbnailSize: ThumbnailSize = "medium";
		if (size <= 200) thumbnailSize = "small";
		else if (size >= 600) thumbnailSize = "large";

		ThumbnailService.getThumbnail(uri, thumbnailSize)
			.then((thumbUri) => {
				if (!isCancelled) {
					setThumbnailUri(thumbUri);
				}
			})
			.catch((err) => {
				console.warn("Failed to load thumbnail:", err);
				if (!isCancelled) {
					// Fallback to original URI if thumbnail generation fails
					setThumbnailUri(uri);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, [uri, size]);

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
			{thumbnailUri && !error ? (
				<FastImage
					source={{ uri: thumbnailUri, priority: FastImage.priority.normal }}
					style={styles.image}
					resizeMode={FastImage.resizeMode.cover}
					onLoadStart={handleLoadStart}
					onLoadEnd={handleLoadEnd}
					onError={handleError}
				/>
			) : (
				<View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
					{/* Placeholder for no image or error state */}
				</View>
			)}

			{loading && showLoader && (
				<View style={styles.loaderContainer}>
					<ActivityIndicator size="small" color={colors.accent} />
				</View>
			)}
		</View>
	);
});

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
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.1)",
	},
});
