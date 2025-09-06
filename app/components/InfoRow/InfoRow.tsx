import { Text, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { createStyles } from "./InfoRow.style";
import { useIconColors } from "../../../utils/iconColors";

interface InfoRowProps {
	icon: string;
	label: string;
	value?: string | null;
}

export const InfoRow: React.FC<InfoRowProps> = ({ icon, label, value }) => {
	const iconColors = useIconColors();
	const styles = createStyles(iconColors);

	if (!value) return null;
	return (
		<View style={styles.infoRow}>
			<Icon
				name={icon}
				size={20}
				color={iconColors.secondary}
				style={styles.infoIcon}
			/>
			<View style={styles.infoContent}>
				<Text style={styles.infoLabel}>{label}</Text>
				<Text style={styles.infoValue}>{value}</Text>
			</View>
		</View>
	);
};
