import { buildFtsQuery, rrfFuse } from "@backend/search/Search";
import { describe, expect, it } from "@jest/globals";

describe("buildFtsQuery", () => {
	it("quotes tokens, joins with implicit AND, prefix-stars the last token", () => {
		expect(buildFtsQuery("golden retr")).toBe('"golden" "retr"*');
	});

	it("prefix-stars a single token", () => {
		expect(buildFtsQuery("beach")).toBe('"beach"*');
	});

	it("strips FTS5 syntax characters inside tokens", () => {
		expect(buildFtsQuery('gol*den (retr:^") pup')).toBe(
			'"golden" "retr" "pup"*',
		);
	});

	it("drops ALL-CAPS keyword operators but keeps lowercase words", () => {
		expect(buildFtsQuery("cat AND dog")).toBe('"cat" "dog"*');
		expect(buildFtsQuery("black and white")).toBe('"black" "and" "white"*');
		expect(buildFtsQuery("NEAR OR NOT AND")).toBeNull();
	});

	it("drops tokens with no letters or digits", () => {
		expect(buildFtsQuery("beach !!!")).toBe('"beach"*');
		expect(buildFtsQuery("--- ...")).toBeNull();
	});

	it("returns null for empty and whitespace-only input", () => {
		expect(buildFtsQuery("")).toBeNull();
		expect(buildFtsQuery("   \t\n ")).toBeNull();
	});

	it("returns null when stripping leaves nothing", () => {
		expect(buildFtsQuery('*():^"')).toBeNull();
	});

	it("ignores surrounding and repeated whitespace", () => {
		expect(buildFtsQuery("  golden   retr  ")).toBe('"golden" "retr"*');
	});

	it("keeps non-Latin scripts", () => {
		expect(buildFtsQuery("חוף ים")).toBe('"חוף" "ים"*');
	});

	it("keeps digits and safe intra-token punctuation", () => {
		expect(buildFtsQuery("IMG_2024 e-mail")).toBe('"IMG_2024" "e-mail"*');
	});
});

describe("rrfFuse", () => {
	it("ranks a both-arm hit above single-arm hits", () => {
		// b: 1/61 + 1/62 beats a: 1/61, d: 1/62, c: 1/63.
		expect(rrfFuse(["a", "b", "c"], ["b", "d"])).toEqual(["b", "a", "d", "c"]);
	});

	it("interleaves disjoint arms by rank", () => {
		// Rank 1s (1/61) before rank 2s (1/62); ties broken by id.
		expect(rrfFuse(["a", "c"], ["b", "d"])).toEqual(["a", "b", "c", "d"]);
	});

	it("passes a single arm through unchanged", () => {
		expect(rrfFuse(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
		expect(rrfFuse([], ["x", "y"])).toEqual(["x", "y"]);
	});

	it("returns empty for two empty arms", () => {
		expect(rrfFuse([], [])).toEqual([]);
	});

	it("breaks exact score ties by id, independent of contributing arm", () => {
		expect(rrfFuse(["a"], ["b"])).toEqual(["a", "b"]);
		expect(rrfFuse(["b"], ["a"])).toEqual(["a", "b"]);
	});

	it("is deterministic for mirrored arms (equal score, equal combined rank)", () => {
		// a and b both score 1/61 + 1/62 with combined rank 3 → id order.
		expect(rrfFuse(["a", "b"], ["b", "a"])).toEqual(["a", "b"]);
		expect(rrfFuse(["b", "a"], ["a", "b"])).toEqual(["a", "b"]);
	});

	it("breaks exact score ties by combined rank before id", () => {
		// k=0 makes scores exactly equal: y = 1/1, z = 1/1, x = 1/2 + 1/2.
		// Combined ranks: y=1, z=1, x=4 → x last despite id order; y/z by id.
		expect(rrfFuse(["y", "x"], ["z", "x"], 0)).toEqual(["y", "z", "x"]);
	});

	it("counts duplicate ids within one arm once, at first position", () => {
		expect(rrfFuse(["a", "a", "b"], [])).toEqual(["a", "b"]);
	});
});
