import type { ProcessingResult } from "../ProcessingService";

export type AnalysisTier = "tier0" | "tier1";
export type AnalysisCapability =
	| "labels"
	| "ocr"
	| "caption"
	| "description"
	| "tags";

export interface AnalysisEngineDescriptor {
	/** Stable engine id; also the intended label/enrichment provenance source (e.g. "mlkit", "gemma"). */
	readonly id: string;
	/** Scheduling/selection bucket: tier0 = fast literal pass, tier1 = multimodal enrichment. */
	readonly tier: AnalysisTier;
	/** What this engine actually produces. */
	readonly capabilities: readonly AnalysisCapability[];
	/** Optional model identifier to stamp as provenance later (ai_model_version / labels.model_version). Omitted for ML Kit. */
	readonly modelVersion?: string;
}

export interface AnalysisEngine {
	readonly descriptor: AnalysisEngineDescriptor;
	/** Produce analysis for one image. Resolves (does not reject) with success=false on failure, matching today's contract. */
	analyze(imageUri: string): Promise<ProcessingResult>;
}
