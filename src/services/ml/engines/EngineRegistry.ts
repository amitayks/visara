import type { AnalysisEngine, AnalysisTier } from "./AnalysisEngine";
import { GemmaMultimodalService } from "./GemmaMultimodalService";
import { MlKitEngine } from "./MlKitEngine";

export class EngineRegistry {
	private static readonly byId = new Map<string, AnalysisEngine>();

	static register(engine: AnalysisEngine): void {
		this.byId.set(engine.descriptor.id, engine);
	}

	static getById(id: string): AnalysisEngine | undefined {
		return this.byId.get(id);
	}

	static getByTier(tier: AnalysisTier): AnalysisEngine[] {
		return Array.from(this.byId.values()).filter(
			(engine) => engine.descriptor.tier === tier,
		);
	}

	static getDefault(): AnalysisEngine {
		return MlKitEngine;
	}
}

// Seed the registry at module load with the Tier-0 default.
EngineRegistry.register(MlKitEngine);
// Seed the Tier-1 multimodal enrichment engine so `getById("gemma")` /
// `getByTier("tier1")` resolve it. This is registration only: it does NOT
// change `getDefault()` (still `MlKitEngine`) and nothing here routes the drain
// to Gemma — Tier-1 selection / gating / drain wiring belong to #10. The
// registry imports the service (not vice versa) to keep the dependency
// one-directional and avoid a cycle. (This is also the type-level enforcement
// point that `GemmaMultimodalService` conforms to `AnalysisEngine`.)
EngineRegistry.register(GemmaMultimodalService);
