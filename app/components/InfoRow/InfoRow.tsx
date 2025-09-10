// app/components/InfoRow/InfoRow.tsx
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { createStyles } from "./InfoRow.style";
import { useIconColors } from "../../../utils/iconColors";

interface InfoRowProps {
	icon?: string;
	label: string;
	value?: string | null;
	onPress?: () => void;
}

export const InfoRow: React.FC<InfoRowProps> = ({
	icon,
	label,
	value,
	onPress,
}) => {
	const iconColors = useIconColors();
	const styles = createStyles(iconColors);

	// CRITICAL: Early return if value is null, undefined, or empty string
	if (!value || value === "" || value === "N/A") {
		return null;
	}

	// CRITICAL: Ensure value is always a string
	const safeValue = String(value);

	// Validate that safeValue is actually a string
	if (typeof safeValue !== "string") {
		console.error("[InfoRow] Value is not a string after conversion:", value);
		return null;
	}

	const content = (
		<View style={styles.infoRow}>
			{icon && (
				<Icon
					name={icon}
					size={20}
					color={iconColors.secondary}
					style={styles.infoIcon}
				/>
			)}
			<View style={styles.infoContent}>
				<Text style={styles.infoLabel}>{String(label)}</Text>
				<Text style={styles.infoValue}>{safeValue}</Text>
			</View>
			{onPress && (
				<Icon
					name="copy-outline"
					size={16}
					color={iconColors.tertiary}
					style={styles.copyIcon}
				/>
			)}
		</View>
	);

	if (onPress) {
		return (
			<TouchableOpacity onPress={onPress} activeOpacity={0.7}>
				{content}
			</TouchableOpacity>
		);
	}

	return content;
};
