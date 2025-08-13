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

		const formatDate = (date?: Date) => {
			if (!date) return "";
			const d = new Date(date);
			return d.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: "numeric",
			});
		};

		const formatAmount = (amount?: number) => {
			if (!amount) return null;
			return `$${amount.toFixed(2)}`;
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
							<Icon name="image-outline" size={32} color={iconColors.tertiary} />
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

				{/* <View style={styles.info}>
        {document.vendor && (
          <Text style={styles.vendor} numberOfLines={1}>
            {document.vendor}
          </Text>
        )}
        
        <View style={styles.metaRow}>
          {document.date && (
            <Text style={styles.date}>
              {formatDate(document.date)}
            </Text>
          )}
          {document.totalAmount && (
            <Text style={styles.amount}>
              {formatAmount(document.totalAmount)}
            </Text>
          )}
        </View>
      </View> */}
			</TouchableOpacity>
		);
	},
);

const createStyles = (theme: any) => StyleSheet.create({
	container: {
		backgroundColor: theme.surface,
		borderRadius: 12,
		overflow: "hidden",
		shadowColor: theme.shadow,
		shadowOffset: {
			width: 0,
			height: 2,
		},
		shadowOpacity: 0.1,
		shadowRadius: 3.84,
		elevation: 10,
	},
	imageContainer: {
		position: "relative",
		backgroundColor: theme.surfaceSecondary,
	},
	image: {
		backgroundColor: theme.surfaceSecondary,
	},
	loadingContainer: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: theme.surfaceSecondary,
		alignItems: "center",
		justifyContent: "center",
	},
	errorContainer: {
		height: 200,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.surfaceSecondary,
	},
	typeBadge: {
		position: "absolute",
		top: 8,
		left: 8,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
	},
	typeText: {
		color: "#FFF",
		fontSize: 11,
		fontWeight: "600",
		marginLeft: 4,
		textTransform: "capitalize",
	},
	info: {
		padding: 12,
	},
	// vendor: {
	//   fontSize: 14,
	//   fontWeight: '600',
	//   color: '#333',
	//   marginBottom: 4,
	// },
	// metaRow: {
	//   flexDirection: 'row',
	//   justifyContent: 'space-between',
	//   alignItems: 'center',
	// },
	// date: {
	//   fontSize: 12,
	//   color: '#999',
	// },
	// amount: {
	//   fontSize: 14,
	//   fontWeight: '600',
	//   color: '#6366F1',
	// },
});
