import { Text, View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { createStyles } from "./ScanStatus.style";

export function ScanStatus({ scanStatus }: { scanStatus: any }) {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	// const [scanStatus, setScanStatus] = useState<any>(null);

	return (
		<View style={styles.statusContainer}>
			<View style={styles.statusHeader}>
				<Icon
					name={scanStatus.isRunning ? "pulse" : "pause-circle-outline"}
					size={20}
					color={scanStatus.isRunning ? theme.success : theme.textSecondary}
				/>
				<Text style={styles.statusTitle}>
					{scanStatus.isRunning ? "Active" : "Idle"}
				</Text>
			</View>
			<Text style={styles.statusDescription}>
				{scanStatus.scanFrequency === "on_new_image" &&
				scanStatus.galleryMonitoring?.isActive
					? `Monitoring gallery • Last check: ${scanStatus.galleryMonitoring.lastCheckTime ? new Date(scanStatus.galleryMonitoring.lastCheckTime).toLocaleTimeString() : "Never"}`
					: scanStatus.isRunning
						? "Background scanning is active"
						: scanStatus.autoScanEnabled
							? "Waiting for next scan cycle"
							: "Automatic scanning is disabled"}
			</Text>
			{scanStatus.lastScanTime && (
				<Text style={styles.statusDetail}>
					Last scan: {new Date(scanStatus.lastScanTime).toLocaleString()}
				</Text>
			)}
		</View>
	);
}
