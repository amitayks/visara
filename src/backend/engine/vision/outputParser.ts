import type { EnrichmentResult } from "@backend/types";

/**
 * Pure parse/coerce layer for the Gemma vision output
 * (personalized-vision-context design D5; gemma-vision-enrichment "Robust
 * parse with degraded fallback"). Dependency-free (only a type import) so
 * jest exercises it without llama.rn / react-native mocking
 * (`src/backend/__tests__/outputParser.test.ts`).
 */

/** Tags are capped at this many entries after lowercase/trim/dedupe. */
export const MAX_TAGS = 16;

/** Entity matches are capped after trim/case-insensitive dedupe. */
export const MAX_ENTITIES = 8;

/** Degraded raw-as-caption fallback is trimmed then capped at this length. */
export const RAW_CAPTION_MAX_CHARS = 500;

/**
 * Extract the first balanced `{...}` block that parses as a JSON object.
 * Tolerates code fences, surrounding prose, braces inside string literals,
 * and earlier non-JSON `{...}` blocks (each candidate start is tried in
 * order; the first successful object parse wins).
 */
export function extractFirstJsonObject(
	raw: string,
): Record<string, unknown> | null {
	for (
		let start = raw.indexOf("{");
		start !== -1;
		start = raw.indexOf("{", start + 1)
	) {
		const end = findBalancedEnd(raw, start);
		if (end === -1) {
			continue;
		}
		try {
			const value: unknown = JSON.parse(raw.slice(start, end + 1));
			if (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value)
			) {
				return value as Record<string, unknown>;
			}
		} catch {
			// Balanced but not valid JSON — try the next opening brace.
		}
	}
	return null;
}

/**
 * Coerce a (possibly null) parsed object into the EnrichmentResult contract:
 * - object present: missing/mistyped keys default (strings → "", arrays → []);
 *   tags lowercased, trimmed, deduped, capped at MAX_TAGS; entities trimmed,
 *   deduped case-insensitively (original casing preserved — they round-trip
 *   to the entity store by exact glossary name), capped at MAX_ENTITIES.
 * - object null: the whole raw output (trimmed, capped) becomes the caption —
 *   a degraded-but-searchable result, never a failure.
 */
export function coerceEnrichment(
	obj: Record<string, unknown> | null,
	raw: string,
): EnrichmentResult {
	if (obj === null) {
		return {
			caption: raw.trim().slice(0, RAW_CAPTION_MAX_CHARS),
			description: "",
			tags: [],
			text: "",
			entities: [],
		};
	}

	return {
		caption: coerceString(obj.caption),
		description: coerceString(obj.description),
		tags: normalizeTags(obj.tags),
		text: coerceString(obj.text),
		entities: normalizeEntities(obj.entities),
	};
}

/** Scan for the `}` closing the `{` at `start`, string/escape aware. */
function findBalancedEnd(text: string, start: number): number {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
	}
	return -1;
}

function coerceString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

/**
 * Tags: accept strings plus the `{text}`/`{label}` object forms the legacy
 * parser tolerated; lowercase + trim, drop empties, dedupe preserving first
 * occurrence, cap at MAX_TAGS.
 */
function normalizeTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const tags: string[] = [];
	for (const entry of value as unknown[]) {
		const text = tagText(entry);
		if (text === null) {
			continue;
		}
		const normalized = text.trim().toLowerCase();
		if (normalized.length === 0 || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		tags.push(normalized);
		if (tags.length >= MAX_TAGS) {
			break;
		}
	}
	return tags;
}

/**
 * Entities: strings only (no legacy object forms — the field is new).
 * Trim, drop empties, dedupe case-insensitively KEEPING the first casing
 * (downstream resolution against the store is itself case-insensitive, but
 * exact text reads better in logs/UI), cap at MAX_ENTITIES.
 */
function normalizeEntities(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const entities: string[] = [];
	for (const entry of value as unknown[]) {
		if (typeof entry !== "string") {
			continue;
		}
		const trimmed = entry.trim();
		const key = trimmed.toLowerCase();
		if (trimmed.length === 0 || seen.has(key)) {
			continue;
		}
		seen.add(key);
		entities.push(trimmed);
		if (entities.length >= MAX_ENTITIES) {
			break;
		}
	}
	return entities;
}

function tagText(entry: unknown): string | null {
	if (typeof entry === "string") {
		return entry;
	}
	if (typeof entry === "object" && entry !== null) {
		const record = entry as Record<string, unknown>;
		if (typeof record.text === "string") {
			return record.text;
		}
		if (typeof record.label === "string") {
			return record.label;
		}
	}
	return null;
}
