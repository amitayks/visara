/**
 * Spring Animation Configurations for Reanimated
 *
 * Provides pre-configured spring animation configs for consistent
 * animation behavior across the app. Used with withSpring() from Reanimated.
 *
 * Usage:
 * ```tsx
 * import { withSpring } from 'react-native-reanimated';
 * import { SpringConfigs } from '@utils/animations/springConfig';
 *
 * scale.value = withSpring(1, SpringConfigs.gentle);
 * ```
 *
 * Constitutional alignment:
 * - User Experience Excellence: Smooth 60fps animations
 * - Performance & Optimization Standards: Optimized animation configs
 */

export interface SpringConfig {
	damping: number;
	stiffness: number;
}

/**
 * Gentle spring animation
 * Best for: Subtle UI transitions, fades, smooth scaling
 * Feel: Soft, gradual, no overshoot
 */
export const gentleSpring: SpringConfig = {
	damping: 30,
	stiffness: 200,
};

/**
 * Snappy spring animation
 * Best for: Button presses, drawer open/close, modal appearance
 * Feel: Quick, responsive, slight bounce
 */
export const snappySpring: SpringConfig = {
	damping: 15,
	stiffness: 300,
};

/**
 * Bouncy spring animation
 * Best for: Playful interactions, attention-grabbing effects
 * Feel: Energetic, noticeable bounce, fun
 */
export const bouncySpring: SpringConfig = {
	damping: 10,
	stiffness: 400,
};

/**
 * Modal spring animation
 * Optimized for modal open/close animations
 * Feel: Quick but smooth, professional
 */
export const modalSpring: SpringConfig = {
	damping: 20,
	stiffness: 250,
};

/**
 * Drawer spring animation
 * Optimized for drawer slide-in/out animations
 * Feel: Smooth sliding with slight deceleration
 */
export const drawerSpring: SpringConfig = {
	damping: 25,
	stiffness: 280,
};

/**
 * Spring configuration collection
 * Exported for backward compatibility with existing code
 */
export const SpringConfigs = {
	gentle: gentleSpring,
	snappy: snappySpring,
	bouncy: bouncySpring,
	modal: modalSpring,
	drawer: drawerSpring,
};

/**
 * Default spring config for general use
 */
export const defaultSpring = snappySpring;
