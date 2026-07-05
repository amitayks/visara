import {
	coerceEnrichment,
	extractFirstJsonObject,
	MAX_TAGS,
	RAW_CAPTION_MAX_CHARS,
} from "@backend/engine/parseEnrichment";
import { describe, expect, it } from "@jest/globals";

/** Parse exactly as the engine does: extract, then coerce with raw fallback. */
function parse(raw: string) {
	return coerceEnrichment(extractFirstJsonObject(raw), raw);
}

describe("extractFirstJsonObject — balanced-brace scan", () => {
	it("parses a clean JSON object", () => {
		const raw =
			'{"caption":"A dog on a beach","description":"A golden retriever runs across wet sand.","tags":["dog","beach"],"text":"NO DOGS ALLOWED"}';
		expect(extractFirstJsonObject(raw)).toEqual({
			caption: "A dog on a beach",
			description: "A golden retriever runs across wet sand.",
			tags: ["dog", "beach"],
			text: "NO DOGS ALLOWED",
		});
	});

	it("parses JSON wrapped in a markdown code fence", () => {
		const raw =
			'```json\n{"caption":"City at night","description":"","tags":["city"],"text":""}\n```';
		expect(extractFirstJsonObject(raw)).toEqual({
			caption: "City at night",
			description: "",
			tags: ["city"],
			text: "",
		});
	});

	it("parses JSON surrounded by prose", () => {
		const raw =
			'Sure! Here is the analysis you asked for: {"caption":"A red bike","tags":[]} Hope this helps.';
		expect(extractFirstJsonObject(raw)).toEqual({
			caption: "A red bike",
			tags: [],
		});
	});

	it("handles braces and escaped quotes inside string values", () => {
		const raw =
			'Output: {"caption":"she said \\"hi\\" and drew {curly} art","tags":[]} end';
		const obj = extractFirstJsonObject(raw);
		expect(obj).not.toBeNull();
		expect(obj?.caption).toBe('she said "hi" and drew {curly} art');
	});

	it("skips an earlier non-JSON brace block and finds the real object", () => {
		const raw = '{oops not json} then {"caption":"ok"}';
		expect(extractFirstJsonObject(raw)).toEqual({ caption: "ok" });
	});

	it("returns null when there is no JSON object", () => {
		expect(extractFirstJsonObject("The image shows a sunset.")).toBeNull();
		expect(extractFirstJsonObject("unbalanced { forever")).toBeNull();
		expect(extractFirstJsonObject("")).toBeNull();
	});
});

describe("coerceEnrichment — schema coercion", () => {
	it("keeps all four fields from a complete object", () => {
		const result = parse(
			'{"caption":"A dog","description":"Two sentences here.","tags":["dog"],"text":"EXIT"}',
		);
		expect(result).toEqual({
			caption: "A dog",
			description: "Two sentences here.",
			tags: ["dog"],
			text: "EXIT",
		});
	});

	it("defaults missing keys (caption-only object)", () => {
		expect(parse('{"caption":"Only a caption"}')).toEqual({
			caption: "Only a caption",
			description: "",
			tags: [],
			text: "",
		});
	});

	it("defaults mistyped keys (non-string caption, non-array tags)", () => {
		expect(
			parse('{"caption":42,"description":null,"tags":"dog","text":7}'),
		).toEqual({
			caption: "",
			description: "",
			tags: [],
			text: "",
		});
	});

	it("trims string fields", () => {
		const result = parse('{"caption":"  padded  ","text":"  OCR  "}');
		expect(result.caption).toBe("padded");
		expect(result.text).toBe("OCR");
	});

	describe("tags normalization", () => {
		it("lowercases, trims, dedupes, and drops junk entries", () => {
			const raw = JSON.stringify({
				caption: "x",
				tags: [
					" Dog",
					"dog",
					"DOG",
					"Cat ",
					7,
					null,
					{ text: "Bird" },
					{ label: "Tree" },
					"   ",
					[],
				],
			});
			expect(parse(raw).tags).toEqual(["dog", "cat", "bird", "tree"]);
		});

		it(`caps tags at ${MAX_TAGS}`, () => {
			const tags = Array.from({ length: 30 }, (_, i) => `tag${i}`);
			const raw = JSON.stringify({ caption: "x", tags });
			const result = parse(raw);
			expect(result.tags).toHaveLength(MAX_TAGS);
			expect(result.tags[0]).toBe("tag0");
			expect(result.tags[MAX_TAGS - 1]).toBe(`tag${MAX_TAGS - 1}`);
		});

		it("dedupes case-insensitively before capping", () => {
			const tags = [
				...Array.from({ length: 10 }, (_, i) => `Tag${i}`),
				...Array.from({ length: 10 }, (_, i) => `tag${i}`),
				"unique",
			];
			const result = parse(JSON.stringify({ tags }));
			expect(result.tags).toHaveLength(11);
			expect(result.tags[10]).toBe("unique");
		});
	});

	describe("degraded raw fallback (no JSON)", () => {
		it("stores the whole raw output as the caption", () => {
			const raw = "  The image shows a sunset over the ocean.  ";
			expect(parse(raw)).toEqual({
				caption: "The image shows a sunset over the ocean.",
				description: "",
				tags: [],
				text: "",
			});
		});

		it(`caps the fallback caption at ${RAW_CAPTION_MAX_CHARS} chars`, () => {
			const raw = "x".repeat(RAW_CAPTION_MAX_CHARS + 200);
			const result = parse(raw);
			expect(result.caption).toHaveLength(RAW_CAPTION_MAX_CHARS);
			expect(result.description).toBe("");
		});

		it("empty raw coerces to the all-empty result", () => {
			expect(parse("")).toEqual({
				caption: "",
				description: "",
				tags: [],
				text: "",
			});
		});
	});
});
