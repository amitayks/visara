import { ThumbnailService } from "@services/media/ThumbnailService";
import type {
	GemmaEnrichment,
	GemmaTag,
	ProcessingResult,
} from "@services/ml/ProcessingService";
import { GEMMA_MODEL_VERSION } from "@services/model/gemmaModelManifest";
import {
	isAvailable,
	LLMModule,
	type Message,
	models,
} from "react-native-executorch";
import type { AnalysisEngineDescriptor } from "./AnalysisEngine";

/**
 * Provenance: the model-version stamp is owned SOLELY by the model-delivery
 * manifest (`GEMMA_MODEL_VERSION` in `@services/model/gemmaModelManifest`), so
 * the value stamped into `media_files.ai_model_version` always equals the
 * idempotency key that delivery (#6) and reprocessing (#10) compare against —
 * pin the real tag once, there.
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): whether `"ocr"` joins
 * `descriptor.capabilities` below, once the POC confirms Gemma's OCR reliability.
 */

/**
 * Per-image generation budget. On expiry the in-flight `generate` is
 * interrupted and the image fails closed.
 *
 * POC-DEPENDENT (#4 on-device Gemma POC): tune to the measured on-device
 * latency — too tight fails every image, too loose starves the drain.
 */
const GENERATION_TIMEOUT_MS = 120_000;

/**
 * POC-DEPENDENT (#4 on-device Gemma POC): the prompt text and the requested
 * output shape are a sensible default and MUST be re-tuned against the real
 * on-device output. The engine asks for a single JSON object so the parser can
 * lift caption/description/open-vocabulary tags; it falls back to treating the
 * whole raw string as the caption when no JSON is present.
 */
const SYSTEM_PROMPT =
	"You are a precise on-device image analysis assistant. Analyze the provided image and respond with a single JSON object and nothing else.";

const USER_PROMPT =
	'Describe this image. Respond ONLY with a JSON object of the form {"caption": "<one short sentence>", "description": "<two to three sentence detailed description>", "tags": ["tag1", "tag2"]}. Use lowercase open-vocabulary tags for the salient objects, the scene, and notable attributes.';

/**
 * `GemmaMultimodalService` — the Tier-1 multimodal `AnalysisEngine` (the
 * producer that fills the `tier1` / caption+description+tags seam reserved by
 * `analysis-engine-interface`). All-static, framework-agnostic (no `react` /
 * `useLLM`), so it runs inside the no-React background drain
 * (`OrchestratorService`). Conformance to `AnalysisEngine` is enforced by the
 * type system at its `EngineRegistry.register(...)` use site, matching
 * `MlKitEngine` (no throwaway conformance local).
 *
 * Loading is lazy and single-instance; inference runs through the imperative
 * `LLMModule` (NOT the `useLLM` hook), decoding the image to a `file://` JPEG
 * via `ThumbnailService`. `analyze` resolves-never-rejects, matching
 * `MlKitEngine`'s envelope byte-for-byte.
 *
 * SCOPE: this change registers the engine but does NOT wire it into the drain
 * (no `ProcessingService.setEngine`, no `tier1_gemma` selection) — Tier-1
 * selection / `canRunTier1()` gating / drain wiring belong to #10.
 */
export class GemmaMultimodalService {
	static readonly descriptor: AnalysisEngineDescriptor = {
		id: "gemma",
		tier: "tier1",
		// POC-DEPENDENT (#4): add "ocr" here once the POC confirms Gemma reliably
		// transcribes on-image text (else Tier-0 ML Kit OCR stays authoritative).
		capabilities: ["caption", "description", "tags"],
		modelVersion: GEMMA_MODEL_VERSION,
	};

	/** The single loaded model instance (null until the first `analyze`). */
	private static llm: LLMModule | null = null;
	/** Shared in-flight load promise so concurrent first calls load once. */
	private static loadPromise: Promise<LLMModule> | null = null;
	/** Generation mutex: serializes `generate` calls (single-threaded runtime). */
	private static inflight: Promise<unknown> | null = null;

	/**
	 * Lazily load `models.llm.gemma4_e2b_multimodal()` at most once and reuse it.
	 * Concurrent first calls share one in-flight load promise. Throws when the
	 * native runtime is unavailable (caught by `analyze` → `success: false`).
	 */
	private static async ensureLoaded(): Promise<LLMModule> {
		if (this.llm) {
			return this.llm;
		}
		if (this.loadPromise) {
			return this.loadPromise;
		}
		if (!isAvailable) {
			throw new Error("ExecuTorch runtime is unavailable on this device");
		}

		this.loadPromise = LLMModule.fromModelName(
			models.llm.gemma4_e2b_multimodal(),
		)
			.then((llm) => {
				this.llm = llm;
				return llm;
			})
			.finally(() => {
				// Clear on settle: success caches `this.llm`; failure allows a retry.
				this.loadPromise = null;
			});

		return this.loadPromise;
	}

	/**
	 * Produce Tier-1 enrichment for one image. Resolves (never rejects) with the
	 * additive `gemma` payload on success, or `MlKitEngine`'s failure envelope on
	 * any error / timeout / unavailable runtime.
	 */
	static async analyze(imageUri: string): Promise<ProcessingResult> {
		const startTime = Date.now();

		try {
			// Decode to a runtime-readable `file://` JPEG. The ExecuTorch image
			// decoder cannot read `content://` MediaStore URIs, so never pass the
			// raw URI — always the ThumbnailService path.
			const mediaPath = await ThumbnailService.getThumbnail(imageUri, "large");
			const llm = await this.ensureLoaded();

			const messages: Message[] = [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: USER_PROMPT, mediaPath },
			];

			// Serialize generation (defensive: the drain calls sequentially, but a
			// second concurrent `generate` on one controller is unsafe).
			const raw = await this.runExclusive(() =>
				this.generateWithTimeout(llm, messages),
			);

			const gemma = this.parseEnrichment(raw);

			return {
				imageLabeling: { labels: [], processingTime: 0 },
				textRecognition: { text: "", blocks: "[]", processingTime: 0 },
				totalProcessingTime: Date.now() - startTime,
				success: true,
				gemma,
			};
		} catch (error) {
			console.error("GemmaMultimodalService.analyze error:", error);

			// Resolve-never-reject fallback, matching MlKitEngine's envelope. No
			// partial `gemma` is attached on failure.
			return {
				imageLabeling: { labels: [], processingTime: 0 },
				textRecognition: { text: "", blocks: "[]", processingTime: 0 },
				totalProcessingTime: Date.now() - startTime,
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown processing error",
			};
		}
	}

	/**
	 * Free the loaded model (memory-release seam for #5/#10). NOT called anywhere
	 * in this change. Callers must ensure no generation is in flight first (the
	 * runtime cannot delete mid-generation).
	 */
	static dispose(): void {
		if (this.llm) {
			this.llm.delete();
			this.llm = null;
		}
		this.loadPromise = null;
	}

	/**
	 * Serialize a task onto the single generation mutex: each call waits for the
	 * previous one to settle before running.
	 */
	private static runExclusive<T>(task: () => Promise<T>): Promise<T> {
		const previous = this.inflight ?? Promise.resolve();
		// Run `task` whether the previous task fulfilled or rejected.
		const result = previous.then(task, task);
		// Next caller waits on this one's completion (result swallowed here so the
		// mutex never carries a rejection forward).
		this.inflight = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	/**
	 * Race `generate` against the per-image timeout; on expiry interrupt the
	 * runtime and reject (routed to the failure envelope by `analyze`).
	 */
	private static generateWithTimeout(
		llm: LLMModule,
		messages: Message[],
	): Promise<string> {
		let timer: ReturnType<typeof setTimeout> | undefined;

		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				llm.interrupt();
				reject(
					new Error(
						`Gemma generation timed out after ${GENERATION_TIMEOUT_MS}ms`,
					),
				);
			}, GENERATION_TIMEOUT_MS);
		});

		return Promise.race([llm.generate(messages), timeout]).finally(() => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		});
	}

	/**
	 * POC-DEPENDENT (#4 on-device Gemma POC): parse the model output into a
	 * `GemmaEnrichment`. Parses to `unknown` and narrows with type guards (no
	 * `any`). Tries a JSON object first (caption / description / open-vocabulary
	 * tags); falls back to treating the whole output as the caption. Always keeps
	 * the raw string in `gemma.raw` for debugging.
	 */
	private static parseEnrichment(raw: string): GemmaEnrichment {
		const parsed = this.tryParseJsonObject(raw);
		if (parsed) {
			return {
				caption: parsed.caption,
				description: parsed.description,
				tags: parsed.tags,
				raw,
			};
		}

		const trimmed = raw.trim();
		return {
			caption: trimmed.length > 0 ? trimmed : undefined,
			tags: [],
			raw,
		};
	}

	private static tryParseJsonObject(
		raw: string,
	): { caption?: string; description?: string; tags: GemmaTag[] } | null {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start === -1 || end <= start) {
			return null;
		}

		let value: unknown;
		try {
			value = JSON.parse(raw.slice(start, end + 1));
		} catch {
			return null;
		}

		if (typeof value !== "object" || value === null) {
			return null;
		}

		const record = value as Record<string, unknown>;
		const caption =
			typeof record.caption === "string" ? record.caption : undefined;
		const description =
			typeof record.description === "string" ? record.description : undefined;
		const tags = this.normalizeTags(record.tags);

		if (
			caption === undefined &&
			description === undefined &&
			tags.length === 0
		) {
			return null;
		}

		return { caption, description, tags };
	}

	private static normalizeTags(value: unknown): GemmaTag[] {
		if (!Array.isArray(value)) {
			return [];
		}

		const tags: GemmaTag[] = [];
		for (const entry of value as unknown[]) {
			if (typeof entry === "string") {
				const text = entry.trim();
				if (text.length > 0) {
					tags.push({ text });
				}
				continue;
			}

			if (typeof entry === "object" && entry !== null) {
				const record = entry as Record<string, unknown>;
				const label =
					typeof record.text === "string"
						? record.text
						: typeof record.label === "string"
							? record.label
							: undefined;
				const text = label?.trim();
				if (text && text.length > 0) {
					const confidence =
						typeof record.confidence === "number"
							? record.confidence
							: undefined;
					tags.push({ text, confidence });
				}
			}
		}

		return tags;
	}
}
