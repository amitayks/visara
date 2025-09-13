import React from "react";
import {
	View,
	Text,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useSearchStore } from "../../../stores/searchStore";

interface SearchHistoryProps {
	onSelectSearch: (query: string) => void;
	theme: any;
	isDark: boolean;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({
	onSelectSearch,
	theme,
	isDark,
}) => {
	const { searchHistory, removeFromHistory } = useSearchStore();
	const styles = createStyles(theme, isDark);

	if (searchHistory.length === 0) {
		return null;
	}

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Recent Searches</Text>
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				{searchHistory.slice(0, 5).map((query, index) => (
					<TouchableOpacity
						key={`${query}-${index}`}
						style={styles.chip}
						onPress={() => onSelectSearch(query)}
					>
						<Icon name="time-outline" size={14} color={theme.secondary} />
						<Text style={styles.chipText}>{query}</Text>
						<TouchableOpacity
							onPress={() => removeFromHistory(query)}
							hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
						>
							<Icon name="close" size={14} color={theme.secondary} />
						</TouchableOpacity>
					</TouchableOpacity>
				))}
			</ScrollView>
		</View>
	);
};

const createStyles = (theme: any, isDark: boolean) =>
	StyleSheet.create({
		container: {
			marginTop: 12,
		},
		title: {
			fontSize: 12,
			color: theme.secondary,
			marginBottom: 8,
			textTransform: "uppercase",
			letterSpacing: 0.5,
		},
		chip: {
			flexDirection: "row",
			alignItems: "center",
			backgroundColor: theme.inputBackground,
			paddingHorizontal: 12,
			paddingVertical: 6,
			borderRadius: 16,
			marginRight: 8,
			gap: 6,
		},
		chipText: {
			fontSize: 13,
			color: theme.text,
		},
	});