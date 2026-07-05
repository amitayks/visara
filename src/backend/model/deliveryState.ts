import type {
	ArtifactState,
	DeliveryState,
	DeliveryStatus,
	ModelArtifactKey,
	ModelManifest,
} from "@backend/types";

/**
 * Pure state-reduction helpers for model delivery v2 (gemma-model-delivery
 * spec, design D11). NO native imports live here — `Delivery.ts` drives these
 * against the background downloader / filesystem / MMKV, and jest exercises
 * them directly (deliveryState.test.ts) without any native mocks.
 */

export type DeliveryErrorReason = NonNullable<DeliveryState["errorReason"]>;

/**
 * MMKV keys, namespaced v2. The legacy tree's `model_delivery_state` /
 * `model_enabled` keys are left untouched (same store id, different keys);
 * the enabled flag's legacy value is read once as a seed by `Delivery.ts`.
 */
export const DELIVERY_STATE_KEY = "delivery_v2_state";
export const DELIVERY_ENABLED_KEY = "delivery_v2_enabled";

const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
	"idle",
	"downloading",
	"paused",
	"verifying",
	"ready",
	"failed",
];

const ARTIFACT_KEYS: readonly ModelArtifactKey[] = [
	"vlm",
	"mmproj",
	"embedder",
];

const ERROR_REASONS: readonly DeliveryErrorReason[] = [
	"notEnoughSpace",
	"checksumMismatch",
	"network",
	"unknown",
];

/** Fresh (nothing downloaded) per-artifact states from the pinned manifest. */
export function buildArtifactStates(manifest: ModelManifest): ArtifactState[] {
	return manifest.artifacts.map((artifact) => ({
		key: artifact.key,
		filename: artifact.filename,
		bytesTotal: artifact.bytes,
		bytesDownloaded: 0,
		verified: false,
		failed: false,
	}));
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export interface StatusInputs {
	artifacts: readonly ArtifactState[];
	/** Live (attached, unfinished) background download task count. */
	activeTaskCount: number;
	/** A user-initiated pause is in effect. */
	paused: boolean;
	/** At least one streaming SHA-256 verification is running. */
	verifying: boolean;
}

/**
 * artifacts[] + activity → DeliveryStatus. `ready` is purely artifact-derived
 * (every artifact digest-verified on disk); the opt-in flag gates `isReady()`
 * in the service, never the status. Precedence: ready → paused/downloading →
 * verifying → failed → idle, so a checksum failure on one artifact does not
 * mask transfers still running for the others.
 */
export function deriveStatus(inputs: StatusInputs): DeliveryStatus {
	const { artifacts } = inputs;
	if (artifacts.length > 0 && artifacts.every((a) => a.verified)) {
		return "ready";
	}
	if (inputs.activeTaskCount > 0) {
		return inputs.paused ? "paused" : "downloading";
	}
	if (inputs.verifying) {
		return "verifying";
	}
	if (artifacts.some((a) => a.failed)) {
		return "failed";
	}
	return "idle";
}

// ---------------------------------------------------------------------------
// Progress + preflight math
// ---------------------------------------------------------------------------

/**
 * Aggregate progress across artifacts. Verified artifacts count as fully
 * downloaded regardless of their recorded byte counter (adopted pre-placed
 * files report 0 transferred bytes but are complete on disk).
 */
export function aggregateBytes(artifacts: readonly ArtifactState[]): {
	bytesTotal: number;
	bytesDownloaded: number;
} {
	let bytesTotal = 0;
	let bytesDownloaded = 0;
	for (const artifact of artifacts) {
		bytesTotal += artifact.bytesTotal;
		bytesDownloaded += artifact.verified
			? artifact.bytesTotal
			: clampBytes(artifact.bytesDownloaded, artifact.bytesTotal);
	}
	return { bytesTotal, bytesDownloaded };
}

/** Bytes still to transfer across unverified artifacts (preflight input). */
export function remainingBytes(artifacts: readonly ArtifactState[]): number {
	let remaining = 0;
	for (const artifact of artifacts) {
		if (artifact.verified) continue;
		remaining +=
			artifact.bytesTotal -
			clampBytes(artifact.bytesDownloaded, artifact.bytesTotal);
	}
	return remaining;
}

export interface DiskPreflight {
	ok: boolean;
	freeBytes: number;
	/** remaining transfer + headroom. */
	requiredBytes: number;
	/** max(0, requiredBytes - freeBytes) — the user-facing shortfall. */
	shortfallBytes: number;
}

/**
 * Disk gate (spec "Network and disk preflight gates"): free disk must cover
 * the remaining transfer plus headroom or the start is refused with
 * `notEnoughSpace`.
 */
export function diskPreflight(
	freeBytes: number,
	remaining: number,
	headroomBytes: number,
): DiskPreflight {
	const requiredBytes = remaining + headroomBytes;
	const shortfallBytes = Math.max(0, requiredBytes - freeBytes);
	return {
		ok: shortfallBytes === 0,
		freeBytes,
		requiredBytes,
		shortfallBytes,
	};
}

function clampBytes(value: number, max: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(Math.max(value, 0), max);
}

// ---------------------------------------------------------------------------
// Boot reconciliation (filesystem wins)
// ---------------------------------------------------------------------------

export interface FileFacts {
	size: number;
	mtimeMs: number;
}

export type DiskClassification =
	| { kind: "absent" }
	| { kind: "partial"; bytesDownloaded: number }
	/** Size + persisted verification stamp match → adopt without re-hash. */
	| { kind: "adopt-verified" }
	/** Size matches manifest but no trustworthy stamp → streaming re-hash. */
	| { kind: "needs-hash" };

/**
 * Decide what an on-disk file means for one artifact at `initialize()`.
 * A file whose size matches the manifest is adoptable; it is trusted as
 * verified only when the persisted verified stamp (size + mtime captured at
 * verification time) still matches the file — otherwise it must be re-hashed
 * (the boot-rare QA/pre-place path). Anything else is a partial transfer.
 */
export function classifyArtifactOnDisk(args: {
	manifestBytes: number;
	file: FileFacts | null;
	persisted?: PersistedArtifactV2;
}): DiskClassification {
	const { file, persisted } = args;
	if (!file) {
		return { kind: "absent" };
	}
	if (file.size !== args.manifestBytes) {
		return {
			kind: "partial",
			bytesDownloaded: clampBytes(file.size, args.manifestBytes),
		};
	}
	if (
		persisted?.verified === true &&
		persisted.fileSize === file.size &&
		persisted.fileMtimeMs === file.mtimeMs
	) {
		return { kind: "adopt-verified" };
	}
	return { kind: "needs-hash" };
}

// ---------------------------------------------------------------------------
// Persisted snapshot codec (MMKV JSON, reconciled at initialize)
// ---------------------------------------------------------------------------

export interface PersistedArtifactV2 {
	key: ModelArtifactKey;
	verified: boolean;
	failed: boolean;
	bytesDownloaded: number;
	/** stat() facts captured when the digest last verified (adopt fast-path). */
	fileSize?: number;
	fileMtimeMs?: number;
}

export interface PersistedDeliveryV2 {
	v: 2;
	status: DeliveryStatus;
	errorReason?: DeliveryErrorReason;
	artifacts: PersistedArtifactV2[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isDeliveryStatus(value: unknown): value is DeliveryStatus {
	return (
		typeof value === "string" &&
		(DELIVERY_STATUSES as readonly string[]).includes(value)
	);
}

function isArtifactKey(value: unknown): value is ModelArtifactKey {
	return (
		typeof value === "string" &&
		(ARTIFACT_KEYS as readonly string[]).includes(value)
	);
}

function isErrorReason(value: unknown): value is DeliveryErrorReason {
	return (
		typeof value === "string" &&
		(ERROR_REASONS as readonly string[]).includes(value)
	);
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function parsePersistedArtifact(value: unknown): PersistedArtifactV2 | null {
	if (!isRecord(value)) return null;
	if (!isArtifactKey(value.key)) return null;
	const artifact: PersistedArtifactV2 = {
		key: value.key,
		verified: value.verified === true,
		failed: value.failed === true,
		bytesDownloaded: Math.max(0, finiteNumber(value.bytesDownloaded) ?? 0),
	};
	const fileSize = finiteNumber(value.fileSize);
	if (fileSize !== undefined) artifact.fileSize = fileSize;
	const fileMtimeMs = finiteNumber(value.fileMtimeMs);
	if (fileMtimeMs !== undefined) artifact.fileMtimeMs = fileMtimeMs;
	return artifact;
}

/**
 * Defensive parse of the MMKV snapshot: any malformed/legacy payload → null
 * (the service then rebuilds from the filesystem alone — filesystem wins).
 * Malformed artifact entries are dropped individually.
 */
export function parsePersistedDelivery(
	json: string | null | undefined,
): PersistedDeliveryV2 | null {
	if (!json) return null;
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return null;
	}
	if (!isRecord(raw)) return null;
	if (raw.v !== 2) return null;
	if (!isDeliveryStatus(raw.status)) return null;

	const artifacts: PersistedArtifactV2[] = [];
	if (Array.isArray(raw.artifacts)) {
		for (const entry of raw.artifacts) {
			const parsed = parsePersistedArtifact(entry);
			if (parsed) artifacts.push(parsed);
		}
	}

	const persisted: PersistedDeliveryV2 = {
		v: 2,
		status: raw.status,
		artifacts,
	};
	if (isErrorReason(raw.errorReason)) {
		persisted.errorReason = raw.errorReason;
	}
	return persisted;
}

export function serializePersistedDelivery(state: PersistedDeliveryV2): string {
	return JSON.stringify(state);
}
