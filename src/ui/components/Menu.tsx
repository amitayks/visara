/**
 * Menu primitive — a simple themed popover over an RN Modal (no library).
 * With an anchor it positions below/right-aligned to it (measured in window
 * coordinates); without one it falls back to a centered card.
 */

import { StyleSheet, spacing } from "@ui/theme";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Modal, Pressable, useWindowDimensions, View } from "react-native";
import { Icon, iconSizes } from "./Icon";
import { Text } from "./Text";

export interface MenuItem {
	label: string;
	/** Material Design Icons glyph name. */
	icon?: string;
	destructive?: boolean;
	onPress: () => void;
}

export interface MenuProps {
	visible: boolean;
	/** Optional trigger rendered inline; the popover anchors to it. */
	anchor?: ReactNode;
	items: MenuItem[];
	onDismiss: () => void;
}

interface PopoverPosition {
	top: number;
	right: number;
}

export function Menu({ visible, anchor, items, onDismiss }: MenuProps) {
	const anchorRef = useRef<View>(null);
	const [position, setPosition] = useState<PopoverPosition | null>(null);
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();

	useEffect(() => {
		if (!visible) {
			return;
		}
		if (!anchorRef.current) {
			setPosition(null);
			return;
		}
		anchorRef.current.measureInWindow((x, y, width, height) => {
			const right = Math.max(spacing.sm, windowWidth - (x + width));
			const top = Math.min(
				y + height + spacing.xs,
				Math.max(spacing.sm, windowHeight - estimatedMenuHeight(items.length)),
			);
			setPosition({ top, right });
		});
	}, [visible, items.length, windowWidth, windowHeight]);

	return (
		<>
			{anchor != null ? (
				<View ref={anchorRef} collapsable={false}>
					{anchor}
				</View>
			) : null}
			<Modal
				visible={visible}
				transparent
				animationType="fade"
				statusBarTranslucent
				navigationBarTranslucent
				onRequestClose={onDismiss}
			>
				<Pressable
					style={styles.backdrop(position == null)}
					onPress={onDismiss}
					accessibilityRole="button"
					accessibilityLabel="Dismiss menu"
				>
					<View
						style={styles.card(position)}
						accessibilityViewIsModal
						accessibilityRole="menu"
					>
						{items.map((item) => (
							<Pressable
								key={item.label}
								onPress={() => {
									onDismiss();
									item.onPress();
								}}
								style={({ pressed }) => [
									styles.item,
									pressed && styles.itemPressed,
								]}
								accessibilityRole="menuitem"
								accessibilityLabel={item.label}
							>
								{item.icon ? (
									<Icon
										name={item.icon}
										size={iconSizes.sm}
										color={item.destructive ? "danger" : "textSecondary"}
									/>
								) : null}
								<Text
									variant="body"
									color={item.destructive ? "danger" : "textPrimary"}
									numberOfLines={1}
								>
									{item.label}
								</Text>
							</Pressable>
						))}
					</View>
				</Pressable>
			</Modal>
		</>
	);
}

/** Rough row-height estimate used only to clamp the popover on-screen. */
function estimatedMenuHeight(itemCount: number): number {
	const rowHeight = spacing.huge;
	return itemCount * rowHeight + spacing.xl;
}

const styles = StyleSheet.create((theme) => ({
	backdrop: (centered: boolean) => ({
		flex: 1,
		backgroundColor: theme.colors.overlay,
		...(centered
			? {
					alignItems: "center" as const,
					justifyContent: "center" as const,
					padding: theme.spacing.xxl,
				}
			: null),
	}),
	card: (position: PopoverPosition | null) => ({
		backgroundColor: theme.colors.surfaceElevated,
		borderRadius: theme.radii.md,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: theme.colors.border,
		paddingVertical: theme.spacing.xs,
		minWidth: 200,
		overflow: "hidden" as const,
		...(position
			? {
					position: "absolute" as const,
					top: position.top,
					right: position.right,
				}
			: null),
	}),
	item: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing.md,
		paddingHorizontal: theme.spacing.lg,
		paddingVertical: theme.spacing.md,
	},
	itemPressed: {
		backgroundColor: theme.colors.surfacePressed,
	},
}));
