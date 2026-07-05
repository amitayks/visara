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
	/**
	 * Confidence score from 0.0 to 1.0. Absent for Gemma open-vocabulary tags
	 * (the VLM emits no per-tag scores).
	 */
	confidence?: number;
	/** Provenance of the label (e.g., "mlkit", "gemma") */
	source?: string;
	/** Label category (e.g., "tag") */
	type?: string;
}

/**
 * Display-only OCR text for UI rendering
 * Contains only the properties needed for display
 */
export interface DisplayOcrText {
	/** The extracted text content */
	text: string;
}

/**
 * Display-only Gemma enrichment for UI rendering
 * Contains the caption/description produced by on-device enrichment
 */
export interface DisplayEnrichment {
	/** Short caption summarizing the media */
	caption?: string;
	/** Longer descriptive text for the media */
	description?: string;
}
