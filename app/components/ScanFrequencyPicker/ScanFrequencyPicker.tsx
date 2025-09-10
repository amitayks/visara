import React, { useRef, useState } from "react";
import {
	Modal,
	Text,
	TouchableOpacity,
	View,
	ScrollView,
	TouchableOpacityBase,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ScanFrequencyPicker.styles";
import { SCAN_FREQUENCY_OPTIONS } from "./ScanFrequencyPickerConst";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import BottomSheet from "@gorhom/bottom-sheet";
import { OptionButton } from "../OptionButton";

export type ScanFrequency = "on_new_image" | "hourly" | "daily" | "weekly";

export interface ScanFrequencyOption {
	value: ScanFrequency;
	label: string;
	icon: string;
	badge?: string;
}

interface ScanFrequencyPickerProps {
	value: ScanFrequency;
	onValueChange: (value: ScanFrequency) => void;
	disabled?: boolean;
}

export function ScanFrequencyPicker({
	value,
	onValueChange,
	disabled = false,
}: ScanFrequencyPickerProps) {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const [isModalVisible, setIsModalVisible] = useState(false);
	const bottomSheetRef = useRef<BottomSheet>(null);
	const snapPoints = React.useMemo(() => ["60%"], []);

	const selectedOption = SCAN_FREQUENCY_OPTIONS.find(
		(option) => option.value === value,
	);

	const handleSelect = (selectedValue: ScanFrequency) => {
		onValueChange(selectedValue);
		setTimeout(() => {
			setIsModalVisible(false);
		}, 500); // A small delay to allow the state to update before closing
	};

	return (
		<View style={[styles.container, { backgroundColor: theme.surface }]}>
			<TouchableOpacity
				style={[styles.row, disabled && styles.disabled]}
				onPress={() => !disabled && setIsModalVisible(true)}
				activeOpacity={0.7}
			>
				<View style={styles.triggerContent}>
					<View style={styles.triggerLeft}>
						<View style={styles.iconContainer}>
							<Icon
								name={selectedOption?.icon || "settings-outline"}
								size={24}
								color={theme.accent}
							/>
						</View>
						<View style={styles.triggerTextContainer}>
							<Text style={styles.triggerTitle}>Automatic Scanning</Text>
							<Text style={styles.triggerSubtitle}>
								{selectedOption?.label || "Select frequency"}
							</Text>
						</View>
					</View>
					<View style={styles.triggerRight}>
						{selectedOption?.badge && (
							<View style={styles.badgeContainer}>
								<Text style={styles.badgeText}>{selectedOption.badge}</Text>
							</View>
						)}
						<Icon
							name="chevron-forward"
							size={20}
							color={theme.textSecondary}
						/>
					</View>
				</View>
			</TouchableOpacity>

			<Modal
				visible={isModalVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setIsModalVisible(false)}
				statusBarTranslucent
			>
				<GestureHandlerRootView style={styles.modalContainer}>
					<Animated.View
						entering={FadeIn.duration(200)}
						exiting={FadeOut.duration(150)}
						style={styles.backdrop}
					/>

					<BottomSheet
						ref={bottomSheetRef}
						index={0}
						snapPoints={snapPoints}
						onClose={() => setIsModalVisible(false)}
						backgroundStyle={[
							styles.bottomSheetBackground,
							{ backgroundColor: theme.surface },
						]}
						handleIndicatorStyle={[
							styles.bottomSheetHandle,
							{ backgroundColor: theme.text },
						]}
						enablePanDownToClose={true}
						animateOnMount={true}
					>
						<View style={styles.optionsList}>
							<Text style={styles.sectionDescription}>
								Choose when Visara should automatically scan your gallery for
								new documents.
							</Text>

							<View style={styles.optionsContainer}>
								{SCAN_FREQUENCY_OPTIONS.map((option) => (
									<OptionButton
										key={option.value}
										option={option}
										value={value}
										handleSelect={handleSelect}
									/>
								))}
							</View>

							<View style={styles.infoItem}>
								<Icon
									name="information-circle-outline"
									size={20}
									color={theme.textSecondary}
								/>
								<Text style={styles.infoText}>
									You can change this setting at any time. Battery usage varies
									by frequency.
								</Text>
							</View>
						</View>
					</BottomSheet>
				</GestureHandlerRootView>
			</Modal>
		</View>
	);
}

export default ScanFrequencyPicker;
