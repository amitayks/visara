import {
	cleanupInferenceTemp,
	toInferenceJpeg,
} from "@backend/media/ImagePrep";
import { MMPROJ_ARTIFACT, VLM_ARTIFACT } from "@backend/model/manifest";
import type { VisionAnalysis, VisionEngine } from "@backend/types";
import {
	type CompletionParams,
	initLlama,
	type LlamaContext,
	type NativeCompletionResult,
} from "llama.rn";
import { Platform } from "react-native";
import { createMutex, type Mutex } from "./mutex";
import { coerceEnrichment, extractFirstJsonObject } from "./parseEnrichment";

/**
 * Gemma 4 E2B vision engine over llama.rn (design D1/D3/D10,
 * gemma-vision-enrichment spec). One multimodal generation per photo returns
 * `{caption, description, tags, text}`; the context is initialized lazily on
 * the first analyze and released by dispose() (pipeline calls it on stop /
 * background / critical-thermal). `analyze` resolves — never rejects — with
 * the VisionAnalysis envelope.
 */

/** Per-image generation budget; on expiry the native generation is stopped. */
const GENERATION_TIMEOUT_MS = 120_000;

/**
 * After stopCompletion() the native promise settles almost immediately; if it
 * does not within this grace, give up waiting (concern: the context may then
 * still hold a dangling native op).
 */
const INTERRUPT_GRACE_MS = 10_000;

/** Context window: prompt + ~256-512 image tokens + JSON output head-room. */
const VLM_CONTEXT_TOKENS = 4096;

/**
 * Output cap: the JSON object plus verbatim OCR of a text-dense photo.
 * Bounded so a rambling generation cannot eat the whole 120 s budget.
 */
const MAX_PREDICT_TOKENS = 768;

const SYSTEM_PROMPT =
	"You are a precise on-device photo analyst. You respond with exactly one JSON object and nothing else.";

const USER_PROMPT =
	'Analyze this image. Respond with ONLY one JSON object: {"caption":"<one short sentence>","description":"<2-3 sentences>","tags":["<up to 16 lowercase open-vocabulary tags: salient objects, scene, attributes>"],"text":"<transcribe ALL legible text in the image verbatim; empty string if none>"}';

export function createGemmaVision(modelDir: string): VisionEngine {
	return new LlamaGemmaVision(modelDir);
}

export class LlamaGemmaVision implements VisionEngine {
	private readonly modelDir: string;
	private readonly runExclusive: Mutex = createMutex();
	private context: LlamaContext | null = null;
	/** In-flight init shared so a failure is retryable on the next analyze. */
	private initPromise: Promise<LlamaContext> | null = null;

	constructor(modelDir: string) {
		this.modelDir = modelDir.replace(/\/+$/, "");
	}

	/**
	 * One serialized generation per call (mutex — never concurrent on one
	 * context; dispose() queues behind the in-flight item, satisfying
	 * "released after the in-flight item settles").
	 */
	analyze(fileUri: string): Promise<VisionAnalysis> {
		return this.runExclusive(async () => {
			const startedAt = Date.now();

			// Prep failure fails the item WITHOUT invoking (or loading) the model.
			const imagePath = await toInferenceJpeg(fileUri);
			if (imagePath === null) {
				return {
					ok: false,
					error: "image preparation failed (unreadable or corrupt asset)",
					durationMs: Date.now() - startedAt,
				};
			}

			try {
				const context = await this.ensureContext();
				const completion = await this.completeWithTimeout(context, {
					messages: [
						{ role: "system", content: SYSTEM_PROMPT },
						{
							role: "user",
							content: [
								{ type: "text", text: USER_PROMPT },
								// llama.rn replaces this part with its media marker and
								// forwards the path natively (GGUF chat template applied by
								// llama.rn itself — no manual formatting here).
								{ type: "image_url", image_url: { url: imagePath } },
							],
						},
					],
					n_predict: MAX_PREDICT_TOKENS,
					temperature: 0.1,
				});

				const raw = completion.content || completion.text || "";
				return {
					ok: true,
					result: coerceEnrichment(extractFirstJsonObject(raw), raw),
					durationMs: Date.now() - startedAt,
				};
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - startedAt,
				};
			} finally {
				// Temp JPEG is deleted only after the generation settled.
				await cleanupInferenceTemp(imagePath);
			}
		});
	}

	/** Release this engine's context only (never releaseAllLlama). */
	dispose(): Promise<void> {
		return this.runExclusive(async () => {
			const context = this.context;
			this.context = null;
			this.initPromise = null;
			if (context === null) {
				return;
			}
			try {
				await context.releaseMultimodal();
			} catch (error) {
				console.warn("[GemmaVision] releaseMultimodal failed:", error);
			}
			try {
				await context.release();
			} catch (error) {
				console.warn("[GemmaVision] release failed:", error);
			}
		});
	}

	private ensureContext(): Promise<LlamaContext> {
		if (this.context !== null) {
			return Promise.resolve(this.context);
		}
		if (this.initPromise === null) {
			this.initPromise = this.initContext()
				.then((context) => {
					this.context = context;
					return context;
				})
				.catch((error: unknown) => {
					// Clear so the next analyze retries instead of caching the failure.
					this.initPromise = null;
					throw error instanceof Error ? error : new Error(String(error));
				});
		}
		return this.initPromise;
	}

	private async initContext(): Promise<LlamaContext> {
		const context = await initLlama({
			model: `${this.modelDir}/${VLM_ARTIFACT.filename}`,
			n_ctx: VLM_CONTEXT_TOKENS,
			// D1: Metal on iOS; CPU-first Android (n_gpu_layers is iOS-only in
			// llama.rn anyway — explicit 0 documents the intent).
			n_gpu_layers: Platform.OS === "ios" ? 99 : 0,
			use_mlock: false,
			embedding: false,
			// Multimodal requires ctx_shift disabled to keep media token positions.
			ctx_shift: false,
		});

		try {
			const enabled = await context.initMultimodal({
				path: `${this.modelDir}/${MMPROJ_ARTIFACT.filename}`,
				use_gpu: Platform.OS === "ios",
			});
			if (!enabled) {
				throw new Error("initMultimodal returned false (mmproj rejected)");
			}
		} catch (error) {
			// Never leak a half-initialized context.
			await context.release().catch(() => undefined);
			throw error instanceof Error ? error : new Error(String(error));
		}

		return context;
	}

	/**
	 * Run one completion with the 120 s budget. On expiry stopCompletion() is
	 * issued and the ORIGINAL native promise is still awaited (bounded by a
	 * grace deadline) so the context is not reused mid-interrupt; the call then
	 * rejects with a timeout error either way.
	 */
	private completeWithTimeout(
		context: LlamaContext,
		params: CompletionParams,
	): Promise<NativeCompletionResult> {
		return new Promise<NativeCompletionResult>((resolve, reject) => {
			let timedOut = false;
			let graceTimer: ReturnType<typeof setTimeout> | undefined;

			const budgetTimer = setTimeout(() => {
				timedOut = true;
				context.stopCompletion().catch(() => undefined);
				graceTimer = setTimeout(() => {
					reject(
						new Error(
							`Gemma generation did not settle within ${INTERRUPT_GRACE_MS}ms of interrupt (budget ${GENERATION_TIMEOUT_MS}ms)`,
						),
					);
				}, INTERRUPT_GRACE_MS);
			}, GENERATION_TIMEOUT_MS);

			context
				.completion(params)
				.then(
					(result) => {
						if (timedOut) {
							reject(
								new Error(
									`Gemma generation timed out after ${GENERATION_TIMEOUT_MS}ms`,
								),
							);
							return;
						}
						resolve(result);
					},
					(error: unknown) => {
						reject(error instanceof Error ? error : new Error(String(error)));
					},
				)
				.finally(() => {
					clearTimeout(budgetTimer);
					if (graceTimer !== undefined) {
						clearTimeout(graceTimer);
					}
				});
		});
	}
}
