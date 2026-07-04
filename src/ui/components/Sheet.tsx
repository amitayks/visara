/**
 * Sheet primitive — TrueSheet wrapper (ui-design-system spec).
 *
 * Spike finding baked in: the native sheet container follows the OS color
 * scheme unless we pass a themed backgroundColor/cornerRadius/grabber, so a
 * forced in-app theme MUST flow into TrueSheet props here.
 *
 * Dismissal resolves through native presentation-lifecycle callbacks
 * (onDidDismiss) — no timer-based close races. Pass `scrollable` when the
 * content is a ScrollView/FlatList so nested scrolling does not fight
 * drag-to-dismiss.
 */
import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { useAppTheme } from "@ui/theme";
import { forwardRef, type ReactNode, useImperativeHandle, useRef } from "react";

export interface SheetRef {
	present(): Promise<void>;
	dismiss(): Promise<void>;
}

export interface SheetProps {
	children?: ReactNode;
	detents?: ("auto" | number)[];
	onDismiss?: () => void;
	/** Set when the sheet content is a ScrollView/FlatList (nested scroll). */
	scrollable?: boolean;
	testID?: string;
}

export const Sheet = forwardRef<SheetRef, SheetProps>(function Sheet(
	{ children, detents = ["auto"], onDismiss, scrollable = false, testID },
	ref,
) {
	const { theme } = useAppTheme();
	const sheetRef = useRef<TrueSheet>(null);

	useImperativeHandle(
		ref,
		() => ({
			present: () => sheetRef.current?.present() ?? Promise.resolve(),
			dismiss: () => sheetRef.current?.dismiss() ?? Promise.resolve(),
		}),
		[],
	);

	return (
		<TrueSheet
			ref={sheetRef}
			detents={detents}
			dimmed
			grabber
			grabberOptions={{ color: theme.colors.border, adaptive: false }}
			backgroundColor={theme.colors.surfaceElevated}
			cornerRadius={theme.radii.xl}
			scrollable={scrollable}
			onDidDismiss={onDismiss ? () => onDismiss() : undefined}
			testID={testID}
		>
			{children}
		</TrueSheet>
	);
});
