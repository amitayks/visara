/**
 * Display-only types for UI components
 * These are lightweight alternatives to full WatermelonDB model types
 */

/**
 * Display-only label for UI rendering
 * Contains only the properties needed for display
 */
export interface DisplayLabel {
	/** Unique identifier */
	id: string;
	/** The label text (e.g., "sunset", "dog", "mountain") */
	label: string;
	/** Confidence score from 0.0 to 1.0 */
	confidence: number;
}

/**
 * Display-only OCR text for UI rendering
 * Contains only the properties needed for display
 */
export interface DisplayOcrText {
	/** The extracted text content */
	text: string;
}
