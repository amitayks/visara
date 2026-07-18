/**
 * Shared onboarding step scaffold: layered hero glyph, large title, centered
 * description, and a content slot. The step reveals when it becomes the
 * active page — hero springs up, content fades in — driven by `isActive`
 * from the pager, so Next and swipes trigger it alike.
 */

import { Icon, Text } from "@ui/components";
import { motion, StyleSheet } from "@ui/theme";
import { type ReactNode, useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

export type StepTint = "accent" | "success";

export interface StepScaffoldProps {
	/** Material Design Icons glyph name for the hero. */
	icon: string;
	title: string;
	description: string;
	/** True only while this step is the pager's current page. */
	isActive: boolean;
	/** Hero tint; the completion step celebrates in success green. */
	tint?: StepTint;
	children?: ReactNode;
}

export function StepScaffold({
	icon,
	title,
	description,
	isActive,
	tint = "accent",
	children,
}: StepScaffoldProps) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = isActive
			? withSpring(1, motion.spring.gentle)
			: withTiming(0, { duration: motion.duration.fast });
	}, [isActive, progress]);

	const heroAnimatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ scale: 0.85 + 0.15 * progress.value }],
	}));
	const contentAnimatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateY: 16 * (1 - progress.value) }],
	}));

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
			showsVerticalScrollIndicator={false}
		>
			<Animated.View style={[styles.hero, heroAnimatedStyle]}>
				<View style={styles.heroOuter(tint)}>
					<View style={styles.heroInner(tint)}>
						<Icon name={icon} size={56} color="textOnAccent" />
					</View>
				</View>
			</Animated.View>

			<Animated.View style={[styles.content, contentAnimatedStyle]}>
				<Text variant="largeTitle" style={styles.centered}>
					{title}
				</Text>
				<Text variant="subhead" color="textSecondary" style={styles.centered}>
					{description}
				</Text>
				{children ? <View style={styles.body}>{children}</View> : null}
			</Animated.View>
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	scroll: {
		flex: 1,
	},
	scrollContent: {
		flexGrow: 1,
		justifyContent: "center",
		paddingHorizontal: theme.spacing.xxl,
		paddingVertical: theme.spacing.xl,
	},
	hero: {
		alignItems: "center",
		marginBottom: theme.spacing.xxl,
	},
	heroOuter: (tint: StepTint) => ({
		width: 176,
		height: 176,
		borderRadius: theme.radii.full,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		backgroundColor:
			tint === "success"
				? `${theme.colors.success}29`
				: theme.colors.accentMuted,
	}),
	heroInner: (tint: StepTint) => ({
		width: 120,
		height: 120,
		borderRadius: theme.radii.full,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		backgroundColor:
			tint === "success" ? theme.colors.success : theme.colors.accent,
	}),
	content: {
		gap: theme.spacing.md,
	},
	centered: {
		textAlign: "center",
	},
	body: {
		marginTop: theme.spacing.xl,
		gap: theme.spacing.md,
	},
}));
