import React from "react";
import { StyleSheet, ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";

interface ScreenContainerProps extends ViewProps {
	children: React.ReactNode;
	edges?: Array<"top" | "right" | "bottom" | "left">;
	backgroundColor?: string;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
	children,
	edges = ["top"],
	backgroundColor,
	style,
	...props
}) => {
	const { theme } = useTheme();
	const styles = useThemedStyles(createStyles);
	const effectiveBackgroundColor = backgroundColor || theme.background;
	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: effectiveBackgroundColor }, style]}
			edges={edges}
			{...props}
		>
			{children}
		</SafeAreaView>
	);
};

const createStyles = (theme: any) => StyleSheet.create({
	container: {
		flex: 1,
	},
});
