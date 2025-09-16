export type OCREngineName = "mlkit" | "mock"; // Simplified - only MLKit and mock for testing

export interface OCRBoundingBox {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	confidence: number;
}

export interface OCRBlock {
	text: string;
	confidence: number;
	boundingBox: OCRBoundingBox;
	language: string; // 'en', 'he', or 'auto' for mixed
}

export interface OCRResult {
	text: string;
	confidence: number;
	blocks: OCRBlock[];
	language: string; // 'en', 'he', or 'auto' for mixed
	processingTime: number;
	engine: OCREngineName;
}

export interface LocalOCREngine {
	name: OCREngineName;
	displayName: string;
	processImage(uri: string): Promise<OCRResult>;
	isInitialized(): boolean;
	initialize(): Promise<void>;
	supportsLanguage(lang: string): boolean;
	getSupportedLanguages(): string[];
	getMemoryUsage?(): number;
}

export interface OCRComparison {
	imageUri: string;
	timestamp: Date;
	results: OCRResult[];
	bestEngine: OCREngineName;
	processingStats: {
		totalTime: number;
		preprocessTime: number;
	};
}

export interface PreprocessingOptions {
	resize?: {
		maxWidth: number;
		maxHeight: number;
	};
	autoRotate?: boolean;
	enhanceContrast?: boolean;
	binarize?: boolean;
	noiseReduction?: boolean;
	brightnessAdjustment?: number;
	targetLanguage?: "english" | "hebrew" | "auto"; // Supported languages
}
