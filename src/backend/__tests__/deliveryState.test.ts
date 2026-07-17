import {
	aggregateBytes,
	buildArtifactStates,
	classifyArtifactOnDisk,
	deriveStatus,
	diskPreflight,
	type PersistedDeliveryV2,
	parsePersistedDelivery,
	remainingBytes,
	serializePersistedDelivery,
} from "@backend/model/deliveryState";
import {
	DISK_HEADROOM_BYTES,
	MODEL_MANIFEST,
	MODEL_TOTAL_BYTES,
} from "@backend/model/manifest";
import type { ArtifactState, ModelArtifactKey } from "@backend/types";
import { describe, expect, it } from "@jest/globals";

/**
 * Pure state-reduction tests for model delivery v2 (gemma-model-delivery
 * spec). deliveryState.ts is deliberately native-free, so nothing here mocks
 * RNFS / the background downloader / MMKV.
 */

const GB = 1024 ** 3;

function artifact(
	key: ModelArtifactKey,
	overrides: Partial<Omit<ArtifactState, "key">> = {},
): ArtifactState {
	return {
		key,
		filename: `${key}.gguf`,
		bytesTotal: 1000,
		bytesDownloaded: 0,
		verified: false,
		failed: false,
		...overrides,
	};
}

describe("buildArtifactStates", () => {
	it("maps the pinned manifest to fresh unverified artifact states", () => {
		const states = buildArtifactStates(MODEL_MANIFEST);
		expect(states).toHaveLength(3);
		expect(states.map((s) => s.key)).toEqual(["vlm", "mmproj", "embedder"]);
		for (const [index, state] of states.entries()) {
			const pinned = MODEL_MANIFEST.artifacts[index];
			expect(state.filename).toBe(pinned.filename);
			expect(state.bytesTotal).toBe(pinned.bytes);
			expect(state.bytesDownloaded).toBe(0);
			expect(state.verified).toBe(false);
			expect(state.failed).toBe(false);
		}
	});
});

describe("deriveStatus", () => {
	const fresh = [artifact("vlm"), artifact("mmproj"), artifact("embedder")];

	it("is idle for a fresh artifact set with no activity", () => {
		expect(
			deriveStatus({
				artifacts: fresh,
				activeTaskCount: 0,
				paused: false,
				verifying: false,
			}),
		).toBe("idle");
	});

	it("never reports ready for an empty artifact list", () => {
		expect(
			deriveStatus({
				artifacts: [],
				activeTaskCount: 0,
				paused: false,
				verifying: false,
			}),
		).toBe("idle");
	});

	it("is ready only when every artifact is verified", () => {
		const twoOfThree = [
			artifact("vlm", { verified: true }),
			artifact("mmproj", { verified: true }),
			artifact("embedder"),
		];
		expect(
			deriveStatus({
				artifacts: twoOfThree,
				activeTaskCount: 0,
				paused: false,
				verifying: false,
			}),
		).toBe("idle");

		const all = twoOfThree.map((a) => ({ ...a, verified: true }));
		expect(
			deriveStatus({
				artifacts: all,
				activeTaskCount: 0,
				paused: false,
				verifying: false,
			}),
		).toBe("ready");
	});

	it("ready wins over stale activity flags", () => {
		const all = fresh.map((a) => ({ ...a, verified: true }));
		expect(
			deriveStatus({
				artifacts: all,
				activeTaskCount: 0,
				paused: true,
				verifying: true,
			}),
		).toBe("ready");
	});

	it("reports downloading while tasks are live, paused when user-paused", () => {
		expect(
			deriveStatus({
				artifacts: fresh,
				activeTaskCount: 3,
				paused: false,
				verifying: false,
			}),
		).toBe("downloading");
		expect(
			deriveStatus({
				artifacts: fresh,
				activeTaskCount: 3,
				paused: true,
				verifying: false,
			}),
		).toBe("paused");
	});

	it("a failed artifact does not mask transfers still running", () => {
		const oneFailed = [
			artifact("vlm", { failed: true }),
			artifact("mmproj", { bytesDownloaded: 500 }),
			artifact("embedder"),
		];
		expect(
			deriveStatus({
				artifacts: oneFailed,
				activeTaskCount: 2,
				paused: false,
				verifying: false,
			}),
		).toBe("downloading");
	});

	it("is verifying while a hash runs and nothing downloads", () => {
		expect(
			deriveStatus({
				artifacts: fresh,
				activeTaskCount: 0,
				paused: false,
				verifying: true,
			}),
		).toBe("verifying");
	});

	it("is failed when an artifact failed and nothing is active", () => {
		const oneFailed = [
			artifact("vlm", { failed: true }),
			artifact("mmproj", { verified: true }),
			artifact("embedder", { verified: true }),
		];
		expect(
			deriveStatus({
				artifacts: oneFailed,
				activeTaskCount: 0,
				paused: false,
				verifying: false,
			}),
		).toBe("failed");
	});

	it("walks the happy-path lifecycle idle → downloading → verifying → ready", () => {
		let artifacts = [artifact("vlm"), artifact("mmproj"), artifact("embedder")];
		const at = (activeTaskCount: number, verifying: boolean) =>
			deriveStatus({ artifacts, activeTaskCount, paused: false, verifying });

		expect(at(0, false)).toBe("idle");
		expect(at(3, false)).toBe("downloading");
		artifacts = artifacts.map((a) => ({ ...a, bytesDownloaded: a.bytesTotal }));
		expect(at(0, true)).toBe("verifying");
		artifacts = artifacts.map((a) => ({ ...a, verified: true }));
		expect(at(0, false)).toBe("ready");
	});
});

describe("aggregateBytes / remainingBytes", () => {
	it("sums totals and clamps per-artifact downloaded bytes", () => {
		const artifacts = [
			artifact("vlm", { bytesTotal: 3000, bytesDownloaded: 1500 }),
			artifact("mmproj", { bytesTotal: 500, bytesDownloaded: 900 }), // over-report
			artifact("embedder", { bytesTotal: 300, bytesDownloaded: -5 }), // garbage
		];
		expect(aggregateBytes(artifacts)).toEqual({
			bytesTotal: 3800,
			bytesDownloaded: 2000,
		});
	});

	it("counts verified artifacts as fully downloaded even at 0 transferred", () => {
		// Adopted pre-placed files: never transferred a byte, complete on disk.
		const artifacts = [
			artifact("vlm", { bytesTotal: 3000, verified: true }),
			artifact("mmproj", { bytesTotal: 500, bytesDownloaded: 100 }),
		];
		expect(aggregateBytes(artifacts)).toEqual({
			bytesTotal: 3500,
			bytesDownloaded: 3100,
		});
	});

	it("remainingBytes excludes verified artifacts and honors progress", () => {
		const artifacts = [
			artifact("vlm", { bytesTotal: 3000, verified: true }),
			artifact("mmproj", { bytesTotal: 500, bytesDownloaded: 200 }),
			artifact("embedder", { bytesTotal: 300 }),
		];
		expect(remainingBytes(artifacts)).toBe(300 + 300);
	});

	it("a fresh manifest set needs the full pinned total", () => {
		expect(remainingBytes(buildArtifactStates(MODEL_MANIFEST))).toBe(
			MODEL_TOTAL_BYTES,
		);
	});
});

describe("diskPreflight", () => {
	it("blocks the spec scenario: 3 GB free vs 4.5 GB remaining", () => {
		const result = diskPreflight(3 * GB, 4.5 * GB, DISK_HEADROOM_BYTES);
		expect(result.ok).toBe(false);
		expect(result.requiredBytes).toBe(5.5 * GB);
		expect(result.shortfallBytes).toBe(2.5 * GB);
		expect(result.freeBytes).toBe(3 * GB);
	});

	it("passes when free space exactly covers remaining + headroom", () => {
		const result = diskPreflight(5.5 * GB, 4.5 * GB, DISK_HEADROOM_BYTES);
		expect(result.ok).toBe(true);
		expect(result.shortfallBytes).toBe(0);
	});

	it("requires only the remaining bytes, not the full set, on resume", () => {
		// 60% of the VLM already on disk → the gate shrinks accordingly.
		const artifacts = [
			artifact("vlm", { bytesTotal: 3000, bytesDownloaded: 1800 }),
			artifact("mmproj", { bytesTotal: 500, verified: true }),
		];
		const remaining = remainingBytes(artifacts);
		expect(remaining).toBe(1200);
		expect(diskPreflight(1200 + 64, remaining, 64).ok).toBe(true);
		expect(diskPreflight(1200 + 63, remaining, 64).ok).toBe(false);
	});
});

describe("classifyArtifactOnDisk", () => {
	const manifestBytes = 1000;
	const stamp = { size: 1000, mtimeMs: 1_700_000_000_000 };

	it("classifies a missing file as absent", () => {
		expect(classifyArtifactOnDisk({ manifestBytes, file: null })).toEqual({
			kind: "absent",
		});
	});

	it("classifies a size mismatch as a partial transfer (clamped)", () => {
		expect(
			classifyArtifactOnDisk({
				manifestBytes,
				file: { size: 600, mtimeMs: 1 },
			}),
		).toEqual({ kind: "partial", bytesDownloaded: 600 });
		expect(
			classifyArtifactOnDisk({
				manifestBytes,
				file: { size: 4000, mtimeMs: 1 },
			}),
		).toEqual({ kind: "partial", bytesDownloaded: 1000 });
	});

	it("adopts without re-hash when the persisted verified stamp matches", () => {
		expect(
			classifyArtifactOnDisk({
				manifestBytes,
				file: { ...stamp },
				persisted: {
					key: "vlm",
					verified: true,
					failed: false,
					bytesDownloaded: 1000,
					fileSize: stamp.size,
					fileMtimeMs: stamp.mtimeMs,
				},
			}),
		).toEqual({ kind: "adopt-verified" });
	});

	it("re-hashes when the stamp is missing (QA pre-placed file path)", () => {
		expect(
			classifyArtifactOnDisk({ manifestBytes, file: { ...stamp } }),
		).toEqual({ kind: "needs-hash" });
	});

	it("re-hashes when the file changed since verification (mtime drift)", () => {
		expect(
			classifyArtifactOnDisk({
				manifestBytes,
				file: { size: 1000, mtimeMs: stamp.mtimeMs + 1 },
				persisted: {
					key: "vlm",
					verified: true,
					failed: false,
					bytesDownloaded: 1000,
					fileSize: stamp.size,
					fileMtimeMs: stamp.mtimeMs,
				},
			}),
		).toEqual({ kind: "needs-hash" });
	});

	it("re-hashes a full-size file whose persisted flag was never verified", () => {
		expect(
			classifyArtifactOnDisk({
				manifestBytes,
				file: { ...stamp },
				persisted: {
					key: "vlm",
					verified: false,
					failed: false,
					bytesDownloaded: 1000,
					fileSize: stamp.size,
					fileMtimeMs: stamp.mtimeMs,
				},
			}),
		).toEqual({ kind: "needs-hash" });
	});
});

describe("persisted snapshot codec", () => {
	it("round-trips a full snapshot", () => {
		const snapshot: PersistedDeliveryV2 = {
			v: 2,
			status: "failed",
			errorReason: "checksumMismatch",
			artifacts: [
				{
					key: "vlm",
					verified: true,
					failed: false,
					bytesDownloaded: 3000,
					fileSize: 3000,
					fileMtimeMs: 1_700_000_000_000,
				},
				{ key: "mmproj", verified: false, failed: true, bytesDownloaded: 0 },
			],
		};
		expect(
			parsePersistedDelivery(serializePersistedDelivery(snapshot)),
		).toEqual(snapshot);
	});

	it("returns null for empty, malformed, or wrong-version payloads", () => {
		expect(parsePersistedDelivery(null)).toBeNull();
		expect(parsePersistedDelivery(undefined)).toBeNull();
		expect(parsePersistedDelivery("")).toBeNull();
		expect(parsePersistedDelivery("not json")).toBeNull();
		expect(parsePersistedDelivery('"a string"')).toBeNull();
		expect(parsePersistedDelivery('{"v":1,"status":"idle"}')).toBeNull();
		expect(
			parsePersistedDelivery('{"v":2,"status":"notPresent","artifacts":[]}'),
		).toBeNull(); // legacy v1 status name is rejected wholesale
	});

	it("drops malformed artifact entries and unknown error reasons", () => {
		const parsed = parsePersistedDelivery(
			JSON.stringify({
				v: 2,
				status: "downloading",
				errorReason: "somethingElse",
				artifacts: [
					{ key: "vlm", verified: true, failed: false, bytesDownloaded: 10 },
					{ key: "pte", verified: true }, // legacy artifact key
					"garbage",
					{ key: "embedder", bytesDownloaded: "NaN" },
				],
			}),
		);
		expect(parsed).not.toBeNull();
		expect(parsed?.status).toBe("downloading");
		expect(parsed?.errorReason).toBeUndefined();
		expect(parsed?.artifacts).toEqual([
			{ key: "vlm", verified: true, failed: false, bytesDownloaded: 10 },
			{ key: "embedder", verified: false, failed: false, bytesDownloaded: 0 },
		]);
	});

	it("coerces negative or non-finite byte counters to safe values", () => {
		const parsed = parsePersistedDelivery(
			JSON.stringify({
				v: 2,
				status: "idle",
				artifacts: [
					{ key: "vlm", verified: false, failed: false, bytesDownloaded: -50 },
				],
			}),
		);
		expect(parsed?.artifacts[0]?.bytesDownloaded).toBe(0);
	});
});
