import { Switch, Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme } from "../../../contexts/ThemeContext";
import { styles } from "./ToggleBar.style";

interface ToggleBarProps {
	onPress: () => void;
	isChange: boolean;
	iconsName: string[];
	title: string[];
	subtitle: string[];
}

export const ToggleBar = ({
	onPress,
	isChange,
	iconsName,
	title,
	subtitle,
}: ToggleBarProps) => {
	const { theme } = useTheme();

	return (
		<View style={[styles.container, { backgroundColor: theme.surface }]}>
			<TouchableOpacity
				style={styles.row}
				onPress={onPress}
				activeOpacity={0.7}
			>
				<View
					style={[
						styles.iconContainer,
						{ backgroundColor: theme.accent + "20" },
					]}
				>
					<Icon
						name={isChange ? iconsName[0] : iconsName[1]}
						size={20}
						color={theme.accent}
					/>
				</View>
				<View style={styles.textContainer}>
					<Text style={[styles.title, { color: theme.text }]}>
						{isChange ? title[0] : title[1]}
					</Text>
					<Text style={[styles.subtitle, { color: theme.textSecondary }]}>
						{isChange ? subtitle[0] : subtitle[1]}
					</Text>
				</View>

				<Switch
					value={isChange}
					onValueChange={onPress}
					trackColor={{ false: theme.borderLight, true: theme.accent + "40" }}
					thumbColor={isChange ? theme.accent : theme.surface}
					ios_backgroundColor={theme.borderLight}
				></Switch>
			</TouchableOpacity>
		</View>
	);
};
