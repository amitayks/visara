/** biome-ignore-all lint/complexity/noStaticOnlyClass: matches sibling all-static services */
import { Embedding } from "@models/Embedding";
import { Q } from "@nozbe/watermelondb";
import {
	base64ToFloat32,
	float32ToBase64,
	l2Normalize,
} from "@utils/embeddings/vectorCodec";
import { database } from "./database";

export interface DecodedEmbedding {
	vector: Float32Array;
	dim: number;
	modelVersion: string;
}

/**
 * Repository over the existing #1 `embeddings` table (`schema.ts:104-113`,
 * `Embedding` model) — the source of truth for semantic vectors. Owns the
 * base64/Float32 (de)serialization and the replace-in-place upsert so a stored
 * payload's decoded length always equals its `dim` (design D4/D9).
 */
export class EmbeddingRepository {
	static async findByMediaFileId(mediaFileId: string): Promise<Embedding[]> {
		return await database
			.get<Embedding>("embeddings")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}

	/**
	 * Replace-in-place upsert (design D4/D9): L2-normalize the vector, base64-
	 * encode its raw Float32 bytes, and write `vector`/`dim`/`model_version` —
	 * deleting any existing rows for the file first (mirrors the label/OCR
	 * replace pattern) so no duplicate vectors accumulate for the same file.
	 */
	static async upsert(
		mediaFileId: string,
		vector: Float32Array,
		modelVersion: string,
	): Promise<Embedding> {
		const normalized = l2Normalize(vector);
		const encoded = float32ToBase64(normalized);
		const dim = normalized.length;

		const existing = await this.findByMediaFileId(mediaFileId);
		return await database.write(async () => {
			await Promise.all(existing.map((row) => row.markAsDeleted()));
			return await database.get<Embedding>("embeddings").create((row) => {
				row.mediaFileId = mediaFileId;
				row.vector = encoded;
				row.dim = dim;
				row.modelVersion = modelVersion;
			});
		});
	}

	/**
	 * Decode a stored row's vector payload, asserting the decoded component count
	 * equals the row's `dim` (archived `semantic-embeddings` read-time
	 * validation).
	 */
	static decode(row: Embedding): DecodedEmbedding {
		const vector = base64ToFloat32(row.vector);
		if (vector.length !== row.dim) {
			throw new Error(
				`EmbeddingRepository.decode: decoded length ${vector.length} != stored dim ${row.dim} (media ${row.mediaFileId})`,
			);
		}
		return { vector, dim: row.dim, modelVersion: row.modelVersion };
	}

	/** All rows produced by the given model version — used for index hydration. */
	static async getAllForModelVersion(
		modelVersion: string,
	): Promise<Embedding[]> {
		return await database
			.get<Embedding>("embeddings")
			.query(Q.where("model_version", modelVersion))
			.fetch();
	}

	/**
	 * Rows whose `model_version` differs from the active model — stale vectors
	 * eligible for re-embedding (archived `semantic-embeddings` "Identify stale
	 * embeddings").
	 */
	static async findStale(activeModelVersion: string): Promise<Embedding[]> {
		return await database
			.get<Embedding>("embeddings")
			.query(Q.where("model_version", Q.notEq(activeModelVersion)))
			.fetch();
	}
}
