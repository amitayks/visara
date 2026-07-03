import { type TurboModule, TurboModuleRegistry } from "react-native";

/**
 * Result of an Apple Vision OCR pass. Mirrors the `TextRecognitionResult`
 * sub-shape consumed by `TextRecognitionService`: `text` is the recognized
 * strings joined in reading order, `blocks` is a JSON string of the per-line
 * detections (`{ text, confidence, bbox }`).
 */
export interface VisionTextRecognitionResult {
	text: string;
	blocks: string;
}

export interface Spec extends TurboModule {
	recognizeText(imagePath: string): Promise<VisionTextRecognitionResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
	"VisionTextRecognizerModule",
);
