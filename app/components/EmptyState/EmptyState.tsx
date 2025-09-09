import { Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useThemedStyles } from "../../../contexts/ThemeContext";
import { useIconColors } from "../../../utils/iconColors";
import { createStyles } from "./EmptyState.style";

interface EmptyStateProps {
	icon?: string;
	title: string;
	message?: string;
	action?: {
		label: string;
		onPress: () => void;
	};
}

export const EmptyState: React.FC<EmptyStateProps> = ({
	icon = "folder-open-outline",
	title,
	message,
	action,
}) => {
	const iconColors = useIconColors();
	const styles = useThemedStyles(createStyles);

	return (
		<View style={styles.emptyContainer}>
			<View>
				<Icon name={icon} size={64} color={iconColors.tertiary} />
			</View>
			<Text style={styles.emptyTitle}>{title}</Text>
			{message && <Text style={styles.emptyMessage}>{message}</Text>}
			{action && (
				<TouchableOpacity
					style={styles.emptyAction}
					onPress={action.onPress}
					activeOpacity={0.7}
				>
					<Text style={styles.emptyActionText}>{action.label}</Text>
				</TouchableOpacity>
			)}
		</View>
	);
};
