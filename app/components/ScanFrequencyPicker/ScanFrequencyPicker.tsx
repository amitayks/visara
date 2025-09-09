import React, { useState } from "react";
import { Modal, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./styles";

export type ScanFrequency = "on_new_image" | "hourly" | "daily" | "weekly";

interface ScanFrequencyOption {
	value: ScanFrequency;
	label: string;
	description: string;
	icon: string;
	badge?: string;
}

const SCAN_FREQUENCY_OPTIONS: ScanFrequencyOption[] = [
	{
		value: "on_new_image",
		label: "When New Images Added",
		description: "Scan immediately when new photos are detected",
		icon: "camera-outline",
		badge: "Real-time",
	},
	{
		value: "hourly",
		label: "Every Hour",
		description: "Scan for new documents every 60 minutes",
		icon: "time-outline",
		badge: "Frequent",
	},
	{
		value: "daily",
		label: "Once Daily",
		description: "Scan once per day for new documents",
		icon: "calendar-outline",
		badge: "Recommended",
	},
	{
		value: "weekly",
		label: "Weekly",
		description: "Scan once per week for new documents",
		icon: "calendar-number-outline",
		badge: "Battery Saver",
	},
];

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

	const selectedOption = SCAN_FREQUENCY_OPTIONS.find(
		(option) => option.value === value,
	);

	const handleSelect = (selectedValue: ScanFrequency) => {
		onValueChange(selectedValue);
		setIsModalVisible(false);
	};

	return (
		<>
			{/* Trigger Button */}
			<TouchableOpacity
				style={[styles.triggerButton, disabled && styles.disabled]}
				onPress={() => !disabled && setIsModalVisible(true)}
				activeOpacity={0.7}
			>
				<View style={styles.triggerContent}>
					<View style={styles.triggerLeft}>
						<View style={styles.iconContainer}>
							<Icon
								name={selectedOption?.icon || "settings-outline"}
								size={24}
								color={theme.primary}
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

			{/* Selection Modal */}
			<Modal
				visible={isModalVisible}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setIsModalVisible(false)}
			>
				<View style={styles.modalContainer}>
					{/* Modal Header */}
					<View style={styles.modalHeader}>
						<TouchableOpacity
							style={styles.closeButton}
							onPress={() => setIsModalVisible(false)}
						>
							<Icon name="close" size={24} color={theme.text} />
						</TouchableOpacity>
						<Text style={styles.modalTitle}>Scanning Frequency</Text>
						<View style={styles.headerSpacer} />
					</View>

					{/* Options List */}
					<ScrollView
						style={styles.optionsList}
						showsVerticalScrollIndicator={false}
					>
						<Text style={styles.sectionDescription}>
							Choose when Visara should automatically scan your gallery for new
							documents.
						</Text>

						{SCAN_FREQUENCY_OPTIONS.map((option) => (
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
										<View
											style={[
												styles.optionIconContainer,
												value === option.value && styles.selectedIconContainer,
											]}
										>
											<Icon
												name={option.icon}
												size={24}
												color={
													value === option.value
														? theme.background
														: theme.primary
												}
											/>
										</View>
										<View style={styles.optionTextContainer}>
											<View style={styles.optionTitleRow}>
												<Text
													style={[
														styles.optionTitle,
														value === option.value &&
															styles.selectedOptionTitle,
													]}
												>
													{option.label}
												</Text>
												{option.badge && (
													<View
														style={[
															styles.optionBadge,
															value === option.value && styles.selectedBadge,
														]}
													>
														<Text
															style={[
																styles.optionBadgeText,
																value === option.value &&
																	styles.selectedBadgeText,
															]}
														>
															{option.badge}
														</Text>
													</View>
												)}
											</View>
											<Text
												style={[
													styles.optionDescription,
													value === option.value &&
														styles.selectedOptionDescription,
												]}
											>
												{option.description}
											</Text>
										</View>
									</View>
									{value === option.value && (
										<View style={styles.checkmarkContainer}>
											<Icon
												name="checkmark-circle"
												size={24}
												color={theme.primary}
											/>
										</View>
									)}
								</View>
							</TouchableOpacity>
						))}

						{/* Info Section */}
						<View style={styles.infoSection}>
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
					</ScrollView>
				</View>
			</Modal>
		</>
	);
}

export default ScanFrequencyPicker;
