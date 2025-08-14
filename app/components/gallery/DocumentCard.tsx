import React, { memo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	ViewStyle,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { Document } from "./DocumentGrid";
import { createStyles } from "./DocumentCard.style";

interface DocumentCardProps {
	document: Document;
	onPress: () => void;
	style?: ViewStyle;
	width: number;
	height?: number;
}

export const DocumentCard = memo(
	({ document, onPress, style, width, height }: DocumentCardProps) => {
		const { theme, isDark } = useTheme();
		const iconColors = useIconColors();
		const styles = useThemedStyles(createStyles);
		const [imageLoading, setImageLoading] = useState(true);
		const [imageError, setImageError] = useState(false);
		const [imageHeight, setImageHeight] = useState(height || width * 1.4);

		const getDocumentIcon = (type?: string) => {
			switch (type?.toLowerCase()) {
				case "receipt":
					return "receipt-outline";
				case "invoice":
					return "document-text-outline";
				case "id":
					return "card-outline";
				case "form":
					return "clipboard-outline";
				default:
					return "document-outline";
			}
		};

		return (
			<TouchableOpacity
				activeOpacity={0.9}
				onPress={onPress}
				style={[styles.container, { width }, style]}
			>
				<View style={styles.imageContainer}>
					{imageError ? (
						<View style={styles.errorContainer}>
							<Icon
								name="image-outline"
								size={32}
								color={iconColors.tertiary}
							/>
						</View>
					) : (
						<>
							<Image
								source={{ uri: document.imageUri }}
								style={[styles.image, { width: width, height: imageHeight }]}
								onLoad={(event) => {
									setImageLoading(false);
									// If height is provided from parent, use it; otherwise calculate from image dimensions
									if (!height && event.nativeEvent.source) {
										const { width: imgWidth, height: imgHeight } =
											event.nativeEvent.source;
										const aspectRatio = imgHeight / imgWidth;
										const calculatedHeight = width * aspectRatio;
										// Limit height to reasonable bounds
										const minHeight = width * 0.8;
										const maxHeight = width * 2.5;
										setImageHeight(
											Math.min(
												Math.max(calculatedHeight, minHeight),
												maxHeight,
											),
										);
									}
								}}
								onError={() => {
									setImageLoading(false);
									setImageError(true);
								}}
								resizeMode="cover"
							/>
							{imageLoading && (
								<View style={styles.loadingContainer}>
									<ActivityIndicator size="small" color={theme.accent} />
								</View>
							)}
						</>
					)}

					{document.documentType && (
						<View style={styles.typeBadge}>
							<Icon
								name={getDocumentIcon(document.documentType)}
								size={12}
								color="#FFF"
							/>
							<Text style={styles.typeText}>{document.documentType}</Text>
						</View>
					)}
				</View>
			</TouchableOpacity>
		);
	},
);
