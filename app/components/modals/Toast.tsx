import React from "react";
import { Animated, Dimensions, Platform, StyleSheet, Text } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface ToastConfig {
	type: "success" | "error" | "info";
	message: string;
	icon?: string;
	duration?: number;
}

interface ToastState {
	visible: boolean;
	config: ToastConfig | null;
}

let toastInstance: ToastContainer | null = null;

export const showToast = (config: ToastConfig) => {
	if (toastInstance) {
		toastInstance.show(config);
	}
};

export class ToastContainer extends React.Component<{}, ToastState> {
	animatedValue = new Animated.Value(0);
	hideTimeout: NodeJS.Timeout | null = null;

	state: ToastState = {
		visible: false,
		config: null,
	};

	componentDidMount() {
		toastInstance = this;
	}

	componentWillUnmount() {
		toastInstance = null;
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}
	}

	show = (config: ToastConfig) => {
		if (this.hideTimeout) {
			clearTimeout(this.hideTimeout);
		}

		this.setState({ visible: true, config });

		Animated.sequence([
			Animated.spring(this.animatedValue, {
				toValue: 1,
				useNativeDriver: true,
				friction: 8,
				tension: 40,
			}),
			Animated.delay(config.duration || 3000),
			Animated.spring(this.animatedValue, {
				toValue: 0,
				useNativeDriver: true,
				friction: 8,
				tension: 40,
			}),
		]).start(() => {
			this.setState({ visible: false });
		});
	};

	getIcon = (config: ToastConfig) => {
		if (config.icon) return config.icon;

		switch (config.type) {
			case "success":
				return "checkmark-circle";
			case "error":
				return "alert-circle";
			case "info":
			default:
				return "information-circle";
		}
	};

	getBackgroundColor = (type: ToastConfig["type"]) => {
		switch (type) {
			case "success":
				return "#10B981";
			case "error":
				return "#EF4444";
			case "info":
			default:
				return "#6366F1";
		}
	};

	render() {
		const { visible, config } = this.state;

		if (!visible || !config) return null;

		const translateY = this.animatedValue.interpolate({
			inputRange: [0, 1],
			outputRange: [-100, 0],
		});

		const opacity = this.animatedValue.interpolate({
			inputRange: [0, 0.5, 1],
			outputRange: [0, 1, 1],
		});

		const scale = this.animatedValue.interpolate({
			inputRange: [0, 1],
			outputRange: [0.9, 1],
		});

		return (
			<Animated.View
				style={[
					styles.container,
					{
						transform: [{ translateY }, { scale }],
						opacity,
						backgroundColor: this.getBackgroundColor(config.type),
					},
				]}
				pointerEvents="none"
			>
				<Icon
					name={this.getIcon(config)}
					size={24}
					color="#FFFFFF"
					style={styles.icon}
				/>
				<Text style={styles.message} numberOfLines={2}>
					{config.message}
				</Text>
			</Animated.View>
		);
	}
}

const styles = StyleSheet.create({
	container: {
		position: "absolute",
		top: Platform.OS === "ios" ? 50 : 30,
		left: 20,
		right: 20,
		maxWidth: SCREEN_WIDTH - 40,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderRadius: 12,
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 4,
		},
		shadowOpacity: 0.3,
		shadowRadius: 4.65,
		elevation: 8,
		zIndex: 10000,
	},
	icon: {
		marginRight: 12,
	},
	message: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "500",
		flex: 1,
		lineHeight: 20,
	},
});
