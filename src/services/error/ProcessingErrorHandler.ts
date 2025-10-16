/**
 * Processing Error Handler
 * Maps ML Kit and processing errors to user-friendly messages
 * Logs failed files without automatic retry (per constitutional requirement)
 *
 * Constitutional Compliance:
 * - AI Processing Guidelines: No automatic retry for failed files
 * - User Experience Excellence: Clear error messages with context
 */

/**
 * Error types that can occur during processing
 */
export enum ProcessingErrorType {
	ML_KIT_ERROR = "ML_KIT_ERROR",
	IMAGE_LABELING_ERROR = "IMAGE_LABELING_ERROR",
	TEXT_RECOGNITION_ERROR = "TEXT_RECOGNITION_ERROR",
	FILE_ACCESS_ERROR = "FILE_ACCESS_ERROR",
	MEMORY_ERROR = "MEMORY_ERROR",
	STORAGE_ERROR = "STORAGE_ERROR",
	CORRUPTED_FILE_ERROR = "CORRUPTED_FILE_ERROR",
	UNSUPPORTED_FORMAT_ERROR = "UNSUPPORTED_FORMAT_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Processing error details
 */
export interface ProcessingError {
	type: ProcessingErrorType;
	message: string;
	userMessage: string;
	filePath: string;
	timestamp: number;
	originalError?: Error;
}

/**
 * Map error codes to error types
 */
function mapErrorToType(error: Error): ProcessingErrorType {
	const message = error.message.toLowerCase();

	// ML Kit specific errors
	if (message.includes("mlkit") || message.includes("ml kit")) {
		return ProcessingErrorType.ML_KIT_ERROR;
	}

	if (
		message.includes("image labeling") ||
		message.includes("label detection")
	) {
		return ProcessingErrorType.IMAGE_LABELING_ERROR;
	}

	if (
		message.includes("text recognition") ||
		message.includes("ocr") ||
		message.includes("text detection")
	) {
		return ProcessingErrorType.TEXT_RECOGNITION_ERROR;
	}

	// File access errors
	if (
		message.includes("permission denied") ||
		message.includes("access denied") ||
		message.includes("eacces")
	) {
		return ProcessingErrorType.FILE_ACCESS_ERROR;
	}

	// Memory errors
	if (
		message.includes("out of memory") ||
		message.includes("oom") ||
		message.includes("memory limit")
	) {
		return ProcessingErrorType.MEMORY_ERROR;
	}

	// Storage errors
	if (
		message.includes("no space left") ||
		message.includes("disk full") ||
		message.includes("enospc")
	) {
		return ProcessingErrorType.STORAGE_ERROR;
	}

	// File corruption
	if (
		message.includes("corrupt") ||
		message.includes("invalid image") ||
		message.includes("decode failed")
	) {
		return ProcessingErrorType.CORRUPTED_FILE_ERROR;
	}

	// Unsupported format
	if (
		message.includes("unsupported") ||
		message.includes("invalid format") ||
		message.includes("format not recognized")
	) {
		return ProcessingErrorType.UNSUPPORTED_FORMAT_ERROR;
	}

	return ProcessingErrorType.UNKNOWN_ERROR;
}

/**
 * Get user-friendly error message
 */
function getUserMessage(type: ProcessingErrorType): string {
	switch (type) {
		case ProcessingErrorType.ML_KIT_ERROR:
			return "AI processing failed. The file will be marked as unprocessed.";
		case ProcessingErrorType.IMAGE_LABELING_ERROR:
			return "Could not detect objects in this image. The file will still be visible.";
		case ProcessingErrorType.TEXT_RECOGNITION_ERROR:
			return "Could not extract text from this image. The file will still be visible.";
		case ProcessingErrorType.FILE_ACCESS_ERROR:
			return "Cannot access this file. Please check permissions.";
		case ProcessingErrorType.MEMORY_ERROR:
			return "Not enough memory to process this file. Processing will continue with other files.";
		case ProcessingErrorType.STORAGE_ERROR:
			return "Device storage is full. Free up space to continue processing.";
		case ProcessingErrorType.CORRUPTED_FILE_ERROR:
			return "This file appears to be corrupted and cannot be processed.";
		case ProcessingErrorType.UNSUPPORTED_FORMAT_ERROR:
			return "This file format is not supported for AI processing.";
		case ProcessingErrorType.UNKNOWN_ERROR:
			return "An unexpected error occurred while processing this file.";
	}
}

/**
 * Processing Error Handler Service
 */
export class ProcessingErrorHandler {
	private static failedFiles: Map<string, ProcessingError> = new Map();

	/**
	 * Handle processing error
	 * Logs error and returns user-friendly error details
	 * NO AUTOMATIC RETRY (constitutional requirement)
	 */
	static handleError(error: Error, filePath: string): ProcessingError {
		const errorType = mapErrorToType(error);
		const userMessage = getUserMessage(errorType);

		const processingError: ProcessingError = {
			type: errorType,
			message: error.message,
			userMessage,
			filePath,
			timestamp: Date.now(),
			originalError: error,
		};

		// Log failed file (no retry)
		this.failedFiles.set(filePath, processingError);

		// Log to console in development
		if (__DEV__) {
			console.error(
				`[ProcessingError] ${errorType} for file: ${filePath}`,
				error,
			);
		}

		return processingError;
	}

	/**
	 * Get failed files
	 */
	static getFailedFiles(): Map<string, ProcessingError> {
		return this.failedFiles;
	}

	/**
	 * Get failed file by path
	 */
	static getFailedFile(filePath: string): ProcessingError | undefined {
		return this.failedFiles.get(filePath);
	}

	/**
	 * Check if file has failed processing
	 */
	static hasFailedProcessing(filePath: string): boolean {
		return this.failedFiles.has(filePath);
	}

	/**
	 * Clear failed file (e.g., when file is deleted)
	 */
	static clearFailedFile(filePath: string): void {
		this.failedFiles.delete(filePath);
	}

	/**
	 * Clear all failed files
	 */
	static clearAllFailedFiles(): void {
		this.failedFiles.clear();
	}

	/**
	 * Get failed files count
	 */
	static getFailedFilesCount(): number {
		return this.failedFiles.size;
	}

	/**
	 * Determine if error is critical (should pause processing)
	 */
	static isCriticalError(error: ProcessingError): boolean {
		return (
			error.type === ProcessingErrorType.MEMORY_ERROR ||
			error.type === ProcessingErrorType.STORAGE_ERROR
		);
	}

	/**
	 * Get suggested action for error
	 */
	static getSuggestedAction(error: ProcessingError): string | null {
		switch (error.type) {
			case ProcessingErrorType.FILE_ACCESS_ERROR:
				return "Check app permissions in system settings";
			case ProcessingErrorType.STORAGE_ERROR:
				return "Free up device storage space";
			case ProcessingErrorType.MEMORY_ERROR:
				return "Close other apps to free memory";
			case ProcessingErrorType.CORRUPTED_FILE_ERROR:
				return "You may delete this file or try opening it in another app";
			default:
				return null;
		}
	}
}
