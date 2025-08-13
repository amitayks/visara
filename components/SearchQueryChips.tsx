import React from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
	Animated,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { SearchFilter } from "../services/search/advancedSearch/searchTypes";

interface QueryChip {
	id: string;
	label: string;
	type: "temporal" | "amount" | "vendor" | "documentType" | "keyword" | "base";
	value: any;
	removable: boolean;
}

interface SearchQueryChipsProps {
	baseQuery?: string;
	filters: SearchFilter;
	onRemoveChip: (chipId: string) => void;
	onClearAll: () => void;
	suggestions?: string[];
	onSuggestionPress?: (suggestion: string) => void;
}

export const SearchQueryChips: React.FC<SearchQueryChipsProps> = ({
	baseQuery,
	filters,
	onRemoveChip,
	onClearAll,
	suggestions,
	onSuggestionPress,
}) => {
	const fadeAnim = React.useRef(new Animated.Value(0)).current;

	React.useEffect(() => {
		Animated.timing(fadeAnim, {
			toValue: 1,
			duration: 300,
			useNativeDriver: true,
		}).start();
	}, []);

	const chips = React.useMemo(() => {
		const chipList: QueryChip[] = [];

		// Add base query chip if exists
		if (baseQuery) {
			chipList.push({
				id: "base-query",
				label: baseQuery,
				type: "base",
				value: baseQuery,
				removable: false,
			});
		}

		// Add temporal filter chips
		if (filters.temporal) {
			const temporal = filters.temporal;
			let label = "";

			if (temporal.type === "count" && temporal.count) {
				label = `Last ${temporal.count} ${temporal.documentType || "documents"}`;
			} else if (temporal.startDate && temporal.endDate) {
				const start = temporal.startDate.toLocaleDateString();
				const end = temporal.endDate.toLocaleDateString();
				label = start === end ? start : `${start} - ${end}`;
			} else if (temporal.unit) {
				label = `Last ${temporal.count || 1} ${temporal.unit}${temporal.count && temporal.count > 1 ? "s" : ""}`;
			}

			if (label) {
				chipList.push({
					id: "temporal",
					label,
					type: "temporal",
					value: temporal,
					removable: true,
				});
			}
		}

		// Add amount filter chips
		if (filters.amount) {
			const { value, operator, currency, maxValue } = filters.amount;
			let label = "";

			switch (operator) {
				case "equals":
					label = `${currency || "$"}${value}`;
					break;
				case "greater":
					label = `> ${currency || "$"}${value}`;
					break;
				case "less":
					label = `< ${currency || "$"}${value}`;
					break;
				case "between":
					label = `${currency || "$"}${value} - ${currency || "$"}${maxValue}`;
					break;
			}

			if (label) {
				chipList.push({
					id: "amount",
					label,
					type: "amount",
					value: filters.amount,
					removable: true,
				});
			}
		}

		// Add vendor filter chips
		if (filters.vendor) {
			filters.vendor.forEach((vendor, index) => {
				chipList.push({
					id: `vendor-${index}`,
					label: vendor,
					type: "vendor",
					value: vendor,
					removable: true,
				});
			});
		}

		// Add document type filter chips
		if (filters.documentTypes) {
			filters.documentTypes.forEach((type, index) => {
				chipList.push({
					id: `doctype-${index}`,
					label: type.charAt(0).toUpperCase() + type.slice(1),
					type: "documentType",
					value: type,
					removable: true,
				});
			});
		}

		// Add keyword filter chips (limit to first 3)
		if (filters.keywords) {
			filters.keywords.slice(0, 3).forEach((keyword, index) => {
				chipList.push({
					id: `keyword-${index}`,
					label: keyword,
					type: "keyword",
					value: keyword,
					removable: true,
				});
			});
		}

		return chipList;
	}, [baseQuery, filters]);

	const getChipColor = (type: QueryChip["type"]) => {
		switch (type) {
			case "base":
				return "#007AFF";
			case "temporal":
				return "#34C759";
			case "amount":
				return "#FF9500";
			case "vendor":
				return "#AF52DE";
			case "documentType":
				return "#5856D6";
			case "keyword":
				return "#666666";
			default:
				return "#999999";
		}
	};

	const getChipIcon = (type: QueryChip["type"]) => {
		switch (type) {
			case "temporal":
				return "calendar-outline";
			case "amount":
				return "cash-outline";
			case "vendor":
				return "business-outline";
			case "documentType":
				return "document-outline";
			case "keyword":
				return "pricetag-outline";
			default:
				return "search-outline";
		}
	};

	if (chips.length === 0 && (!suggestions || suggestions.length === 0)) {
		return null;
	}

	return (
		<Animated.View style={[styles.container, { opacity: fadeAnim }]}>
			{chips.length > 0 && (
				<View style={styles.chipsSection}>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.chipsContainer}
					>
						{chips.map((chip) => (
							<View
								key={chip.id}
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
									style={[styles.chipLabel, { color: getChipColor(chip.type) }]}
									numberOfLines={1}
								>
									{chip.label}
								</Text>
								{chip.removable && (
									<TouchableOpacity
										onPress={() => onRemoveChip(chip.id)}
										hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
									>
										<Icon
											name="close-circle"
											size={16}
											color={getChipColor(chip.type)}
										/>
									</TouchableOpacity>
								)}
							</View>
						))}

						{chips.filter((c) => c.removable).length > 1 && (
							<TouchableOpacity
								style={styles.clearAllButton}
								onPress={onClearAll}
							>
								<Text style={styles.clearAllText}>Clear All</Text>
							</TouchableOpacity>
						)}
					</ScrollView>
				</View>
			)}

			{suggestions && suggestions.length > 0 && (
				<View style={styles.suggestionsSection}>
					<Text style={styles.suggestionsLabel}>Try:</Text>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.suggestionsContainer}
					>
						{suggestions.map((suggestion, index) => (
							<TouchableOpacity
								key={index}
								style={styles.suggestionChip}
								onPress={() => onSuggestionPress?.(suggestion)}
							>
								<Icon
									name="add-circle-outline"
									size={14}
									color="#007AFF"
									style={styles.suggestionIcon}
								/>
								<Text style={styles.suggestionText}>{suggestion}</Text>
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>
			)}
		</Animated.View>
	);
};

const styles = StyleSheet.create({
	container: {
		backgroundColor: "#FAFAFA",
		borderBottomWidth: 1,
		borderBottomColor: "#E5E5E7",
	},
	chipsSection: {
		paddingVertical: 8,
	},
	chipsContainer: {
		paddingHorizontal: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		maxWidth: 200,
	},
	chipIcon: {
		marginRight: 4,
	},
	chipLabel: {
		fontSize: 13,
		fontWeight: "500",
		marginRight: 4,
	},
	clearAllButton: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		marginLeft: 8,
	},
	clearAllText: {
		fontSize: 13,
		color: "#FF3B30",
		fontWeight: "500",
	},
	suggestionsSection: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderTopWidth: 1,
		borderTopColor: "#F2F2F7",
	},
	suggestionsLabel: {
		fontSize: 12,
		color: "#666666",
		marginRight: 8,
	},
	suggestionsContainer: {
		flexDirection: "row",
		gap: 8,
	},
	suggestionChip: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 14,
		backgroundColor: "#F2F2F7",
	},
	suggestionIcon: {
		marginRight: 4,
	},
	suggestionText: {
		fontSize: 12,
		color: "#007AFF",
	},
});
