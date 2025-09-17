import { Platform, Text, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { createStyles } from "./SettingsFooter.style";
import { useTheme } from "../../../contexts/ThemeContext";

export function SettingsFooter() {
	const styles = createStyles(createStyles);
	const { theme } = useTheme();

	return (
		<View style={styles.versionSection}>
			<Text style={[styles.version, { color: theme.primary }]}>
				Version 1.1.0
			</Text>
			<Text style={[styles.buildInfo, { color: theme.primary }]}>
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
					<Text style={[styles.infoText, { color: theme.secondary }]}>
						Zero-Knowledge Privacy
					</Text>
				</View>
				<View style={styles.infoItem}>
					<Icon
						name="phone-portrait-outline"
						size={16}
						color={theme.textSecondary}
					/>
					<Text style={[styles.infoText, { color: theme.secondary }]}>
						On-Device AI
					</Text>
				</View>
			</View>

			<Text style={[styles.copyright, { color: theme.secondary }]}>
				© {new Date().getFullYear()} Visara. All rights reserved.
			</Text>
		</View>
	);
}
