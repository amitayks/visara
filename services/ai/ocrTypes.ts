export type OCREngineName = "mlkit" | "vision-camera" | "tesseract" | "mock";

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
	language: string; // Always 'en'
}

export interface OCRResult {
	text: string;
	confidence: number;
	blocks: OCRBlock[];
	language: string; // Always 'en'
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
	targetLanguage?: "english"; // English only
}
