/**
 * DevPocLauncher — a `__DEV__`-only affordance to reach the ExecuTorch POC
 * screen (openspec change `executorch-runtime-bootstrap`, group D, task 4.5).
 *
 * Renders a small floating button that opens the POC in a full-screen modal.
 * It is mounted in `App.tsx` behind a `__DEV__` guard, so it is stripped from
 * production builds and is never reachable from the normal app flow.
 */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExecutorchPocScreen } from "./ExecutorchPocScreen";

export function DevPocLauncher() {
	const [open, setOpen] = useState(false);
	const insets = useSafeAreaInsets();

	return (
		<>
			<Pressable
				accessibilityRole="button"
				onPress={() => setOpen(true)}
				style={[styles.fab, { bottom: insets.bottom + 96 }]}
				testID="dev-poc-launcher"
			>
				<Text style={styles.fabText}>ML{"\n"}POC</Text>
			</Pressable>
			<Modal
				animationType="slide"
				onRequestClose={() => setOpen(false)}
				presentationStyle="fullScreen"
				visible={open}
			>
				<ExecutorchPocScreen onClose={() => setOpen(false)} />
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	fab: {
		position: "absolute",
		right: 16,
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: "#8957e5",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.3,
		shadowRadius: 4,
		elevation: 6,
		zIndex: 9999,
	},
	fabText: {
		color: "#ffffff",
		fontSize: 11,
		fontWeight: "800",
		textAlign: "center",
		lineHeight: 13,
	},
});
