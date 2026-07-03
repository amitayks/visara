/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import { EmbeddingRepository } from "@services/database/EmbeddingRepository";
import { EmbeddingService } from "@services/ml/EmbeddingService";
import { getItem, setItem } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import {
	base64ToFloat32,
	float32ToBase64,
	l2Normalize,
} from "@utils/embeddings/vectorCodec";

/**
 * POC-DEPENDENT (design D7 / POC "Fusion", "Query cold-start"): default number
 * of nearest neighbors returned by a semantic query. Tuned against real score
 * distributions after the on-device embedding POC.
 */
const SEMANTIC_DEFAULT_TOP_K = 50;

/**
 * POC-DEPENDENT (design D7 / POC "Fusion"): minimum cosine similarity for a
 * vector to be included. `0` keeps the top-k of all non-negatively-similar
 * vectors; raise it once real distributions are known.
 */
const SEMANTIC_MIN_SCORE = 0;

export interface SemanticSearchResult {
	id: string;
	score: number;
}

export interface VectorEntry {
	id: string;
	vector: Float32Array;
}

export interface VectorSnapshotData {
	ids: string[];
	dim: number;
	vectorsBase64: string;
}

/**
 * Storage-agnostic retrieval boundary (design D5, spec "Retrieval is
 * storage-agnostic with an in-JS default and a native escape hatch"). The
 * default in-JS scan can be swapped for a native `sqlite-vec` kNN behind this
 * interface without touching `SemanticSearchService` callers or the hybrid
 * combiner.
 */
export interface VectorIndexBackend {
	/** Replace all vectors (bulk load). Input vectors are assumed L2-normalized. */
	hydrate(entries: VectorEntry[]): void;
	/** Insert or overwrite one file's vector (assumed L2-normalized). */
	upsert(id: string, vector: Float32Array): void;
	/** Drop a file's vector if present. */
	remove(id: string): void;
	/** Cosine (= dot, since normalized) top-k over the cached vectors. */
	search(
		query: Float32Array,
		topK: number,
		minScore: number,
	): SemanticSearchResult[];
	/** Number of indexed vectors. */
	size(): number;
	/** Compact, serializable view for the MMKV snapshot. */
	snapshotVectors(): VectorSnapshotData;
}

/**
 * Default backend (design D5): one contiguous, growable `Float32Array` matrix
 * (rows = vectors, each `dim` wide) plus a parallel `id[]` and an `id -> row`
 * map. A query is one linear pass of `dim` multiply-adds per row — no native
 * surface. Incremental `upsert`/`remove` never rebuild the whole matrix.
 */
export class InMemoryVectorIndex implements VectorIndexBackend {
	private ids: string[] = [];
	private idToRow = new Map<string, number>();
	private matrix: Float32Array = new Float32Array(0);
	private count = 0;
	private capacity = 0;
	private dim = 0;

	hydrate(entries: VectorEntry[]): void {
		const nonEmpty = entries.filter((entry) => entry.vector.length > 0);
		const dim = nonEmpty.length > 0 ? nonEmpty[0].vector.length : 0;
		const consistent = nonEmpty.filter((entry) => entry.vector.length === dim);

		this.dim = dim;
		this.count = consistent.length;
		this.capacity = consistent.length;
		this.ids = [];
		this.idToRow = new Map();
		this.matrix = new Float32Array(consistent.length * dim);

		for (let row = 0; row < consistent.length; row++) {
			const entry = consistent[row];
			this.ids.push(entry.id);
			this.idToRow.set(entry.id, row);
			this.matrix.set(entry.vector, row * dim);
		}
	}

	upsert(id: string, vector: Float32Array): void {
		if (vector.length === 0) return;
		if (this.dim === 0) this.dim = vector.length;
		if (vector.length !== this.dim) {
			console.warn(
				`SemanticSearchService: vector dim ${vector.length} != index dim ${this.dim}; ignoring ${id}`,
			);
			return;
		}

		const existingRow = this.idToRow.get(id);
		if (existingRow !== undefined) {
			this.matrix.set(vector, existingRow * this.dim);
			return;
		}

		this.ensureCapacity(this.count + 1);
		const row = this.count;
		this.matrix.set(vector, row * this.dim);
		this.ids.push(id);
		this.idToRow.set(id, row);
		this.count += 1;
	}

	remove(id: string): void {
		const row = this.idToRow.get(id);
		if (row === undefined) return;

		const lastRow = this.count - 1;
		if (row !== lastRow) {
			// Swap-remove: move the last row into the freed slot (O(dim), no rebuild).
			const lastId = this.ids[lastRow];
			this.matrix.copyWithin(
				row * this.dim,
				lastRow * this.dim,
				(lastRow + 1) * this.dim,
			);
			this.ids[row] = lastId;
			this.idToRow.set(lastId, row);
		}
		this.ids.pop();
		this.idToRow.delete(id);
		this.count -= 1;
	}

	search(
		query: Float32Array,
		topK: number,
		minScore: number,
	): SemanticSearchResult[] {
		if (this.count === 0 || this.dim === 0 || query.length !== this.dim) {
			return [];
		}

		const results: SemanticSearchResult[] = [];
		for (let row = 0; row < this.count; row++) {
			const base = row * this.dim;
			let dot = 0;
			for (let j = 0; j < this.dim; j++) {
				dot += query[j] * this.matrix[base + j];
			}
			if (dot >= minScore) {
				results.push({ id: this.ids[row], score: dot });
			}
		}

		results.sort((a, b) => b.score - a.score);
		return topK > 0 ? results.slice(0, topK) : results;
	}

	size(): number {
		return this.count;
	}

	snapshotVectors(): VectorSnapshotData {
		const active = this.matrix.subarray(0, this.count * this.dim);
		return {
			ids: this.ids.slice(0, this.count),
			dim: this.dim,
			vectorsBase64: float32ToBase64(active),
		};
	}

	private ensureCapacity(rows: number): void {
		if (rows <= this.capacity) return;
		const nextCapacity = Math.max(
			rows,
			this.capacity === 0 ? 16 : this.capacity * 2,
		);
		const next = new Float32Array(nextCapacity * this.dim);
		next.set(this.matrix.subarray(0, this.count * this.dim));
		this.matrix = next;
		this.capacity = nextCapacity;
	}
}

interface PersistedVectorSnapshot {
	modelVersion: string;
	dim: number;
	ids: string[];
	vectors: string;
}

/**
 * All-static semantic retrieval over the #1 `embeddings` table (design D5). The
 * table is the source of truth; this holds a derived, cached vector index —
 * hydrated on load, persisted to MMKV under {@link STORAGE_KEYS.SEMANTIC_INDEX},
 * and updated incrementally per embed — mirroring how `SearchService` caches
 * MiniSearch. Only vectors at the active `model_version` are ever indexed, so
 * ranking is always within one vector space (task 4.5).
 */
export class SemanticSearchService {
	private static backend: VectorIndexBackend = new InMemoryVectorIndex();

	/**
	 * Swap the retrieval backend (design D5 `sqlite-vec` escape hatch). Callers
	 * and the hybrid combiner are unchanged.
	 */
	static setBackend(backend: VectorIndexBackend): void {
		this.backend = backend;
	}

	/**
	 * Hydrate the in-memory index from the persisted MMKV snapshot (when it
	 * matches the active model), else rebuild from the `embeddings` table. Never
	 * re-embeds any file. Fail-soft: returns `false` on error.
	 */
	static async loadIndex(): Promise<boolean> {
		try {
			const modelVersion = EmbeddingService.getModelVersion();

			const serialized = getItem(STORAGE_KEYS.SEMANTIC_INDEX);
			if (serialized) {
				const snapshot = JSON.parse(serialized) as PersistedVectorSnapshot;
				if (
					snapshot.modelVersion === modelVersion &&
					this.applySnapshot(snapshot)
				) {
					return true;
				}
			}

			await this.rebuildFromTable(modelVersion);
			return true;
		} catch (error) {
			console.error("SemanticSearchService.loadIndex error:", error);
			return false;
		}
	}

	/** Persist the current index as a compact MMKV snapshot (mirrors lexical serialize). */
	static async serializeIndex(): Promise<void> {
		try {
			const snapshot = this.backend.snapshotVectors();
			const payload: PersistedVectorSnapshot = {
				modelVersion: EmbeddingService.getModelVersion(),
				dim: snapshot.dim,
				ids: snapshot.ids,
				vectors: snapshot.vectorsBase64,
			};
			setItem(STORAGE_KEYS.SEMANTIC_INDEX, JSON.stringify(payload));
		} catch (error) {
			console.error("SemanticSearchService.serializeIndex error:", error);
		}
	}

	/** Incremental in-memory upsert + persist (analogous to `SearchService.addToIndex`). */
	static async upsertVector(
		mediaFileId: string,
		vector: Float32Array,
	): Promise<void> {
		this.backend.upsert(mediaFileId, l2Normalize(vector));
		await this.serializeIndex();
	}

	/** Drop a file's vector (e.g. on media delete) + persist. */
	static async removeVector(mediaFileId: string): Promise<void> {
		this.backend.remove(mediaFileId);
		await this.serializeIndex();
	}

	/**
	 * Embed the query with the SAME model as the indexed vectors, then return the
	 * cosine-ranked (= dot, since normalized) top-k media file ids. Resolves `[]`
	 * — never throws — when the query is blank, the model is unavailable, or the
	 * index is empty (spec "Empty or unindexed state yields no semantic results";
	 * hybrid graceful degradation).
	 */
	static async search(
		queryText: string,
		topK: number = SEMANTIC_DEFAULT_TOP_K,
	): Promise<SemanticSearchResult[]> {
		if (!queryText.trim()) return [];
		if (this.backend.size() === 0) return [];

		const raw = await EmbeddingService.embed(queryText);
		if (!raw || raw.length === 0) return [];

		const query = l2Normalize(raw);
		return this.backend.search(query, topK, SEMANTIC_MIN_SCORE);
	}

	/** Number of indexed vectors (0 when the semantic side is cold/unavailable). */
	static size(): number {
		return this.backend.size();
	}

	// --- Internals ---------------------------------------------------------

	private static applySnapshot(snapshot: PersistedVectorSnapshot): boolean {
		if (snapshot.dim <= 0 || snapshot.ids.length === 0) {
			this.backend.hydrate([]);
			return true;
		}

		const flat = base64ToFloat32(snapshot.vectors);
		if (flat.length !== snapshot.dim * snapshot.ids.length) {
			// Corrupt/truncated snapshot → signal the caller to rebuild from table.
			return false;
		}

		const entries: VectorEntry[] = snapshot.ids.map((id, row) => ({
			id,
			vector: flat.subarray(row * snapshot.dim, (row + 1) * snapshot.dim),
		}));
		this.backend.hydrate(entries);
		return true;
	}

	private static async rebuildFromTable(modelVersion: string): Promise<void> {
		const rows = await EmbeddingRepository.getAllForModelVersion(modelVersion);
		const entries: VectorEntry[] = [];
		for (const row of rows) {
			try {
				const decoded = EmbeddingRepository.decode(row);
				entries.push({ id: row.mediaFileId, vector: decoded.vector });
			} catch (error) {
				console.warn(
					"SemanticSearchService: skipping undecodable embedding row",
					error,
				);
			}
		}
		this.backend.hydrate(entries);
		await this.serializeIndex();
	}
}
