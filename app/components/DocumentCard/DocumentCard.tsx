import React, { memo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	TouchableOpacity,
	View,
	ViewStyle,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { Document } from "../DocumentGrid";
import { ITEM_WIDTH } from "../DocumentGrid/documentGridConst";
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
								style={[
									styles.image,
									{ width: width, height: height || ITEM_WIDTH },
								]}
								onLoad={() => setImageLoading(false)}
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

					{/* {document.documentType && (
						<View style={styles.typeBadge}>
							<Icon
								name={getDocumentIcon(document.documentType)}
								size={12}
								color="#FFF"
							/>
							<Text style={styles.typeText}>{document.documentType}</Text>
						</View>
					)} */}
				</View>
			</TouchableOpacity>
		);
	},
);
