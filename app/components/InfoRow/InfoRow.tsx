// app/components/InfoRow/InfoRow.tsx
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { createStyles } from "./InfoRow.style";
import { useTheme } from "../../../contexts/ThemeContext";

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
	const { theme } = useTheme();
	const styles = createStyles(theme);

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
		<View style={styles.infoBlock}>
			{icon && (
				<Icon
					name={icon}
					size={18}
					color={theme.primary}
					style={styles.infoIcon}
				/>
			)}
			<View style={styles.infoContent}>
				<Text style={styles.infoLabel}>{String(label)}</Text>
				<Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">
					{safeValue.split(" ").slice(0, 4).join(" ")}
				</Text>
			</View>
			{onPress && (
				<View style={styles.copyIndicator}>
					<Icon name="copy-outline" size={14} color={theme.secondary} />
				</View>
			)}
		</View>
	);

	if (onPress) {
		return (
			<TouchableOpacity
				onPress={onPress}
				activeOpacity={0.8}
				style={styles.touchableWrapper}
			>
				{content}
			</TouchableOpacity>
		);
	}

	return <View style={styles.touchableWrapper}>{content}</View>;
};
