// utils/format.ts
export function formatCurrency(amount: number | null | undefined): string {
	// CRITICAL: Always return a string, never null or undefined
	if (amount === null || amount === undefined || isNaN(amount)) {
		return "N/A";
	}

	try {
		// Ensure we're working with a valid number
		const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

		if (isNaN(numAmount)) {
			return "N/A";
		}

		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(numAmount);
	} catch (error) {
		console.error("[formatCurrency] Error formatting amount:", amount, error);
		return "N/A";
	}
}

export function formatDate(
	date: Date | string | number | null | undefined,
): string {
	// CRITICAL: Always return a string, never null or undefined
	if (!date) {
		return "N/A";
	}

	try {
		let dateObj: Date;

		if (date instanceof Date) {
			dateObj = date;
		} else if (typeof date === "string") {
			dateObj = new Date(date);
		} else if (typeof date === "number") {
			dateObj = new Date(date);
		} else {
			return "N/A";
		}

		// Check if date is valid
		if (isNaN(dateObj.getTime())) {
			return "N/A";
		}

		return dateObj.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch (error) {
		console.error("[formatDate] Error formatting date:", date, error);
		return "N/A";
	}
}

export function formatFileSize(bytes: number | null | undefined): string {
	// CRITICAL: Always return a string
	if (bytes === null || bytes === undefined || isNaN(bytes)) {
		return "N/A";
	}

	try {
		const sizes = ["Bytes", "KB", "MB", "GB"];
		if (bytes === 0) return "0 Bytes";

		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		const size = parseFloat((bytes / 1024 ** i).toFixed(2));

		return `${size} ${sizes[i]}`;
	} catch (error) {
		console.error("[formatFileSize] Error formatting size:", bytes, error);
		return "N/A";
	}
}

export function formatPercentage(value: number | null | undefined): string {
	// CRITICAL: Always return a string
	if (value === null || value === undefined || isNaN(value)) {
		return "N/A";
	}

	try {
		const percentage = value * 100;
		return `${percentage.toFixed(1)}%`;
	} catch (error) {
		console.error(
			"[formatPercentage] Error formatting percentage:",
			value,
			error,
		);
		return "N/A";
	}
}

// Helper to ensure any value is a safe string for rendering
export function safeString(value: any): string {
	if (value === null || value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (value instanceof Date) {
		return formatDate(value);
	}

	// For objects or arrays, use JSON.stringify
	try {
		return JSON.stringify(value);
	} catch {
		return "[Complex Object]";
	}
}
