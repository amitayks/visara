import CryptoJS from "crypto-js";

// Simple embedding service for React Native
// Uses TF-IDF-like approach instead of transformer models
export class SimpleEmbeddingService {
	private static instance: SimpleEmbeddingService;
	private vocabulary: Map<string, number> = new Map();
	private idfScores: Map<string, number> = new Map();
	private documentCount = 0;
	private readonly VECTOR_SIZE = 128;

	static getInstance(): SimpleEmbeddingService {
		if (!SimpleEmbeddingService.instance) {
			SimpleEmbeddingService.instance = new SimpleEmbeddingService();
		}
		return SimpleEmbeddingService.instance;
	}

	async initialize(): Promise<void> {
		// Simple initialization - no model loading needed
		console.log("[SimpleEmbeddingService] Initialized");
	}

	async generateEmbedding(text: string): Promise<number[]> {
		try {
			const cleanText = this.preprocessText(text);
			const tokens = this.tokenize(cleanText);

			// Create a feature vector using hashing trick
			const vector = new Array(this.VECTOR_SIZE).fill(0);

			for (const token of tokens) {
				// Hash token to get consistent index
				const hash = this.hashToken(token);
				const index = Math.abs(hash) % this.VECTOR_SIZE;

				// Use TF (term frequency) for the value
				const tf = this.getTermFrequency(token, tokens);
				vector[index] += tf;
			}

			// Normalize the vector
			return this.normalizeVector(vector);
		} catch (error) {
			console.error(
				"[SimpleEmbeddingService] Error generating embedding:",
				error,
			);
			return new Array(this.VECTOR_SIZE).fill(0);
		}
	}

	async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
		const embeddings: number[][] = [];

		for (const text of texts) {
			const embedding = await this.generateEmbedding(text);
			embeddings.push(embedding);
		}

		return embeddings;
	}

	private preprocessText(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 1000); // Limit length
	}

	private tokenize(text: string): string[] {
		return text.split(/\s+/).filter((token) => token.length > 2);
	}

	private hashToken(token: string): number {
		// Use CryptoJS to get consistent hash
		const hash = CryptoJS.SHA256(token).toString();
		// Convert first 8 chars of hash to number
		return parseInt(hash.substring(0, 8), 16);
	}

	private getTermFrequency(term: string, tokens: string[]): number {
		const count = tokens.filter((t) => t === term).length;
		return count / tokens.length;
	}

	private normalizeVector(vector: number[]): number[] {
		const magnitude = Math.sqrt(
			vector.reduce((sum, val) => sum + val * val, 0),
		);

		if (magnitude === 0) return vector;

		return vector.map((val) => val / magnitude);
	}

	// Calculate cosine similarity between two vectors
	cosineSimilarity(vec1: number[], vec2: number[]): number {
		if (vec1.length !== vec2.length || vec1.length === 0) return 0;

		let dotProduct = 0;
		let norm1 = 0;
		let norm2 = 0;

		for (let i = 0; i < vec1.length; i++) {
			dotProduct += vec1[i] * vec2[i];
			norm1 += vec1[i] * vec1[i];
			norm2 += vec2[i] * vec2[i];
		}

		const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
		return isNaN(similarity) ? 0 : similarity;
	}
}

export const embeddingService = SimpleEmbeddingService.getInstance();
