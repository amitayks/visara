/**
 * Shared onboarding step scaffold: haloed hero glyph over the ambient
 * backdrop, large title, centered description, content slot. Reveal is
 * staggered — hero springs in and starts a slow float, then title,
 * description, and body cascade up in turn — driven by `isActive` from the
 * pager so Next and swipes trigger it alike.
 */

import { Icon, Text } from "@ui/components";
import { motion, StyleSheet } from "@ui/theme";
import { type ReactNode, useEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSpring,
	withTiming,
} from "react-native-reanimated";

const FLOAT_MS = 2600;
const STAGGER_MS = 70;

/** Cascading reveal block: fades and rises with a per-order delay. */
function Reveal({
	order,
	isActive,
	children,
	style,
}: {
	order: number;
	isActive: boolean;
	children: ReactNode;
	style?: object;
}) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = isActive
			? withDelay(order * STAGGER_MS, withSpring(1, motion.spring.gentle))
			: withTiming(0, { duration: motion.duration.fast });
	}, [isActive, order, progress]);

	const animatedStyle = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateY: 18 * (1 - progress.value) }],
	}));

	return (
		<Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
	);
}

export interface StepScaffoldProps {
	/** Material Design Icons glyph name for the hero. */
	icon: string;
	title: string;
	description: string;
	/** True only while this step is the pager's current page. */
	isActive: boolean;
	children?: ReactNode;
}

export function StepScaffold({
	icon,
	title,
	description,
	isActive,
	children,
}: StepScaffoldProps) {
	const entrance = useSharedValue(0);
	const float = useSharedValue(0);

	useEffect(() => {
		if (isActive) {
			entrance.value = withSpring(1, motion.spring.gentle);
			float.value = withRepeat(
				withTiming(1, { duration: FLOAT_MS, easing: Easing.inOut(Easing.sin) }),
				-1,
				true,
			);
		} else {
			entrance.value = withTiming(0, { duration: motion.duration.fast });
			float.value = withTiming(0, { duration: motion.duration.fast });
		}
	}, [isActive, entrance, float]);

	const heroAnimatedStyle = useAnimatedStyle(() => ({
		opacity: entrance.value,
		transform: [
			{ scale: 0.82 + 0.18 * entrance.value },
			{ translateY: -6 + 12 * float.value },
		],
	}));

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={styles.scrollContent}
			showsVerticalScrollIndicator={false}
		>
			<Animated.View style={[styles.hero, heroAnimatedStyle]}>
				<View style={styles.heroHalo}>
					<View style={styles.heroGlow}>
						<View style={styles.heroCore}>
							<Icon name={icon} size={52} color="textOnAccent" />
						</View>
					</View>
				</View>
			</Animated.View>

			<Reveal order={1} isActive={isActive}>
				<Text variant="largeTitle" style={styles.centered}>
					{title}
				</Text>
			</Reveal>
			<Reveal order={2} isActive={isActive} style={styles.description}>
				<Text variant="subhead" color="textSecondary" style={styles.centered}>
					{description}
				</Text>
			</Reveal>
			{children ? (
				<Reveal order={3} isActive={isActive} style={styles.body}>
					{children}
				</Reveal>
			) : null}
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
	heroHalo: {
		width: 196,
		height: 196,
		borderRadius: theme.radii.full,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1.5,
		borderColor: `${theme.colors.accent}33`,
	},
	heroGlow: {
		width: 156,
		height: 156,
		borderRadius: theme.radii.full,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.accentMuted,
	},
	heroCore: {
		width: 104,
		height: 104,
		borderRadius: theme.radii.full,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.accent,
	},
	centered: {
		textAlign: "center",
	},
	description: {
		marginTop: theme.spacing.md,
	},
	body: {
		marginTop: theme.spacing.xxl,
		gap: theme.spacing.md,
	},
}));
