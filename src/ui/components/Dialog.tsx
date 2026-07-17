/**
 * Dialog primitive — declarative themed confirm dialog over an RN Modal.
 * Optional children render between the message and the action row
 * (e.g. a TextInput for album names or typed confirmations).
 */

import { StyleSheet } from "@ui/theme";
import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";

export interface DialogProps {
	visible: boolean;
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	children?: ReactNode;
}

export function Dialog({
	visible,
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive = false,
	onConfirm,
	onCancel,
	children,
}: DialogProps) {
	return (
		<Modal
			visible={visible}
			transparent
			animationType="fade"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={onCancel}
		>
			<View style={styles.container}>
				<Pressable
					style={styles.backdrop}
					onPress={onCancel}
					accessibilityRole="button"
					accessibilityLabel="Dismiss dialog"
				/>
				<View
					style={styles.card}
					accessibilityViewIsModal
					accessibilityRole="alert"
				>
					<Text variant="title3">{title}</Text>
					{message ? (
						<Text variant="subhead" color="textSecondary">
							{message}
						</Text>
					) : null}
					{children}
					<View style={styles.actions}>
						<Button title={cancelLabel} variant="ghost" onPress={onCancel} />
						<Button
							title={confirmLabel}
							variant={destructive ? "destructive" : "primary"}
							onPress={onConfirm}
						/>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: theme.spacing.xxl,
	},
	backdrop: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: theme.colors.overlay,
	},
	card: {
		width: "100%",
		maxWidth: 360,
		backgroundColor: theme.colors.surfaceElevated,
		borderRadius: theme.radii.xl,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		padding: theme.spacing.xl,
		gap: theme.spacing.md,
	},
	actions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		gap: theme.spacing.sm,
		marginTop: theme.spacing.sm,
	},
}));
