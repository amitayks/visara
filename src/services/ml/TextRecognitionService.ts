/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */
import type { Spec as VisionTextRecognizerSpec } from "@native-modules/NativeVisionTextRecognizer";
import { Platform } from "react-native";
import {
	isAvailable,
	OCR_ENGLISH,
	type OCRDetection,
	OCRModule,
} from "react-native-executorch";

export interface TextRecognitionResult {
	text: string;
	blocks: string;
	processingTime: number;
}

export class TextRecognitionService {
	/**
	 * Lazily-loaded, memoized executorch OCR module (CRAFT detector + CRNN
	 * recognizer, `OCR_ENGLISH`, XNNPACK/CPU). The first `extractText` call kicks
	 * off `fromModelName`; concurrent calls await the same promise. A rejected
	 * load clears the memo so a later call can retry rather than poisoning the
	 * service permanently (design D3).
	 */
	private static modulePromise: Promise<OCRModule> | null = null;

	/**
	 * POC/parity-gated (design D6): which OCR source iOS uses at runtime. Defaults
	 * to executorch (Android always uses executorch OCR). The deferred on-device
	 * parity harness may flip this to `"vision"` once executorch OCR is scored
	 * against the ML Kit baseline. On-device parity scoring is deferred — there is
	 * no device available (stakeholder decision); see the change's task 8.
	 */
	private static iosOcrSource: "executorch" | "vision" = "executorch";

	private static loadModule(): Promise<OCRModule> {
		if (!this.modulePromise) {
			this.modulePromise = OCRModule.fromModelName(OCR_ENGLISH).catch(
				(error: unknown) => {
					// Clear the memo so a later call can retry the load.
					this.modulePromise = null;
					throw error;
				},
			);
		}
		return this.modulePromise;
	}

	static async extractText(imageUri: string): Promise<TextRecognitionResult> {
		const startTime = Date.now();
		const forceVision = Platform.OS === "ios" && this.iosOcrSource === "vision";

		// Primary path: executorch OCR (CPU everywhere, incl. arm64 simulator).
		if (!forceVision && isAvailable) {
			try {
				const ocrModule = await this.loadModule();
				const detections = await ocrModule.forward(imageUri);
				return this.adaptDetections(detections, startTime);
			} catch (error) {
				if (Platform.OS !== "ios") {
					console.error("TextRecognitionService.extractText error:", error);
					throw new Error(
						`Failed to extract text from image: ${error instanceof Error ? error.message : "Unknown error"}`,
					);
				}
				// iOS: fall through to the Apple Vision fallback below.
				console.warn(
					"TextRecognitionService: executorch OCR failed on iOS, falling back to Apple Vision:",
					error,
				);
			}
		}

		// iOS fallback: Apple Vision (VNRecognizeTextRequest), selected when
		// executorch OCR is unavailable/failed or the parity gate chose Vision.
		if (Platform.OS === "ios") {
			return this.extractTextWithVision(imageUri, startTime);
		}

		// Android with executorch unavailable and no fallback: surface to the
		// engine's existing success:false path (resolve-not-reject contract, D1).
		throw new Error(
			"Text recognition unavailable: the ExecuTorch runtime is not available on this device",
		);
	}

	/**
	 * Adapt `OCRDetection[]` into the existing `TextRecognitionResult` shape.
	 * `text` joins detections in reading order (top-to-bottom, then left-to-right
	 * by `bbox`); `blocks` serializes the reading-ordered detections as a JSON
	 * stand-in for ML Kit's block JSON. POC-gated (design D4): the exact
	 * line-grouping / separator and the `blocks` schema are finalized against real
	 * on-device `OCRDetection[]` output.
	 */
	private static adaptDetections(
		detections: OCRDetection[],
		startTime: number,
	): TextRecognitionResult {
		const ordered = [...detections].sort(
			(a, b) => a.bbox.y1 - b.bbox.y1 || a.bbox.x1 - b.bbox.x1,
		);

		return {
			text: ordered.map((detection) => detection.text).join(" "),
			blocks: JSON.stringify(ordered),
			processingTime: Date.now() - startTime,
		};
	}

	/**
	 * iOS-only Apple Vision OCR fallback (design D5). The native module is
	 * required lazily so Android never evaluates its top-level `getEnforcing`
	 * (there is no Android implementation — task 4.3). The native side already
	 * returns `{ text, blocks }`, so it maps straight onto `TextRecognitionResult`.
	 */
	private static async extractTextWithVision(
		imageUri: string,
		startTime: number,
	): Promise<TextRecognitionResult> {
		const nativeModule = (
			require("@native-modules/NativeVisionTextRecognizer") as {
				default: VisionTextRecognizerSpec;
			}
		).default;

		const result = await nativeModule.recognizeText(imageUri);

		return {
			text: result.text,
			blocks: result.blocks,
			processingTime: Date.now() - startTime,
		};
	}

	static hasText(result: TextRecognitionResult): boolean {
		return result.text.trim().length > 0;
	}
}
