import { MLKitEngine } from "./engines/MLKitEngine";
import type {
	LocalOCREngine,
	OCRComparison,
	OCREngineName,
	OCRResult,
} from "./ocrTypes";

export class OCREngineManager {
	private engines: Map<OCREngineName, LocalOCREngine> = new Map();
	private initialized = false;
	private mlkitEngine: MLKitEngine;

	constructor() {
		// Only register MLKit engine
		this.mlkitEngine = new MLKitEngine();
		this.registerEngine(this.mlkitEngine);
	}

	private registerEngine(engine: LocalOCREngine): void {
		this.engines.set(engine.name, engine);
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			await this.mlkitEngine.initialize();
			this.initialized = true;
			console.log("[OCREngineManager] MLKit engine initialized successfully");
		} catch (error) {
			console.error("Failed to initialize MLKit engine:", error);
			throw error;
		}
	}

	getEngine(name: OCREngineName): LocalOCREngine | undefined {
		return this.engines.get(name);
	}

	getAllEngines(): LocalOCREngine[] {
		return Array.from(this.engines.values());
	}

	getAvailableEngines(): LocalOCREngine[] {
		return this.getAllEngines().filter((engine) => engine.isInitialized());
	}

	async processImage(
		imageUri: string,
		engineName: OCREngineName = "mlkit", // Default to MLKit
	): Promise<OCRResult> {
		const engine = this.getEngine(engineName);
		if (!engine) {
			throw new Error(`Engine ${engineName} not found`);
		}

		if (!engine.isInitialized()) {
			await engine.initialize();
		}

		return engine.processImage(imageUri);
	}

	// Simplified - only uses MLKit now
	async compareAllEngines(imageUri: string): Promise<OCRComparison> {
		const startTime = Date.now();
		
		try {
			const result = await this.processImage(imageUri, "mlkit");
			
			const processingStats = {
				totalTime: Date.now() - startTime,
				preprocessTime: 0,
			};

			return {
				imageUri,
				timestamp: new Date(),
				results: [result],
				bestEngine: result.engine,
				processingStats,
			};
		} catch (error) {
			console.error("Error with MLKit engine:", error);
			throw error;
		}
	}

	// Simplified - processes with MLKit only
	async processInSequence(
		imageUri: string,
		engineNames: OCREngineName[] = ["mlkit"],
	): Promise<OCRResult[]> {
		const results: OCRResult[] = [];

		try {
			const result = await this.processImage(imageUri, "mlkit");
			results.push(result);
		} catch (error) {
			console.error("Error processing with MLKit:", error);
		}

		return results;
	}

	getMemoryUsage(): number {
		return 0; // Simplified - no memory management needed for MLKit only
	}

	async cleanup(): Promise<void> {
		// MLKit doesn't require cleanup, but keep for interface compatibility
		console.log("[OCREngineManager] Cleanup called - no action needed for MLKit");
	}
}

// Singleton instance
export const ocrEngineManager = new OCREngineManager();