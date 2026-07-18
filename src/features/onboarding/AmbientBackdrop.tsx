/**
 * Ambient onboarding backdrop: two soft accent orbs (concentric low-alpha
 * discs faking a glow falloff — no gradient dependency) drifting on slow,
 * opposing loops behind the pager. Purely decorative, never interactive.
 */

import { StyleSheet } from "@ui/theme";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

const DRIFT_MS = 14000;

function Orb({
	size,
	drift,
	style,
}: {
	size: number;
	/** Peak drift offset in px; sign sets the direction of travel. */
	drift: number;
	style: object;
}) {
	const progress = useSharedValue(0);

	useEffect(() => {
		progress.value = withRepeat(
			withTiming(1, {
				duration: DRIFT_MS,
				easing: Easing.inOut(Easing.sin),
			}),
			-1,
			true,
		);
	}, [progress]);

	const driftStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: drift * progress.value },
			{ translateY: -drift * 0.6 * progress.value },
		],
	}));

	return (
		<Animated.View style={[style, driftStyle]}>
			<View style={styles.disc(size, 0.05)}>
				<View style={styles.disc(size * 0.72, 0.06)}>
					<View style={styles.disc(size * 0.45, 0.07)} />
				</View>
			</View>
		</Animated.View>
	);
}

export function AmbientBackdrop() {
	return (
		<View style={styles.fill} pointerEvents="none">
			<Orb size={340} drift={22} style={styles.orbTop} />
			<Orb size={420} drift={-18} style={styles.orbBottom} />
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	fill: {
		...StyleSheet.absoluteFillObject,
		overflow: "hidden",
	},
	orbTop: {
		position: "absolute",
		top: -110,
		right: -120,
	},
	orbBottom: {
		position: "absolute",
		bottom: -150,
		left: -140,
	},
	disc: (size: number, alpha: number) => ({
		width: size,
		height: size,
		borderRadius: theme.radii.full,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		backgroundColor: `${theme.colors.accent}${Math.round(alpha * 255)
			.toString(16)
			.padStart(2, "0")}`,
	}),
}));
