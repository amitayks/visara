import { Text, View } from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { ScanFrequency } from "../ScanFrequencyPicker";
import { ScanFrequencyOption } from "../ScanFrequencyPicker/ScanFrequencyPicker";
import { createStyles } from "./OptionButton.style";

interface OptionButtonProps {
	option: ScanFrequencyOption;
	value: ScanFrequency;
	handleSelect: (value: ScanFrequency) => void;
}
export function OptionButton({
	option,
	value,
	handleSelect,
}: OptionButtonProps) {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);

	return (
		<TouchableOpacity
			key={option.value}
			style={[
				styles.optionButton,
				value === option.value && styles.selectedOption,
			]}
			onPress={() => handleSelect(option.value)}
			activeOpacity={0.7}
		>
			<View style={styles.optionContent}>
				<View style={styles.optionLeft}>
					<View style={styles.optionIconContainer}>
						<Icon name={option.icon} size={24} color={theme.primary} />
					</View>
					<View style={styles.optionTextContainer}>
						<View style={styles.optionTitleRow}>
							<View style={[styles.optionBadge, { alignSelf: "flex-start" }]}>
								<Text style={[styles.optionBadgeText]}>{option.badge}</Text>
							</View>
							<Text style={styles.optionTitle}>{option.label}</Text>
						</View>
					</View>
				</View>
				{value === option.value && (
					<View style={styles.checkmarkContainer}>
						<Icon name="checkmark-circle" size={24} color="#FFFFFF" />
					</View>
				)}
			</View>
		</TouchableOpacity>
	);
}
