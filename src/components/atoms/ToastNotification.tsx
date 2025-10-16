import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ToastConfigParams } from "react-native-toast-message";
import { Icon } from "./Icon";
import { useTheme } from "@theme/useTheme";
import {
	Colors,
	Shadows,
	BorderRadius,
	Typography,
	Spacing,
} from "@theme/colors";

/**
 * Custom Toast Configuration for different notification types
 * Material Design 3 inspired styling with platform-specific adaptations
 */

/**
 * Error Toast Component
 */
export function ErrorToast({
	text1,
	text2,
	props,
}: ToastConfigParams<{ action?: { text: string; onPress: () => void } }>) {
	const { colors, shadows } = useTheme();

	return (
		<View
			style={[
				styles.container,
				shadows.md,
				{
					backgroundColor: colors.toastError,
				},
			]}
		>
			<View
				style={[
					styles.textContainer,
					{ flexDirection: "row", alignItems: "center", gap: 6 },
				]}
			>
				<Icon name="alert-circle" size={24} color={colors.toastText} />
				<Text style={[styles.title, { color: colors.toastText }]}>{text1}</Text>
			</View>

			<Text style={[styles.message, { color: colors.toastText }]}>{text2}</Text>
			{props?.action && (
				<TouchableOpacity
					onPress={props.action.onPress}
					style={[
						styles.actionButton,
						{ backgroundColor: colors.toastActionBackground },
					]}
				>
					<Text style={[styles.actionText, { color: colors.toastText }]}>
						{props.action.text}
					</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

/**
 * Success Toast Component
 */
export function SuccessToast({
	text1,
	text2,
	props,
}: ToastConfigParams<{ action?: { text: string; onPress: () => void } }>) {
	const { colors, shadows } = useTheme();

	return (
		<View
			style={[
				styles.container,
				shadows.md,
				{
					backgroundColor: colors.toastSuccess,
				},
			]}
		>
			<Icon name="check-circle" size={24} color={colors.toastText} />
			<View style={styles.textContainer}>
				<Text style={[styles.title, { color: colors.toastText }]}>{text1}</Text>
				<Text style={[styles.message, { color: colors.toastText }]}>
					{text2}
				</Text>
			</View>
			{props?.action && (
				<TouchableOpacity
					onPress={props.action.onPress}
					style={[
						styles.actionButton,
						{ backgroundColor: colors.toastActionBackground },
					]}
				>
					<Text style={[styles.actionText, { color: colors.toastText }]}>
						{props.action.text}
					</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

/**
 * Warning Toast Component
 */
export function WarningToast({
	text1,
	text2,
	props,
}: ToastConfigParams<{ action?: { text: string; onPress: () => void } }>) {
	const { colors, shadows } = useTheme();

	return (
		<View
			style={[
				styles.container,
				shadows.md,
				{
					backgroundColor: colors.toastWarning,
				},
			]}
		>
			<Icon name="alert" size={24} color={colors.toastText} />
			<View style={styles.textContainer}>
				<Text style={[styles.title, { color: colors.toastText }]}>{text1}</Text>
				<Text style={[styles.message, { color: colors.toastText }]}>
					{text2}
				</Text>
			</View>
			{props?.action && (
				<TouchableOpacity
					onPress={props.action.onPress}
					style={[
						styles.actionButton,
						{ backgroundColor: colors.toastActionBackground },
					]}
				>
					<Text style={[styles.actionText, { color: colors.toastText }]}>
						{props.action.text}
					</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

/**
 * Info Toast Component
 */
export function InfoToast({
	text1,
	text2,
	props,
}: ToastConfigParams<{ action?: { text: string; onPress: () => void } }>) {
	const { colors, shadows } = useTheme();

	return (
		<View
			style={[
				styles.container,
				shadows.md,
				{
					backgroundColor: colors.toastInfo,
				},
			]}
		>
			<Icon name="information" size={24} color={colors.toastText} />
			<View style={styles.textContainer}>
				<Text style={[styles.title, { color: colors.toastText }]}>{text1}</Text>
				<Text style={[styles.message, { color: colors.toastText }]}>
					{text2}
				</Text>
			</View>
			{props?.action && (
				<TouchableOpacity
					onPress={props.action.onPress}
					style={[
						styles.actionButton,
						{ backgroundColor: colors.toastActionBackground },
					]}
				>
					<Text style={[styles.actionText, { color: colors.toastText }]}>
						{props.action.text}
					</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "90%",
		marginHorizontal: "5%",
		borderRadius: BorderRadius.lg,
		paddingHorizontal: Spacing.md,
		paddingVertical: Spacing.sm,
		flexDirection: "column",
		alignItems: "center",
	},
	textContainer: {
		flex: 1,
		marginLeft: Spacing.sm,
		justifyContent: "center",
		alignItems: "center",
	},
	title: {
		fontSize: Typography.fontSize.sm,
		fontWeight: Typography.fontWeight.bold,
		marginBottom: 2,
	},
	message: {
		fontSize: Typography.fontSize.xs,
		fontWeight: Typography.fontWeight.regular,
		opacity: 0.9,
		textAlign: "center",
		marginBottom: 4,
	},
	actionButton: {
		marginLeft: Spacing.sm,
		paddingHorizontal: Spacing.sm,
		paddingVertical: 6,
		borderRadius: BorderRadius.md,
	},
	actionText: {
		fontSize: Typography.fontSize.xs,
		fontWeight: Typography.fontWeight.semibold,
		textTransform: "uppercase",
	},
});

/**
 * Export toast configuration for react-native-toast-message
 */
export const toastConfig = {
	error: (
		props: ToastConfigParams<{
			action?: { text: string; onPress: () => void };
		}>,
	) => <ErrorToast {...props} />,
	success: (
		props: ToastConfigParams<{
			action?: { text: string; onPress: () => void };
		}>,
	) => <SuccessToast {...props} />,
	warning: (
		props: ToastConfigParams<{
			action?: { text: string; onPress: () => void };
		}>,
	) => <WarningToast {...props} />,
	info: (
		props: ToastConfigParams<{
			action?: { text: string; onPress: () => void };
		}>,
	) => <InfoToast {...props} />,
};
