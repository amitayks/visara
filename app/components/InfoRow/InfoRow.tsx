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

export const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value, onPress }) => {
	const iconColors = useIconColors();
	const styles = createStyles(iconColors);

	if (!value) return null;

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
				<Text style={styles.infoLabel}>{label}</Text>
				<Text style={styles.infoValue}>{value}</Text>
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
