import { useNavigation } from "@react-navigation/native";
import {
	Platform,
	ScrollView,
	StatusBar,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/Ionicons";
import { useTheme, useThemedStyles } from "../contexts/ThemeContext";
import { SettingsSectionHeader } from "./components/SettingsSectionHeader";
import { ToggleBar } from "./components/ToggleBar";
import { createStyles } from "./settings.style";

export default function SettingsScreen() {
	const navigation = useNavigation();
	const { theme, isDark, toggleTheme } = useTheme();

	// const { isLoading } = useSettingsStore();
	const styles = useThemedStyles(createStyles);

	const handleGoBack = () => {
		navigation.goBack();
	};

	return (
		<SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
			<StatusBar
				barStyle={isDark ? "light-content" : "dark-content"}
				backgroundColor={theme.background}
			/>

			{/* Header */}
			<View style={styles.header}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={handleGoBack}
					activeOpacity={0.7}
				>
					<Icon name="chevron-back" size={24} color={theme.text} />
				</TouchableOpacity>
				{/* <View style={styles.headerSpacer} /> */}
				<Text style={styles.headerTitle}>Settings</Text>
			</View>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{/* Appearance Section */}
				<SettingsSectionHeader title="Appearance" />
				<ToggleBar
					onPress={toggleTheme}
					isChange={isDark}
					title={["Dark Mode", "Light Mode"]}
					subtitle={["Switch to light theme", "Switch to dark theme"]}
					iconsName={["moon", "sunny"]}
				/>
			</ScrollView>

			{/* Version Info Section at Bottom */}
			<View style={styles.footer}>
				<View style={styles.versionSection}>
					{/* <Text style={styles.appName}>Visara</Text> */}
					<Text style={styles.version}>Version 1.0.0</Text>
					<Text style={styles.buildInfo}>
						Build {Platform.OS === "ios" ? "iOS" : "Android"} •{" "}
						{new Date().getFullYear()}
					</Text>

					<View style={styles.infoRow}>
						<View style={styles.infoItem}>
							<Icon
								name="shield-checkmark-outline"
								size={16}
								color={theme.textSecondary}
							/>
							<Text style={styles.infoText}>Privacy First</Text>
						</View>
						<View style={styles.infoItem}>
							<Icon
								name="phone-portrait-outline"
								size={16}
								color={theme.textSecondary}
							/>
							<Text style={styles.infoText}>On-Device AI</Text>
						</View>
					</View>

					<Text style={styles.copyright}>
						© {new Date().getFullYear()} Visara. All rights reserved.
					</Text>
				</View>
			</View>
		</SafeAreaView>
	);
}
