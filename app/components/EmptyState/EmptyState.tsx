import { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
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
	const bounce = useSharedValue(0);

	useEffect(() => {
		bounce.value = withRepeat(
			withSequence(
				withTiming(-10, { duration: 1000 }),
				withTiming(0, { duration: 1000 }),
			),
			-1,
			true,
		);
	}, []);

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: bounce.value }],
	}));

	return (
		<View style={styles.emptyContainer}>
			<Animated.View style={animatedStyle}>
				<Icon name={icon} size={64} color={iconColors.tertiary} />
			</Animated.View>
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
