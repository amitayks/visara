import { MMPROJ_ARTIFACT, VLM_ARTIFACT } from "@backend/model/manifest";
import type {
	AnalysisContext,
	VisionAnalysis,
	VisionEngine,
} from "@backend/types";
import {
	type CompletionParams,
	initLlama,
	type LlamaContext,
	type NativeCompletionResult,
} from "llama.rn";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { createMutex, type Mutex } from "../mutex";
import { coerceEnrichment, extractFirstJsonObject } from "./outputParser";
import { buildPrompt } from "./promptAssembly";

/**
 * Gemma 4 E2B vision runtime over llama.rn (personalized-vision-context
 * design D5; gemma-vision-enrichment spec). This module owns ONLY the native
 * runtime concerns — prompt content lives in promptAssembly, output shaping
 * in outputParser. One multimodal generation per photo; the context is
 * initialized lazily on the first analyze and released by dispose()
 * (pipeline calls it on stop / background / critical-thermal). `analyze`
 * resolves — never rejects — with the VisionAnalysis envelope.
 */

/** Per-image generation budget; on expiry the native generation is stopped. */
const GENERATION_TIMEOUT_MS = 120_000;

/**
 * After stopCompletion() the native promise settles almost immediately; if it
 * does not within this grace, give up waiting (concern: the context may then
 * still hold a dangling native op).
 */
const INTERRUPT_GRACE_MS = 10_000;

/** Context window: prompt + glossary + ~256-512 image tokens + JSON output. */
const VLM_CONTEXT_TOKENS = 4096;

/**
 * Output cap: the JSON object plus verbatim OCR of a text-dense photo.
 * Bounded so a rambling generation cannot eat the whole 120 s budget (and,
 * on CPU-bound Android, so the OCR long-tail doesn't double per-item time).
 */
const MAX_PREDICT_TOKENS = 512;

/**
 * Android CPU thread cap. llama.cpp's default grabs every core — on
 * big.LITTLE Snapdragons that schedules onto efficiency cores, which is
 * slower per token AND runs the SoC at maximum heat. Four threads (the big
 * cores) is the llama.cpp sweet spot on these parts.
 */
const ANDROID_VLM_THREADS = 4;

/*
 * Android accelerator note (benchmarked on OnePlus 10 Pro / SM8450, 2026-07):
 * tuned CPU is the fastest correct backend for this model — keep it.
 *  - CPU, 4 threads:   38-50 s/item, 9.3-9.6 tok/s   ← shipped
 *  - Adreno OpenCL:    80-117 s/item, 3.4-3.7 tok/s  (2x slower)
 *  - Hexagon HTP v69:  DSP-side libggml-htp crash + ColorOS FastRPC
 *    permission denials — unusable (llama.rn marks it Experimental)
 * Revisit only with a newer llama.rn OpenCL backend or Snapdragon 8 Gen 3+.
 * The accelerated .so also needs <uses-native-library libOpenCL/libcdsprpc>
 * manifest entries — deliberately NOT declared so the loader picks the plain
 * CPU variant and never probes the DSP.
 */

export class GemmaVisionEngine implements VisionEngine {
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
	 *
	 * `imagePath` is an already-prepared, decoded+downscaled JPEG path (design
	 * D9 of the rebuild: ImagePrep belongs to the pipeline step, which owns the
	 * temp file's lifecycle). `analysisContext` personalizes the prompt; absent
	 * or empty it degrades to the generic prompt (fail-soft).
	 */
	analyze(
		imagePath: string,
		analysisContext?: AnalysisContext,
	): Promise<VisionAnalysis> {
		return this.runExclusive(async () => {
			const startedAt = Date.now();
			// llama.cpp fopens a plain path; strip a file:// scheme if present.
			const path = imagePath.startsWith("file://")
				? imagePath.slice("file://".length)
				: imagePath;

			try {
				const prompt = buildPrompt(analysisContext);
				const context = await this.ensureContext();
				const completion = await this.completeWithTimeout(context, {
					messages: [
						{ role: "system", content: prompt.system },
						{
							role: "user",
							content: [
								{ type: "text", text: prompt.user },
								// llama.rn replaces this part with its media marker and
								// forwards the path natively (GGUF chat template applied by
								// llama.rn itself — no manual formatting here).
								{ type: "image_url", image_url: { url: path } },
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
				console.warn("[GemmaVisionEngine] releaseMultimodal failed:", error);
			}
			try {
				await context.release();
			} catch (error) {
				console.warn("[GemmaVisionEngine] release failed:", error);
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
		// Metal on real iOS hardware only. The iOS Simulator's emulated Metal
		// driver (MTLSimDriver) crashes when clip/mmproj allocates its GPU buffer
		// (XPC shared-memory misuse), so simulator QA runs CPU — the sanctioned
		// end-to-end path. Android is always CPU-first.
		const useMetal = Platform.OS === "ios" && !DeviceInfo.isEmulatorSync();
		const context = await initLlama({
			model: `${this.modelDir}/${VLM_ARTIFACT.filename}`,
			n_ctx: VLM_CONTEXT_TOKENS,
			n_gpu_layers: useMetal ? 99 : 0,
			...(Platform.OS === "android" ? { n_threads: ANDROID_VLM_THREADS } : {}),
			use_mlock: false,
			embedding: false,
			// Multimodal requires ctx_shift disabled to keep media token positions.
			ctx_shift: false,
		});

		try {
			const enabled = await context.initMultimodal({
				path: `${this.modelDir}/${MMPROJ_ARTIFACT.filename}`,
				use_gpu: useMetal,
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
