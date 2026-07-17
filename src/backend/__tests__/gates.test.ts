import {
	BATTERY_MIN_LEVEL,
	canRunVlm,
	evaluateGates,
	type GateInputs,
	isInNightWindow,
	THERMAL_BLOCK_LEVEL,
	VLM_MIN_TOTAL_MEM_BYTES,
} from "@backend/pipeline/gates";
import { describe, expect, it } from "@jest/globals";

/**
 * Full admission-matrix coverage (processing-pipeline spec): a happy baseline
 * admits; each gate flipped alone blocks with its own PauseReason; boundary
 * values sit on the spec'd side of every threshold.
 */

const GIB = 1024 * 1024 * 1024;

function baseInputs(overrides: Partial<GateInputs> = {}): GateInputs {
	return {
		discoveryComplete: true,
		deliveryReady: true,
		totalMemBytes: 8 * GIB,
		thermalLevel: 0,
		batteryLevel: 0.8,
		charging: false,
		settings: { batterySaverEnabled: false, nightProcessingEnabled: false },
		manualPause: false,
		hourOfDay: 14,
		appActive: true,
		...overrides,
	};
}

describe("evaluateGates", () => {
	it("admits on the happy path with no reason", () => {
		expect(evaluateGates(baseInputs())).toEqual({ admit: true });
	});

	it("blocks on manual pause with reason 'manual'", () => {
		expect(evaluateGates(baseInputs({ manualPause: true }))).toEqual({
			admit: false,
			reason: "manual",
		});
	});

	it("blocks before discovery-complete with reason 'discovery-pending'", () => {
		expect(evaluateGates(baseInputs({ discoveryComplete: false }))).toEqual({
			admit: false,
			reason: "discovery-pending",
		});
	});

	it("blocks when delivery is not ready with reason 'model-not-ready'", () => {
		expect(evaluateGates(baseInputs({ deliveryReady: false }))).toEqual({
			admit: false,
			reason: "model-not-ready",
		});
	});

	it("blocks when the app is not active with reason 'backgrounded'", () => {
		expect(evaluateGates(baseInputs({ appActive: false }))).toEqual({
			admit: false,
			reason: "backgrounded",
		});
	});

	describe("thermal", () => {
		it("blocks at serious (2) with reason 'thermal'", () => {
			expect(evaluateGates(baseInputs({ thermalLevel: 2 }))).toEqual({
				admit: false,
				reason: "thermal",
			});
		});

		it("blocks at critical (3)", () => {
			expect(evaluateGates(baseInputs({ thermalLevel: 3 })).reason).toBe(
				"thermal",
			);
		});

		it("admits at fair (1)", () => {
			expect(evaluateGates(baseInputs({ thermalLevel: 1 })).admit).toBe(true);
		});

		it("exposes the block threshold as serious (2)", () => {
			expect(THERMAL_BLOCK_LEVEL).toBe(2);
		});
	});

	describe("battery", () => {
		it("blocks below 20% on battery with reason 'battery'", () => {
			expect(
				evaluateGates(baseInputs({ batteryLevel: 0.15, charging: false })),
			).toEqual({ admit: false, reason: "battery" });
		});

		it("blocks at exactly 20% on battery (must be strictly above)", () => {
			expect(
				evaluateGates(
					baseInputs({ batteryLevel: BATTERY_MIN_LEVEL, charging: false }),
				).reason,
			).toBe("battery");
		});

		it("admits just above 20% on battery", () => {
			expect(
				evaluateGates(baseInputs({ batteryLevel: 0.21, charging: false }))
					.admit,
			).toBe(true);
		});

		it("admits at 5% when charging (charging overrides the level)", () => {
			expect(
				evaluateGates(baseInputs({ batteryLevel: 0.05, charging: true })).admit,
			).toBe(true);
		});
	});

	describe("battery saver", () => {
		it("blocks when saver is on and not charging, reason 'battery-saver'", () => {
			expect(
				evaluateGates(
					baseInputs({
						settings: {
							batterySaverEnabled: true,
							nightProcessingEnabled: false,
						},
						charging: false,
					}),
				),
			).toEqual({ admit: false, reason: "battery-saver" });
		});

		it("admits when saver is on and charging", () => {
			expect(
				evaluateGates(
					baseInputs({
						settings: {
							batterySaverEnabled: true,
							nightProcessingEnabled: false,
						},
						charging: true,
					}),
				).admit,
			).toBe(true);
		});
	});

	describe("night window", () => {
		const nightOn = {
			batterySaverEnabled: false,
			nightProcessingEnabled: true,
		};

		it("blocks outside 00:00-06:00 when enabled, reason 'night-window'", () => {
			expect(
				evaluateGates(baseInputs({ settings: nightOn, hourOfDay: 14 })),
			).toEqual({ admit: false, reason: "night-window" });
		});

		it("admits at 00:00 when enabled", () => {
			expect(
				evaluateGates(baseInputs({ settings: nightOn, hourOfDay: 0 })).admit,
			).toBe(true);
		});

		it("admits at 05:00 when enabled", () => {
			expect(
				evaluateGates(baseInputs({ settings: nightOn, hourOfDay: 5 })).admit,
			).toBe(true);
		});

		it("blocks at exactly 06:00 when enabled (window is [0, 6))", () => {
			expect(
				evaluateGates(baseInputs({ settings: nightOn, hourOfDay: 6 })).reason,
			).toBe("night-window");
		});

		it("does not gate on the hour when the setting is off", () => {
			expect(evaluateGates(baseInputs({ hourOfDay: 3 })).admit).toBe(true);
			expect(evaluateGates(baseInputs({ hourOfDay: 23 })).admit).toBe(true);
		});

		it("isInNightWindow matches the [0, 6) window", () => {
			expect(isInNightWindow(0)).toBe(true);
			expect(isInNightWindow(5)).toBe(true);
			expect(isInNightWindow(6)).toBe(false);
			expect(isInNightWindow(23)).toBe(false);
		});
	});

	describe("reason precedence", () => {
		it("manual pause outranks every other failing gate", () => {
			expect(
				evaluateGates(
					baseInputs({
						manualPause: true,
						discoveryComplete: false,
						deliveryReady: false,
						thermalLevel: 3,
						batteryLevel: 0,
					}),
				).reason,
			).toBe("manual");
		});

		it("discovery-pending outranks model-not-ready", () => {
			expect(
				evaluateGates(
					baseInputs({ discoveryComplete: false, deliveryReady: false }),
				).reason,
			).toBe("discovery-pending");
		});
	});

	it("does not pause on low RAM — capability is handled via canRunVlm", () => {
		// A 4 GB device with every other gate green still ADMITS here; the
		// pipeline consults canRunVlm separately and takes the skip-all path.
		expect(evaluateGates(baseInputs({ totalMemBytes: 4 * GIB }))).toEqual({
			admit: true,
		});
	});
});

describe("canRunVlm", () => {
	it("pins the floor at 5.5 GiB", () => {
		expect(VLM_MIN_TOTAL_MEM_BYTES).toBe(5.5 * GIB);
	});

	it("admits at exactly the floor", () => {
		expect(canRunVlm(VLM_MIN_TOTAL_MEM_BYTES)).toBe(true);
	});

	it("rejects one byte below the floor", () => {
		expect(canRunVlm(VLM_MIN_TOTAL_MEM_BYTES - 1)).toBe(false);
	});

	it("rejects typical 4 GB devices and admits 8 GB devices", () => {
		expect(canRunVlm(4 * GIB)).toBe(false);
		expect(canRunVlm(8 * GIB)).toBe(true);
	});
});
