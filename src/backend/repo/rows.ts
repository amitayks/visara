import type { Scalar } from "@op-engineering/op-sqlite";

/**
 * Narrowing helpers for op-sqlite result rows (`Record<string, Scalar>`).
 * SQLite is dynamically typed, so every read is coerced defensively instead
 * of cast — TypeScript strict, no `any`.
 */

export function asString(value: Scalar | undefined, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

export function asNullableString(value: Scalar | undefined): string | null {
	return typeof value === "string" ? value : null;
}

export function asNumber(value: Scalar | undefined, fallback = 0): number {
	return typeof value === "number" ? value : fallback;
}

export function asBoolean(value: Scalar | undefined): boolean {
	if (typeof value === "boolean") {
		return value;
	}
	return typeof value === "number" && value !== 0;
}

/** Parses a JSON string-array column (enrichment.tags); never throws. */
export function parseStringArray(value: Scalar | undefined): string[] {
	if (typeof value !== "string" || value.length === 0) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

/** JSON id-list parameter for `IN (SELECT value FROM json_each(?))` arms. */
export function idListParam(ids: readonly string[]): string {
	return JSON.stringify(ids);
}
