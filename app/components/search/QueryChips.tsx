import React from "react";
import {
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	ViewStyle,
} from "react-native";
import Animated, {
	FadeInDown,
	FadeOutUp,
	Layout,
} from "react-native-reanimated";
import Icon from "react-native-vector-icons/Ionicons";

export interface QueryChip {
	id: string;
	text: string;
	type: "search" | "filter" | "date" | "amount";
}

interface QueryChipsProps {
	chips: QueryChip[];
	onRemoveChip: (id: string) => void;
	style?: ViewStyle;
}

export const QueryChips: React.FC<QueryChipsProps> = ({
	chips,
	onRemoveChip,
	style,
}) => {
	const getChipColor = (type: QueryChip["type"]) => {
		switch (type) {
			case "search":
				return "#6366F1";
			case "filter":
				return "#10B981";
			case "date":
				return "#F59E0B";
			case "amount":
				return "#EC4899";
			default:
				return "#6366F1";
		}
	};

	const getChipIcon = (type: QueryChip["type"]) => {
		switch (type) {
			case "search":
				return "search";
			case "filter":
				return "filter";
			case "date":
				return "calendar";
			case "amount":
				return "cash";
			default:
				return "search";
		}
	};

	if (chips.length === 0) return null;

	return (
		<Animated.View
			entering={FadeInDown.duration(300)}
			exiting={FadeOutUp.duration(300)}
			layout={Layout.springify()}
			style={[styles.container, style]}
		>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.scrollContent}
			>
				{chips.map((chip) => (
					<Animated.View
						key={chip.id}
						entering={FadeInDown.delay(100)}
						exiting={FadeOutUp}
						layout={Layout.springify()}
					>
						<View
							style={[
								styles.chip,
								{ backgroundColor: `${getChipColor(chip.type)}15` },
							]}
						>
							<Icon
								name={getChipIcon(chip.type)}
								size={14}
								color={getChipColor(chip.type)}
								style={styles.chipIcon}
							/>
							<Text
								style={[styles.chipText, { color: getChipColor(chip.type) }]}
								numberOfLines={1}
							>
								{chip.text}
							</Text>
							<TouchableOpacity
								onPress={() => onRemoveChip(chip.id)}
								activeOpacity={0.7}
								style={styles.removeButton}
							>
								<Icon
									name="close-circle"
									size={16}
									color={getChipColor(chip.type)}
								/>
							</TouchableOpacity>
						</View>
					</Animated.View>
				))}
			</ScrollView>
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: "#FFFFFF",
	},
	scrollContent: {
		paddingHorizontal: 16,
		paddingVertical: 8,
		gap: 8,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		marginRight: 8,
	},
	chipIcon: {
		marginRight: 6,
	},
	chipText: {
		fontSize: 14,
		fontWeight: "500",
		maxWidth: 150,
	},
	removeButton: {
		marginLeft: 6,
		padding: 2,
	},
});
