import { describe, expect, it } from "@jest/globals";
import {
	EDGE_DETECTION_ZONE,
	type EdgeSide,
	isEdgeOrigin,
	isSwipeTriggered,
	SWIPE_DISTANCE_THRESHOLD,
	SWIPE_VELOCITY_THRESHOLD,
} from "../gestureMath";

/** Portrait-phone-ish logical width used across the matrix. */
const W = 400;

describe("isEdgeOrigin — origin-judged 50px zones (page-navigation-core)", () => {
	describe("left edge on a 400px screen", () => {
		it.each([0, 1, 25, 49, 49.9])("origin x=%p is inside the zone", (x) => {
			expect(isEdgeOrigin(x, W, "left")).toBe(true);
		});

		it.each([50, 51, 100, 200, 399, 400])("origin x=%p is outside", (x) => {
			expect(isEdgeOrigin(x, W, "left")).toBe(false);
		});
	});

	describe("right edge on a 400px screen", () => {
		it.each([350.1, 351, 375, 399, 400])(
			"origin x=%p is inside the zone",
			(x) => {
				expect(isEdgeOrigin(x, W, "right")).toBe(true);
			},
		);

		it.each([350, 349, 200, 50, 0])("origin x=%p is outside", (x) => {
			expect(isEdgeOrigin(x, W, "right")).toBe(false);
		});
	});

	it("the unset-origin sentinel (-1) is never an edge", () => {
		expect(isEdgeOrigin(-1, W, "left")).toBe(false);
		expect(isEdgeOrigin(-1, W, "right")).toBe(false);
	});

	it("origins outside the screen bounds are never edges", () => {
		expect(isEdgeOrigin(-5, W, "left")).toBe(false);
		expect(isEdgeOrigin(W + 1, W, "right")).toBe(false);
		expect(isEdgeOrigin(W + 40, W, "right")).toBe(false);
	});

	it("a NaN origin is never an edge", () => {
		expect(isEdgeOrigin(Number.NaN, W, "left")).toBe(false);
		expect(isEdgeOrigin(Number.NaN, W, "right")).toBe(false);
	});

	it("the right zone is anchored to the actual screen width", () => {
		// 351 is an edge origin on a 400px screen but mid-screen on an 800px one.
		expect(isEdgeOrigin(351, 400, "right")).toBe(true);
		expect(isEdgeOrigin(351, 800, "right")).toBe(false);
		expect(isEdgeOrigin(751, 800, "right")).toBe(true);
		expect(isEdgeOrigin(750, 800, "right")).toBe(false);
	});

	it("zone width is parameterizable and defaults to 50", () => {
		expect(EDGE_DETECTION_ZONE).toBe(50);
		expect(isEdgeOrigin(75, W, "left", 100)).toBe(true);
		expect(isEdgeOrigin(75, W, "left")).toBe(false);
		expect(isEdgeOrigin(W - 75, W, "right", 100)).toBe(true);
		expect(isEdgeOrigin(W - 75, W, "right")).toBe(false);
	});
});

describe("isSwipeTriggered — velocity>500 OR distance>100 OR past-mid-screen", () => {
	const swipe = (translation: number, velocity: number, screenWidth = W) =>
		isSwipeTriggered({ translation, velocity, screenWidth });

	it.each<[number, number, boolean]>([
		// [translation, velocity, expected]
		[0, 501, true], // fast fling with barely any travel
		[0, 500, false], // velocity bound is strictly greater-than
		[0, 499, false],
		[101, 0, true], // long-enough drag with no speed
		[100, 0, false], // distance bound is strictly greater-than
		[99, 0, false],
		[99, 499, false], // both just under: no trigger
		[101, 501, true],
		[50, 200, false], // ordinary weak pan → spring reset case
		[0, 0, false],
	])("translation=%p velocity=%p → %p", (translation, velocity, expected) => {
		expect(swipe(translation, velocity)).toBe(expected);
	});

	it("judges the right-edge direction (negative values) by magnitude", () => {
		expect(swipe(-20, -600)).toBe(true); // fling toward the left
		expect(swipe(-120, -50)).toBe(true); // drag past the distance bound
		expect(swipe(-99, -499)).toBe(false);
		expect(swipe(-100, -500)).toBe(false); // strict bounds hold mirrored too
	});

	it("a long swipe ending past mid-screen counts (screenWidth-aware rule)", () => {
		// On a narrow window the half-screen rule fires below the fixed 100px rule:
		expect(swipe(95, 0, 180)).toBe(true); // 95 ≥ 90 = mid, though 95 ≤ 100
		expect(swipe(-95, 0, 180)).toBe(true); // mirrored for the right edge
		expect(swipe(89, 0, 180)).toBe(false); // short of the midline
		expect(swipe(100, 0, 200)).toBe(true); // exactly half-screen travel counts
	});

	it("spec scenario: a slow deliberate swipe across a 400px screen triggers", () => {
		// Started on the edge, ended past mid-screen with distance > 100 —
		// previously dropped by the release-position check.
		expect(swipe(250, 120)).toBe(true);
	});

	it("a degenerate screenWidth never auto-triggers", () => {
		expect(swipe(0, 0, 0)).toBe(false);
		expect(swipe(10, 0, -1)).toBe(false);
	});

	it("exports the pinned thresholds", () => {
		expect(SWIPE_VELOCITY_THRESHOLD).toBe(500);
		expect(SWIPE_DISTANCE_THRESHOLD).toBe(100);
	});
});

describe("composed page-navigation-core scenarios (shell usage)", () => {
	/** Exactly how the shell composes the two checks in its onEnd worklet. */
	const edgeSwipeFires = (
		originX: number,
		edge: EdgeSide,
		translation: number,
		velocity: number,
		screenWidth = W,
	) =>
		isEdgeOrigin(originX, screenWidth, edge) &&
		isSwipeTriggered({ translation, velocity, screenWidth });

	it("long left-edge swipe ending past mid-screen activates search", () => {
		expect(edgeSwipeFires(30, "left", 250, 120)).toBe(true);
	});

	it("right-edge swipe meeting either threshold opens Settings", () => {
		expect(edgeSwipeFires(380, "right", -40, -700)).toBe(true); // velocity path
		expect(edgeSwipeFires(380, "right", -140, -80)).toBe(true); // distance path
	});

	it("a swipe starting 200px from the edge NEVER fires, regardless of velocity", () => {
		expect(edgeSwipeFires(200, "left", 300, 9000)).toBe(false);
		expect(edgeSwipeFires(200, "right", -300, -9000)).toBe(false);
	});

	it("an edge origin with a weak release does not fire (spring reset instead)", () => {
		expect(edgeSwipeFires(10, "left", 60, 200)).toBe(false);
		expect(edgeSwipeFires(390, "right", -60, -200)).toBe(false);
	});

	it("origin decides, not the release position: same release, opposite outcomes", () => {
		const release = { translation: 260, velocity: 90 };
		expect(
			edgeSwipeFires(20, "left", release.translation, release.velocity),
		).toBe(true);
		expect(
			edgeSwipeFires(120, "left", release.translation, release.velocity),
		).toBe(false);
	});
});
