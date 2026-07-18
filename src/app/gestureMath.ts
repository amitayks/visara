/**
 * Pure edge-gesture math for the pager shell (page-navigation-core spec).
 *
 * The shell's gesture worklets import these instead of inlining thresholds so
 * the edge rules stay unit-testable. Composition contract for a pan gesture:
 *
 *   onBegin: originX.value = event.x            // pin the touch ORIGIN
 *   onEnd:   isEdgeOrigin(originX.value, screenWidth, edge) &&
 *            isSwipeTriggered({
 *              translation: event.translationX,
 *              velocity: event.velocityX,
 *              screenWidth,
 *            })
 *
 * Edge validity is judged from where the touch BEGAN, never from where it was
 * released: a swipe that starts off-edge (e.g. 200px in) must never fire an
 * edge action no matter how fast or far it ends, and a long swipe that starts
 * on the edge and ends past mid-screen must still fire (the old
 * release-position check silently dropped it).
 */

/** Width in px of the strips at either screen edge where edge swipes may originate. */
export const EDGE_DETECTION_ZONE = 50;

/** A fling faster than this (px/s, magnitude) commits the swipe. */
export const SWIPE_VELOCITY_THRESHOLD = 500;

/** A drag longer than this (px, magnitude) commits the swipe. */
export const SWIPE_DISTANCE_THRESHOLD = 100;

export type EdgeSide = "left" | "right";

export interface SwipeEndInput {
	/** Net translation along the swipe axis at release (event.translationX). */
	translation: number;
	/** Velocity along the swipe axis at release (event.velocityX). */
	velocity: number;
	/** Current screen width in px — the long-swipe (mid-screen) rule needs it. */
	screenWidth: number;
}

/**
 * Whether a touch origin lies inside the `edge` detection zone. Zone bounds
 * are strict, matching the ported worklet logic verbatim (`x < zone` on the
 * left, `x > screenWidth - zone` on the right); the unset-origin sentinel
 * (-1), NaN, and points outside the screen are never edges.
 */
export function isEdgeOrigin(
	x: number,
	screenWidth: number,
	edge: EdgeSide,
	zone?: number,
): boolean {
	"worklet";
	// Defaulted in the body, not the signature: Reanimated's plugin only
	// captures closure identifiers referenced inside the worklet body, so a
	// module-scope constant used as a default parameter value crashes on the
	// UI runtime ("Property 'EDGE_DETECTION_ZONE' doesn't exist").
	const zonePx = zone ?? EDGE_DETECTION_ZONE;
	if (!(x >= 0 && x <= screenWidth)) return false;
	return edge === "left" ? x < zonePx : x > screenWidth - zonePx;
}

/**
 * Whether a released pan commits its edge action. OR of three rules:
 *
 * 1. fast fling — |velocity| > 500 px/s;
 * 2. long-enough drag — |translation| > 100 px;
 * 3. long swipe — travel of at least half the screen. From an edge origin
 *    that means the finger ended past mid-screen, which is unambiguous
 *    commitment even if the fixed 100px constant were ever the larger bound
 *    (narrow windows).
 *
 * Direction is judged by magnitude on purpose: the caller's gesture config
 * (activeOffsetX + edge hitSlop) plus `isEdgeOrigin` already confine which
 * direction can reach this check, and one symmetric function serves both the
 * left-edge (positive) and right-edge (negative) gestures.
 */
export function isSwipeTriggered(input: SwipeEndInput): boolean {
	"worklet";
	const distance = Math.abs(input.translation);
	return (
		Math.abs(input.velocity) > SWIPE_VELOCITY_THRESHOLD ||
		distance > SWIPE_DISTANCE_THRESHOLD ||
		(input.screenWidth > 0 && distance >= input.screenWidth / 2)
	);
}
