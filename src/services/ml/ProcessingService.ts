/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */

import type { AnalysisEngine } from "./engines/AnalysisEngine";
import { MlKitEngine } from "./engines/MlKitEngine";
import type { ImageLabelingResult } from "./ImageLabelingService";
import type { TextRecognitionResult } from "./TextRecognitionService";

/**
 * One open-vocabulary tag produced by the Tier-1 Gemma engine
 * (`GemmaMultimodalService`).
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): whether `confidence` is populated,
 * and its scale, is subject to the finalized model-output shape.
 */
export interface GemmaTag {
	text: string;
	confidence?: number;
}

/**
 * Additive multimodal enrichment produced by the Tier-1 Gemma engine
 * (`GemmaMultimodalService`), carried on `ProcessingResult.gemma`. This is the
 * additive extension `analysis-engine-interface` reserved — no existing field
 * of `ProcessingResult` changes, so `MlKitEngine` and every current consumer
 * still conform.
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): the exact field set below — the tag
 * `confidence`, the `ocrText` field (only when the "ocr" capability is
 * exercised), the `raw` unparsed passthrough, and the caption/description/tag
 * shape (and whether tags also mirror into `imageLabeling.labels`) — is subject
 * to the finalized model-output shape and MUST be re-tuned once #4's on-device
 * POC reports it.
 */
export interface GemmaEnrichment {
	caption?: string;
	description?: string;
	tags: GemmaTag[];
	ocrText?: string;
	raw?: string;
}

export interface ProcessingResult {
	imageLabeling: ImageLabelingResult;
	textRecognition: TextRecognitionResult;
	totalProcessingTime: number;
	success: boolean;
	error?: string;
	/**
	 * Additive Tier-1 enrichment; set only by the Gemma engine. Absent on
	 * Tier-0 (`MlKitEngine`) results, which never populate it.
	 */
	gemma?: GemmaEnrichment;
}

export class ProcessingService {
	private static engine: AnalysisEngine = MlKitEngine;

	static async processMedia(imageUri: string): Promise<ProcessingResult> {
		return this.engine.analyze(imageUri);
	}

	static setEngine(engine: AnalysisEngine): void {
		this.engine = engine;
	}

	static getEngine(): AnalysisEngine {
		return this.engine;
	}
}
