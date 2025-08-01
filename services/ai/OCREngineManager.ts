import { MLKitEngine } from "./engines/MLKitEngine";
import { MockEngine } from "./engines/MockEngine";
import { VisionCameraEngine } from "./engines/VisionCameraEngine";
import type {
	LocalOCREngine,
	OCRComparison,
	OCREngineName,
	OCRResult,
} from "./ocrTypes";

export class OCREngineManager {
	private engines: Map<OCREngineName, LocalOCREngine> = new Map();
	private initialized = false;

	constructor() {
		// Register all engines
		this.registerEngine(new MLKitEngine());
		this.registerEngine(new VisionCameraEngine());
		this.registerEngine(new MockEngine());
	}

	private registerEngine(engine: LocalOCREngine): void {
		this.engines.set(engine.name, engine);
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		// Initialize all engines in parallel
		const initPromises = Array.from(this.engines.values()).map((engine) =>
			engine.initialize().catch((error) => {
				console.error(`Failed to initialize ${engine.name}:`, error);
				// Don't throw, allow other engines to initialize
			}),
		);

		await Promise.all(initPromises);
		this.initialized = true;
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
		engineName: OCREngineName,
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

	async compareAllEngines(imageUri: string): Promise<OCRComparison> {
		const startTime = Date.now();
		const results: OCRResult[] = [];

		// Process with all available engines in parallel
		const engines = this.getAvailableEngines();
		const promises = engines.map(async (engine) => {
			try {
				const result = await engine.processImage(imageUri);
				results.push(result);
				return result;
			} catch (error) {
				console.error(`Error with ${engine.name}:`, error);
				// Return error result
				const errorResult: OCRResult = {
					text: "",
					confidence: 0,
					blocks: [],
					language: 'en',
					processingTime: 0,
					engine: engine.name,
				};
				return errorResult;
			}
		});

		await Promise.all(promises);

		// Determine best engine based on confidence
		const bestResult = results.reduce((best, current) =>
			current.confidence > best.confidence ? current : best,
		);

		const processingStats = {
			totalTime: Date.now() - startTime,
			preprocessTime: 0, // Will be set by individual engines
		};

		return {
			imageUri,
			timestamp: new Date(),
			results,
			bestEngine: bestResult.engine,
			processingStats,
		};
	}

	async processInSequence(
		imageUri: string,
		engineNames: OCREngineName[],
	): Promise<OCRResult[]> {
		const results: OCRResult[] = [];

		for (const engineName of engineNames) {
			try {
				const result = await this.processImage(imageUri, engineName);
				results.push(result);
			} catch (error) {
				console.error(`Error processing with ${engineName}:`, error);
			}
		}

		return results;
	}

	getMemoryUsage(): { total: number; byEngine: { [key: string]: number } } {
		const byEngine: { [key: string]: number } = {};
		let total = 0;

		this.engines.forEach((engine, name) => {
			const usage = engine.getMemoryUsage?.() || 0;
			byEngine[name] = usage;
			total += usage;
		});

		return { total, byEngine };
	}

	async cleanup(): Promise<void> {
		// Cleanup resources if needed
		// Currently no engines require cleanup
	}
}

// Singleton instance
export const ocrEngineManager = new OCREngineManager();
