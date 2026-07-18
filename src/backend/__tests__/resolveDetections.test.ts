import { resolveDetectedNames } from "@backend/repo/resolveDetections";
import { describe, expect, it } from "@jest/globals";

const KNOWN = [
	{ id: "ent_1", name: "Biscuit" },
	{ id: "ent_2", name: "Loomis Coffee" },
	{ id: "ent_3", name: "  Padded  " },
];

describe("resolveDetectedNames — hallucination guard", () => {
	it("resolves case-insensitively and preserves reported order", () => {
		expect(resolveDetectedNames(["loomis coffee", "BISCUIT"], KNOWN)).toEqual([
			"ent_2",
			"ent_1",
		]);
	});

	it("drops names that do not exist in the store", () => {
		expect(resolveDetectedNames(["Biscuit", "Rex", "Atlantis"], KNOWN)).toEqual(
			["ent_1"],
		);
	});

	it("dedupes repeated reports of the same entity", () => {
		expect(
			resolveDetectedNames(["Biscuit", "biscuit", " BISCUIT "], KNOWN),
		).toEqual(["ent_1"]);
	});

	it("matches ignoring surrounding whitespace on both sides", () => {
		expect(resolveDetectedNames(["padded"], KNOWN)).toEqual(["ent_3"]);
	});

	it("returns [] for empty inputs and never invents matches", () => {
		expect(resolveDetectedNames([], KNOWN)).toEqual([]);
		expect(resolveDetectedNames(["Biscuit"], [])).toEqual([]);
		expect(resolveDetectedNames([""], KNOWN)).toEqual([]);
	});

	it("first store entry wins on duplicate names in the store", () => {
		const dupes = [
			{ id: "ent_a", name: "Twin" },
			{ id: "ent_b", name: "twin" },
		];
		expect(resolveDetectedNames(["TWIN"], dupes)).toEqual(["ent_a"]);
	});
});
