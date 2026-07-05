import type { DB, QueryResult } from "@op-engineering/op-sqlite";

/**
 * Hybrid search core (design D12, hybrid-search delta spec).
 *
 * Two candidate arms over the live tables — FTS5 lexical (`media_fts`) and
 * sqlite-vec semantic (`vec_media`) — fused by Reciprocal Rank Fusion. No
 * persisted side-indexes, no warm-up: every call is plain SQL plus (at most)
 * one query embedding.
 *
 * KNN SAFE VARIANT (documented decision): the delta spec sketches a single
 * CTE statement joining `media` inside the vec0 KNN query, but the bundled
 * sqlite-vec build (0.1.9-era) may reject extra WHERE terms on joined tables
 * inside a vec0 KNN scan ("k = ?" constraint planning). We therefore run the
 * KNN bare (`embedding MATCH ? AND k = N`) and apply the hidden/deleted
 * filter in a second `id IN (...)` query against `media`, intersected in JS
 * while preserving KNN order. The visibility filter still runs in SQL against
 * `media` for BOTH arms, so hidden/deleted rows cannot leak through either
 * arm (hybrid-search "Hidden media cannot leak" scenario).
 *
 * Degradation ladder: embedder missing / embedding fails / any semantic-arm
 * error → lexical-only (the semantic arm never throws). Not-yet-enriched
 * photos are reachable via the FTS `filename` column (indexed at discovery
 * with empty enrichment columns — `EnrichmentRepoContract.indexFilename`).
 * Empty/whitespace query → `[]` without touching the database.
 */

/** Minimal op-sqlite surface consumed here (eases injection + testing). */
export type SearchDb = Pick<DB, "execute">;

/** Per-arm candidate pool size (design D12: top 80 each arm). */
const ARM_POOL = 80;
/** RRF constant (design D12: k = 60). */
const RRF_K = 60;
/** Default fused-result cap. */
const DEFAULT_SEARCH_LIMIT = 60;
/** Default suggestion cap (hybrid-search delta: up to 10). */
const DEFAULT_SUGGEST_LIMIT = 10;
/** Bounded filename pool scanned for suggestion stems. */
const FILENAME_POOL = 400;

/** FTS5 syntax characters stripped from every token (quotes, prefix star, grouping, column filter, initial-token caret). */
const FTS_SYNTAX_CHARS = /["*():^]/g;
/** FTS5 recognizes these operators only in ALL CAPS; lowercase forms are ordinary terms. */
const FTS_KEYWORDS = new Set(["AND", "OR", "NOT", "NEAR"]);
/** At least one letter or digit (any script) — drops degenerate all-punctuation phrases. */
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Sanitize a raw user query into an FTS5 MATCH expression, or null when no
 * searchable token survives. Tokens are whitespace-split, stripped of FTS5
 * syntax characters and ALL-CAPS keyword operators, double-quoted (so
 * remaining content is literal), implicit-AND joined with spaces, and the
 * last token gets phrase-prefix matching: `golden retr` → `"golden" "retr"*`.
 */
export function buildFtsQuery(raw: string): string | null {
	const tokens = raw
		.split(/\s+/)
		.map((token) => token.replace(FTS_SYNTAX_CHARS, ""))
		.filter(
			(token) =>
				token.length > 0 &&
				!FTS_KEYWORDS.has(token) &&
				HAS_WORD_CHAR.test(token),
		);
	if (tokens.length === 0) {
		return null;
	}
	return tokens
		.map((token, index) =>
			index === tokens.length - 1 ? `"${token}"*` : `"${token}"`,
		)
		.join(" ");
}

interface FusedEntry {
	score: number;
	combinedRank: number;
}

/**
 * Reciprocal Rank Fusion over two ranked id lists (equal arm weights):
 * score(id) = Σ 1 / (k + rank_arm) across the arms containing it (1-based
 * ranks). Sorted by score descending; exact ties break by combined rank
 * (sum of ranks, ascending) then id (codepoint order) — fully deterministic
 * regardless of which arm contributed. Duplicate ids within one arm count
 * once, at their first position. A single-arm call is a pass-through of that
 * arm's order.
 */
export function rrfFuse(lex: string[], sem: string[], k = RRF_K): string[] {
	const entries = new Map<string, FusedEntry>();
	for (const arm of [lex, sem]) {
		const seen = new Set<string>();
		arm.forEach((id, index) => {
			if (seen.has(id)) {
				return;
			}
			seen.add(id);
			const rank = index + 1;
			const entry = entries.get(id);
			if (entry) {
				entry.score += 1 / (k + rank);
				entry.combinedRank += rank;
			} else {
				entries.set(id, { score: 1 / (k + rank), combinedRank: rank });
			}
		});
	}
	return [...entries.entries()]
		.sort((a, b) => {
			if (b[1].score !== a[1].score) {
				return b[1].score - a[1].score;
			}
			if (a[1].combinedRank !== b[1].combinedRank) {
				return a[1].combinedRank - b[1].combinedRank;
			}
			if (a[0] < b[0]) {
				return -1;
			}
			return a[0] > b[0] ? 1 : 0;
		})
		.map(([id]) => id);
}

/**
 * bm25 weights are positional and MUST follow the media_fts column order
 * `(media_id UNINDEXED, caption, description, tags, ocr_text, filename)`:
 * media_id 0 (unindexed), caption 4, description 1, tags 3, ocr_text 2,
 * filename 1 (design D12). bm25() returns more-negative-is-better, so the
 * default ascending ORDER BY ranks best first.
 */
const FTS_ARM_SQL = `
	SELECT media_fts.media_id AS media_id
	FROM media_fts
	JOIN media ON media.id = media_fts.media_id
	WHERE media_fts MATCH ?
		AND media.hidden = 0
		AND media.deleted = 0
	ORDER BY bm25(media_fts, 0, 4.0, 1.0, 3.0, 2.0, 1.0)
	LIMIT ${ARM_POOL}
`;

/** Bare vec0 KNN — no joined-table constraints (see SAFE VARIANT above). */
const KNN_ARM_SQL = `
	SELECT media_id, distance
	FROM vec_media
	WHERE embedding MATCH ?
		AND k = ${ARM_POOL}
	ORDER BY distance
`;

/**
 * Hybrid search: returns media ids in fused rank order (the facade hydrates
 * rows via the media repository, preserving this order).
 *
 * @param db op-sqlite connection (only `execute` is used).
 * @param embedQuery query embedder in the stored-vector space
 *   (`EmbedEngine.embedQuery`); pass a `null`-returning stub while the
 *   embedder is not delivered — the semantic arm is skipped without error.
 * @param q raw user query; empty/whitespace resolves `[]` immediately.
 * @param limit maximum fused ids returned.
 */
export async function search(
	db: SearchDb,
	embedQuery: (q: string) => Promise<Float32Array | null>,
	q: string,
	limit = DEFAULT_SEARCH_LIMIT,
): Promise<string[]> {
	const trimmed = q.trim();
	if (trimmed.length === 0 || limit <= 0) {
		return [];
	}
	const [lexIds, semIds] = await Promise.all([
		lexicalArm(db, trimmed),
		semanticArm(db, embedQuery, trimmed),
	]);
	if (lexIds.length === 0 && semIds.length === 0) {
		return [];
	}
	return rrfFuse(lexIds, semIds).slice(0, limit);
}

/**
 * FTS5 arm. Sanitization makes MATCH syntax errors unreachable, so genuine
 * database failures here are allowed to propagate (unlike the semantic arm).
 */
async function lexicalArm(db: SearchDb, q: string): Promise<string[]> {
	const match = buildFtsQuery(q);
	if (match === null) {
		return [];
	}
	const result = await db.execute(FTS_ARM_SQL, [match]);
	return stringColumn(result.rows, "media_id");
}

/**
 * Semantic arm (SAFE VARIANT): embed → bare KNN → visibility filter via a
 * second SQL query, intersected in JS preserving KNN order. Any failure
 * anywhere in the arm (embedder, vec0, filter) degrades to `[]` so search
 * falls back to lexical-only — this arm never throws.
 */
async function semanticArm(
	db: SearchDb,
	embedQuery: (q: string) => Promise<Float32Array | null>,
	q: string,
): Promise<string[]> {
	try {
		const vec = await embedQuery(q);
		if (vec === null || vec.length === 0) {
			return [];
		}
		const knn = await db.execute(KNN_ARM_SQL, [toArrayBuffer(vec)]);
		const orderedIds = stringColumn(knn.rows, "media_id");
		if (orderedIds.length === 0) {
			return [];
		}
		const placeholders = orderedIds.map(() => "?").join(", ");
		const visible = await db.execute(
			`SELECT id FROM media WHERE id IN (${placeholders}) AND hidden = 0 AND deleted = 0`,
			[...orderedIds],
		);
		const allowed = new Set(stringColumn(visible.rows, "id"));
		return orderedIds.filter((id) => allowed.has(id));
	} catch {
		return [];
	}
}

/**
 * Tag suggestions: distinct enrichment tag values by frequency. The inner
 * subquery guards `json_each` against NULL/malformed tag cells (a malformed
 * cell would otherwise abort the whole scan); repositories always write JSON
 * arrays, so this is pure defense. Tags of hidden/deleted media are excluded
 * so suggestion text cannot leak content the gallery no longer shows.
 */
const TAG_SUGGEST_SQL = `
	SELECT je.value AS value, COUNT(*) AS freq
	FROM (
		SELECT e.media_id AS media_id, e.tags AS tags
		FROM enrichment e
		WHERE e.tags IS NOT NULL AND json_valid(e.tags)
	) AS src,
		json_each(src.tags) AS je,
		media
	WHERE media.id = src.media_id
		AND media.hidden = 0
		AND media.deleted = 0
		AND je.value LIKE ? ESCAPE '\\'
	GROUP BY je.value
	ORDER BY freq DESC, value ASC
	LIMIT ?
`;

const FILENAME_SUGGEST_SQL = `
	SELECT filename
	FROM media
	WHERE deleted = 0
		AND hidden = 0
		AND filename IS NOT NULL
		AND filename LIKE ? ESCAPE '\\'
	LIMIT ${FILENAME_POOL}
`;

/**
 * Suggestion chips: distinct tag values (via `json_each(enrichment.tags)`)
 * plus filename stems, prefix-matched case-insensitively (SQLite LIKE —
 * ASCII case folding), merged case-insensitively and ordered by frequency,
 * then value. Empty/whitespace prefix resolves `[]` — pre-typing chips
 * should come from `EnrichmentRepoContract.uniqueTags` instead.
 */
export async function suggest(
	db: SearchDb,
	prefix: string,
	limit = DEFAULT_SUGGEST_LIMIT,
): Promise<string[]> {
	const trimmed = prefix.trim();
	if (trimmed.length === 0 || limit <= 0) {
		return [];
	}
	const pattern = `${escapeLike(trimmed)}%`;
	const [tagResult, filenameResult] = await Promise.all([
		db.execute(TAG_SUGGEST_SQL, [pattern, limit]),
		db.execute(FILENAME_SUGGEST_SQL, [pattern]),
	]);

	/** Lowercased value → display form + merged frequency. */
	const merged = new Map<string, { display: string; freq: number }>();
	for (const row of tagResult.rows) {
		const value = row.value;
		if (typeof value !== "string" || value.length === 0) {
			continue;
		}
		const freq = typeof row.freq === "number" ? row.freq : 1;
		const key = value.toLowerCase();
		const entry = merged.get(key);
		if (entry) {
			entry.freq += freq;
		} else {
			merged.set(key, { display: value, freq });
		}
	}
	const lowerPrefix = trimmed.toLowerCase();
	for (const row of filenameResult.rows) {
		const filename = row.filename;
		if (typeof filename !== "string") {
			continue;
		}
		const stem = stemOf(filename);
		const key = stem.toLowerCase();
		// Re-check the prefix on the STEM: `beach.jpg` matches LIKE 'beach.j%'
		// but its stem `beach` is not a 'beach.j' suggestion.
		if (stem.length === 0 || !key.startsWith(lowerPrefix)) {
			continue;
		}
		const entry = merged.get(key);
		if (entry) {
			entry.freq += 1;
		} else {
			merged.set(key, { display: stem, freq: 1 });
		}
	}
	return [...merged.values()]
		.sort((a, b) => {
			if (b.freq !== a.freq) {
				return b.freq - a.freq;
			}
			if (a.display < b.display) {
				return -1;
			}
			return a.display > b.display ? 1 : 0;
		})
		.slice(0, limit)
		.map((entry) => entry.display);
}

/** Filename without its final extension (`IMG_1234.HEIC` → `IMG_1234`). */
function stemOf(filename: string): string {
	const lastDot = filename.lastIndexOf(".");
	return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/** Escape LIKE wildcards for use with `ESCAPE '\'`. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Collect string values of `column`, skipping non-string cells. */
function stringColumn(rows: QueryResult["rows"], column: string): string[] {
	const out: string[] = [];
	for (const row of rows) {
		const value = row[column];
		if (typeof value === "string") {
			out.push(value);
		}
	}
	return out;
}

/**
 * op-sqlite binds BLOBs from ArrayBuffer (`Scalar` union); copy the vector's
 * exact byte range so a view over a larger/shared buffer never leaks extra
 * bytes into the vec0 MATCH parameter.
 */
function toArrayBuffer(vec: Float32Array): ArrayBuffer {
	const buffer = new ArrayBuffer(vec.byteLength);
	new Float32Array(buffer).set(vec);
	return buffer;
}
