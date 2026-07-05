import { EMBEDDING_DIMS, truncateAndRenormalize } from "@backend/engine/vector";
import { describe, expect, it } from "@jest/globals";

function l2Norm(vec: Float32Array): number {
	let sumSquares = 0;
	for (let i = 0; i < vec.length; i++) {
		sumSquares += vec[i] * vec[i];
	}
	return Math.sqrt(sumSquares);
}

describe("truncateAndRenormalize — MRL 768→256 (gemma-embedding-index)", () => {
	it("truncates a 768-d vector to EMBEDDING_DIMS", () => {
		const source = Array.from({ length: 768 }, (_, i) => i + 1);
		const out = truncateAndRenormalize(source, EMBEDDING_DIMS);
		expect(out).not.toBeNull();
		expect(out).toBeInstanceOf(Float32Array);
		expect(out?.length).toBe(EMBEDDING_DIMS);
	});

	it("produces a unit vector (L2 norm ≈ 1.0)", () => {
		const source = Array.from({ length: 768 }, (_, i) => Math.sin(i + 1));
		const out = truncateAndRenormalize(source, EMBEDDING_DIMS);
		expect(out).not.toBeNull();
		if (out === null) {
			throw new Error("unreachable");
		}
		expect(Math.abs(l2Norm(out) - 1)).toBeLessThan(1e-5);
	});

	it("preserves direction (components stay proportional)", () => {
		const source = Array.from({ length: 768 }, (_, i) => i + 1);
		const out = truncateAndRenormalize(source, EMBEDDING_DIMS);
		if (out === null) {
			throw new Error("unreachable");
		}
		// source[10] / source[0] === 11; the ratio must survive renormalization.
		expect(out[10] / out[0]).toBeCloseTo(11, 4);
		expect(out[0]).toBeGreaterThan(0);
	});

	it("uniform vector renormalizes to 1/sqrt(dims) components", () => {
		const source = new Array(768).fill(2);
		const out = truncateAndRenormalize(source, EMBEDDING_DIMS);
		if (out === null) {
			throw new Error("unreachable");
		}
		const expected = 1 / Math.sqrt(EMBEDDING_DIMS);
		expect(Math.abs(out[0] - expected)).toBeLessThan(1e-6);
		expect(Math.abs(out[EMBEDDING_DIMS - 1] - expected)).toBeLessThan(1e-6);
	});

	it("accepts an exactly-256-d source and Float32Array input", () => {
		const source = new Float32Array(EMBEDDING_DIMS);
		for (let i = 0; i < source.length; i++) {
			source[i] = i % 7 === 0 ? -1 : 0.5;
		}
		const out = truncateAndRenormalize(source, EMBEDDING_DIMS);
		expect(out?.length).toBe(EMBEDDING_DIMS);
		expect(Math.abs(l2Norm(out as Float32Array) - 1)).toBeLessThan(1e-5);
	});

	it("guards the zero vector → null", () => {
		expect(
			truncateAndRenormalize(new Array(768).fill(0), EMBEDDING_DIMS),
		).toBeNull();
	});

	it("guards a numerically-negligible vector → null", () => {
		expect(
			truncateAndRenormalize(new Array(768).fill(1e-12), EMBEDDING_DIMS),
		).toBeNull();
	});

	it("rejects sources shorter than the target dims → null", () => {
		expect(
			truncateAndRenormalize(
				new Array(EMBEDDING_DIMS - 1).fill(1),
				EMBEDDING_DIMS,
			),
		).toBeNull();
		expect(truncateAndRenormalize([], EMBEDDING_DIMS)).toBeNull();
	});

	it("rejects non-finite components → null", () => {
		const withNaN = Array.from({ length: 768 }, (_, i) => (i === 5 ? NaN : 1));
		expect(truncateAndRenormalize(withNaN, EMBEDDING_DIMS)).toBeNull();
		const withInf = Array.from({ length: 768 }, (_, i) =>
			i === 100 ? Number.POSITIVE_INFINITY : 1,
		);
		expect(truncateAndRenormalize(withInf, EMBEDDING_DIMS)).toBeNull();
	});

	it("ignores values beyond the truncation point (true MRL truncation)", () => {
		const base = Array.from({ length: 768 }, (_, i) => i + 1);
		const mutatedTail = base.slice();
		for (let i = EMBEDDING_DIMS; i < 768; i++) {
			mutatedTail[i] = -999;
		}
		const a = truncateAndRenormalize(base, EMBEDDING_DIMS);
		const b = truncateAndRenormalize(mutatedTail, EMBEDDING_DIMS);
		expect(a).toEqual(b);
	});
});
