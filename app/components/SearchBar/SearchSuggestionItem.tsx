import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";

interface SearchSuggestionItemProps {
	item: {
		id: string;
		title: string;
		type: "history" | "keyword" | "document" | "smart";
		metadata?: {
			count?: number;
			documentType?: string;
			lastUsed?: string;
		};
	};
	searchText: string;
	theme: any;
	isDark: boolean;
}

export const SearchSuggestionItem: React.FC<SearchSuggestionItemProps> = ({
	item,
	searchText,
	theme,
	isDark,
}) => {
	const styles = createStyles(theme, isDark);

	// Get icon based on type
	const getIcon = () => {
		switch (item.type) {
			case "history":
				return "time-outline";
			case "keyword":
				return "key-outline";
			case "document":
				return "document-text-outline";
			case "smart":
				return "bulb-outline";
			default:
				return "search-outline";
		}
	};

	// Get icon color based on type
	const getIconColor = () => {
		switch (item.type) {
			case "history":
				return theme.secondary;
			case "keyword":
				return theme.primary;
			case "document":
				return theme.accent;
			case "smart":
				return theme.warning;
			default:
				return theme.secondary;
		}
	};

	// Highlight matching text
	const highlightText = (text: string, query: string) => {
		if (!query) return <Text style={styles.title}>{text}</Text>;

		const parts = text.split(new RegExp(`(${query})`, "gi"));
		return (
			<Text style={styles.title}>
				{parts.map((part, index) =>
					part.toLowerCase() === query.toLowerCase() ? (
						<Text key={index} style={styles.highlight}>
							{part}
						</Text>
					) : (
						<Text key={index}>{part}</Text>
					),
				)}
			</Text>
		);
	};

	return (
		<TouchableOpacity style={styles.container} activeOpacity={0.7}>
			<View style={styles.iconContainer}>
				<Icon name={getIcon()} size={18} color={getIconColor()} />
			</View>

			<View style={styles.content}>
				{highlightText(item.title, searchText)}

				{item.metadata && (
					<View style={styles.metadata}>
						{item.metadata.count !== undefined && (
							<Text style={styles.metaText}>{item.metadata.count} results</Text>
						)}
						{item.metadata.documentType && (
							<Text style={styles.metaText}>{item.metadata.documentType}</Text>
						)}
						{item.type === "history" && item.metadata.lastUsed && (
							<Text style={styles.metaText}>Recent</Text>
						)}
					</View>
				)}
			</View>

			{item.type === "history" && (
				<Icon name="arrow-forward" size={16} color={theme.secondary} />
			)}
		</TouchableOpacity>
	);
};

const createStyles = (theme: any, isDark: boolean) =>
	StyleSheet.create({
		container: {
			flexDirection: "row",
			alignItems: "center",
			paddingVertical: 12,
			paddingHorizontal: 16,
			backgroundColor: theme.card,
		},
		iconContainer: {
			width: 32,
			height: 32,
			borderRadius: 16,
			backgroundColor: theme.inputBackground,
			alignItems: "center",
			justifyContent: "center",
			marginRight: 12,
		},
		content: {
			flex: 1,
		},
		title: {
			fontSize: 15,
			color: theme.text,
			marginBottom: 2,
		},
		highlight: {
			fontWeight: "600",
			color: theme.primary,
		},
		metadata: {
			flexDirection: "row",
			gap: 8,
		},
		metaText: {
			fontSize: 12,
			color: theme.secondary,
		},
	});