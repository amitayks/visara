import type { VisionEngine } from "@backend/types";
import { GemmaVisionEngine } from "./GemmaVisionEngine";

/**
 * The vision engine module (personalized-vision-context design D5):
 * promptAssembly (pure) + outputParser (pure) + GemmaVisionEngine (llama.rn
 * runtime). This factory is the pipeline/facade entry point.
 */
export function createGemmaVision(modelDir: string): VisionEngine {
	return new GemmaVisionEngine(modelDir);
}

export { GemmaVisionEngine } from "./GemmaVisionEngine";
export {
	coerceEnrichment,
	extractFirstJsonObject,
	MAX_ENTITIES,
	MAX_TAGS,
	RAW_CAPTION_MAX_CHARS,
} from "./outputParser";
export {
	buildPrompt,
	MAX_CONTEXT_ENTITIES,
	SYSTEM_PROMPT,
} from "./promptAssembly";
