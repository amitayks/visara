import {
	TemporalExpression,
	DocumentType,
	TEMPORAL_KEYWORDS,
} from "./searchTypes";

export class AdvancedTemporalParser {
	private readonly today: Date;
	private readonly monthNames = {
		en: [
			"january",
			"february",
			"march",
			"april",
			"may",
			"june",
			"july",
			"august",
			"september",
			"october",
			"november",
			"december",
		],
		he: [
			"ינואר",
			"פברואר",
			"מרץ",
			"אפריל",
			"מאי",
			"יוני",
			"יולי",
			"אוגוסט",
			"ספטמבר",
			"אוקטובר",
			"נובמבר",
			"דצמבר",
		],
	};

	constructor(referenceDate?: Date) {
		this.today = referenceDate || new Date();
		this.today.setHours(0, 0, 0, 0);
	}

	parse(text: string): TemporalExpression | null {
		const normalizedText = text.toLowerCase().trim();

		// Try different parsing strategies
		const result =
			this.parseCountExpression(normalizedText) ||
			this.parseRelativeExpression(normalizedText) ||
			this.parseQuarterExpression(normalizedText) ||
			this.parseRangeExpression(normalizedText) ||
			this.parseFiscalExpression(normalizedText) ||
			this.parseSeasonExpression(normalizedText) ||
			this.parseSpecificDate(normalizedText) ||
			this.parseMonthYear(normalizedText);

		return result;
	}

	private parseCountExpression(text: string): TemporalExpression | null {
		// Parse patterns like "last 5 receipts", "previous 3 invoices", "past 2 tax returns"
		const countPatterns = [
			/(?:last|previous|past|latest)\s+(\d+)\s+(\w+)/i,
			/(\d+)\s+(?:last|previous|recent)\s+(\w+)/i,
			/top\s+(\d+)\s+(\w+)/i,
			/האחרונים\s+(\d+)\s+(\w+)/,
			/(\d+)\s+(\w+)\s+האחרונים/,
		];

		for (const pattern of countPatterns) {
			const match = text.match(pattern);
			if (match) {
				const count = parseInt(match[1], 10);
				const entityText = match[2];

				// Check if it's a document type
				const documentType = this.extractDocumentType(entityText);
				if (documentType) {
					return {
						type: "count",
						count,
						documentType,
						direction: "past",
					};
				}

				// Check if it's a time unit
				const timeUnit = this.extractTimeUnit(entityText);
				if (timeUnit) {
					const { startDate, endDate } = this.calculateDateRange(
						count,
						timeUnit,
						"past",
					);
					return {
						type: "relative",
						startDate,
						endDate,
						count,
						unit: timeUnit,
						direction: "past",
					};
				}
			}
		}

		return null;
	}

	private parseRelativeExpression(text: string): TemporalExpression | null {
		// Parse patterns like "last week", "past month", "last 30 days"
		const relativePatterns = [
			/(?:last|past|previous)\s+(\d+)?\s*(day|week|month|quarter|year)s?/i,
			/(?:next|upcoming)\s+(\d+)?\s*(day|week|month|quarter|year)s?/i,
			/within\s+(?:the\s+)?(?:last|past)\s+(\d+)\s*(day|week|month|quarter|year)s?/i,
			/(\d+)\s*(day|week|month|quarter|year)s?\s+ago/i,
			/בשבוע\s+האחרון/,
			/בחודש\s+האחרון/,
			/בשנה\s+האחרונה/,
			/לפני\s+(\d+)\s*(יום|שבוע|חודש|שנה)/,
		];

		for (const pattern of relativePatterns) {
			const match = text.match(pattern);
			if (match) {
				const count = match[1] ? parseInt(match[1], 10) : 1;
				const unitText = match[2] || match[0];
				const unit = this.extractTimeUnit(unitText);

				if (unit) {
					const direction = this.getDirection(text);
					const { startDate, endDate } = this.calculateDateRange(
						count,
						unit,
						direction,
					);

					return {
						type: "relative",
						startDate,
						endDate,
						count,
						unit,
						direction,
					};
				}
			}
		}

		// Handle special relative terms
		if (text.includes("today") || text.includes("היום")) {
			return {
				type: "absolute",
				startDate: new Date(this.today),
				endDate: new Date(this.today),
			};
		}

		if (text.includes("yesterday") || text.includes("אתמול")) {
			const yesterday = new Date(this.today);
			yesterday.setDate(yesterday.getDate() - 1);
			return {
				type: "absolute",
				startDate: yesterday,
				endDate: yesterday,
			};
		}

		if (text.includes("tomorrow") || text.includes("מחר")) {
			const tomorrow = new Date(this.today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			return {
				type: "absolute",
				startDate: tomorrow,
				endDate: tomorrow,
			};
		}

		if (text.includes("this week") || text.includes("השבוע")) {
			const { startDate, endDate } = this.getWeekRange(this.today);
			return {
				type: "relative",
				startDate,
				endDate,
				unit: "week",
				direction: "past",
			};
		}

		if (text.includes("this month") || text.includes("החודש")) {
			const startDate = new Date(
				this.today.getFullYear(),
				this.today.getMonth(),
				1,
			);
			const endDate = new Date(
				this.today.getFullYear(),
				this.today.getMonth() + 1,
				0,
			);
			return {
				type: "relative",
				startDate,
				endDate,
				unit: "month",
				direction: "past",
			};
		}

		if (text.includes("this year") || text.includes("השנה")) {
			const startDate = new Date(this.today.getFullYear(), 0, 1);
			const endDate = new Date(this.today.getFullYear(), 11, 31);
			return {
				type: "relative",
				startDate,
				endDate,
				unit: "year",
				direction: "past",
			};
		}

		return null;
	}

	private parseQuarterExpression(text: string): TemporalExpression | null {
		// Parse patterns like "Q1 2024", "second quarter 2024", "last quarter"
		const quarterPatterns = [
			/Q([1-4])\s*(\d{4})?/i,
			/(first|second|third|fourth|1st|2nd|3rd|4th)\s+quarter\s*(\d{4})?/i,
			/quarter\s+([1-4])\s*(\d{4})?/i,
			/רבעון\s+([1-4])\s*(\d{4})?/,
			/(ראשון|שני|שלישי|רביעי)\s+רבעון\s*(\d{4})?/,
		];

		for (const pattern of quarterPatterns) {
			const match = text.match(pattern);
			if (match) {
				const quarterNum = this.extractQuarterNumber(match[1]);
				const year = match[2]
					? parseInt(match[2], 10)
					: this.today.getFullYear();

				if (quarterNum) {
					const { startDate, endDate } = this.getQuarterRange(quarterNum, year);
					return {
						type: "quarter",
						startDate,
						endDate,
						unit: "quarter",
					};
				}
			}
		}

		// Handle "last quarter"
		if (text.includes("last quarter") || text.includes("הרבעון האחרון")) {
			const currentQuarter = Math.floor(this.today.getMonth() / 3) + 1;
			const lastQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
			const year =
				currentQuarter === 1
					? this.today.getFullYear() - 1
					: this.today.getFullYear();

			const { startDate, endDate } = this.getQuarterRange(lastQuarter, year);
			return {
				type: "quarter",
				startDate,
				endDate,
				unit: "quarter",
				direction: "past",
			};
		}

		return null;
	}

	private parseRangeExpression(text: string): TemporalExpression | null {
		// Parse patterns like "between January and March", "from 01/01 to 03/31"
		const rangePatterns = [
			/between\s+(.+?)\s+and\s+(.+)/i,
			/from\s+(.+?)\s+to\s+(.+)/i,
			/בין\s+(.+?)\s+ל(.+)/,
			/מ(.+?)\s+עד\s+(.+)/,
		];

		for (const pattern of rangePatterns) {
			const match = text.match(pattern);
			if (match) {
				const startText = match[1].trim();
				const endText = match[2].trim();

				const startDate = this.parseDate(startText);
				const endDate = this.parseDate(endText);

				if (startDate && endDate) {
					return {
						type: "range",
						startDate,
						endDate,
					};
				}
			}
		}

		return null;
	}

	private parseFiscalExpression(text: string): TemporalExpression | null {
		// Parse patterns like "fiscal year 2024", "FY 2024", "tax year 2023"
		const fiscalPatterns = [
			/(?:fiscal|tax)\s+year\s+(\d{4})/i,
			/FY\s*(\d{4})/i,
			/שנת\s+מס\s+(\d{4})/,
		];

		for (const pattern of fiscalPatterns) {
			const match = text.match(pattern);
			if (match) {
				const year = parseInt(match[1], 10);
				// Assuming fiscal year starts April 1st
				const startDate = new Date(year, 3, 1); // April 1st
				const endDate = new Date(year + 1, 2, 31); // March 31st next year

				return {
					type: "fiscal",
					startDate,
					endDate,
					unit: "year",
				};
			}
		}

		return null;
	}

	private parseSeasonExpression(text: string): TemporalExpression | null {
		// Parse seasonal expressions
		const seasons = Object.entries(TEMPORAL_KEYWORDS.seasons);

		for (const [season, keywords] of seasons) {
			for (const keyword of keywords) {
				if (text.includes(keyword.toLowerCase())) {
					const year = this.extractYear(text) || this.today.getFullYear();
					const { startDate, endDate } = this.getSeasonRange(season, year);

					return {
						type: "range",
						startDate,
						endDate,
					};
				}
			}
		}

		return null;
	}

	private parseSpecificDate(text: string): TemporalExpression | null {
		// Parse specific date formats
		const datePatterns = [
			/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/, // MM/DD/YYYY or DD/MM/YYYY
			/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/, // YYYY/MM/DD
			/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{2,4})/i,
			/(\d{1,2})\s+ב?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+(\d{2,4})/,
		];

		for (const pattern of datePatterns) {
			const match = text.match(pattern);
			if (match) {
				const date = this.constructDate(match);
				if (date) {
					return {
						type: "absolute",
						startDate: date,
						endDate: date,
					};
				}
			}
		}

		return null;
	}

	private parseMonthYear(text: string): TemporalExpression | null {
		// Parse patterns like "March 2024", "מרץ 2024"
		const monthYearPatterns = [
			/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
			/(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+(\d{4})/,
		];

		for (const pattern of monthYearPatterns) {
			const match = text.match(pattern);
			if (match) {
				const monthIndex = this.getMonthIndex(match[1]);
				const year = parseInt(match[2], 10);

				if (monthIndex !== -1) {
					const startDate = new Date(year, monthIndex, 1);
					const endDate = new Date(year, monthIndex + 1, 0);

					return {
						type: "absolute",
						startDate,
						endDate,
					};
				}
			}
		}

		return null;
	}

	private extractDocumentType(text: string): DocumentType | null {
		const documentTypes: DocumentType[] = [
			"receipt",
			"invoice",
			"id",
			"form",
			"letter",
			"contract",
			"tax",
			"medical",
			"insurance",
			"screenshot",
		];

		const normalizedText = text.toLowerCase();

		for (const type of documentTypes) {
			if (normalizedText.includes(type)) {
				return type;
			}
		}

		// Check Hebrew terms
		const hebrewMappings: Record<string, DocumentType> = {
			קבלה: "receipt",
			חשבונית: "invoice",
			תעודה: "id",
			טופס: "form",
			מכתב: "letter",
			חוזה: "contract",
			מס: "tax",
			רפואי: "medical",
			ביטוח: "insurance",
		};

		for (const [hebrew, type] of Object.entries(hebrewMappings)) {
			if (normalizedText.includes(hebrew)) {
				return type;
			}
		}

		return null;
	}

	private extractTimeUnit(
		text: string,
	): "day" | "week" | "month" | "quarter" | "year" | null {
		const units = Object.entries(TEMPORAL_KEYWORDS.units);
		const normalizedText = text.toLowerCase();

		for (const [unit, keywords] of units) {
			for (const keyword of keywords) {
				if (normalizedText.includes(keyword.toLowerCase())) {
					return unit as "day" | "week" | "month" | "quarter" | "year";
				}
			}
		}

		return null;
	}

	private getDirection(text: string): "past" | "future" {
		const futureKeywords = ["next", "upcoming", "future", "הבא", "הבאים"];
		const normalizedText = text.toLowerCase();

		for (const keyword of futureKeywords) {
			if (normalizedText.includes(keyword)) {
				return "future";
			}
		}

		return "past";
	}

	private calculateDateRange(
		count: number,
		unit: "day" | "week" | "month" | "quarter" | "year",
		direction: "past" | "future",
	): { startDate: Date; endDate: Date } {
		const startDate = new Date(this.today);
		const endDate = new Date(this.today);

		if (direction === "past") {
			switch (unit) {
				case "day":
					startDate.setDate(startDate.getDate() - count);
					break;
				case "week":
					startDate.setDate(startDate.getDate() - count * 7);
					break;
				case "month":
					startDate.setMonth(startDate.getMonth() - count);
					break;
				case "quarter":
					startDate.setMonth(startDate.getMonth() - count * 3);
					break;
				case "year":
					startDate.setFullYear(startDate.getFullYear() - count);
					break;
			}
		} else {
			switch (unit) {
				case "day":
					endDate.setDate(endDate.getDate() + count);
					break;
				case "week":
					endDate.setDate(endDate.getDate() + count * 7);
					break;
				case "month":
					endDate.setMonth(endDate.getMonth() + count);
					break;
				case "quarter":
					endDate.setMonth(endDate.getMonth() + count * 3);
					break;
				case "year":
					endDate.setFullYear(endDate.getFullYear() + count);
					break;
			}
		}

		return direction === "past"
			? { startDate, endDate }
			: { startDate, endDate };
	}

	private getWeekRange(date: Date): { startDate: Date; endDate: Date } {
		const startDate = new Date(date);
		const day = startDate.getDay();
		const diff = startDate.getDate() - day;
		startDate.setDate(diff);
		startDate.setHours(0, 0, 0, 0);

		const endDate = new Date(startDate);
		endDate.setDate(endDate.getDate() + 6);
		endDate.setHours(23, 59, 59, 999);

		return { startDate, endDate };
	}

	private getQuarterRange(
		quarter: number,
		year: number,
	): { startDate: Date; endDate: Date } {
		const startMonth = (quarter - 1) * 3;
		const startDate = new Date(year, startMonth, 1);
		const endDate = new Date(year, startMonth + 3, 0);

		return { startDate, endDate };
	}

	private getSeasonRange(
		season: string,
		year: number,
	): { startDate: Date; endDate: Date } {
		let startDate: Date;
		let endDate: Date;

		switch (season) {
			case "spring":
				startDate = new Date(year, 2, 20); // March 20
				endDate = new Date(year, 5, 20); // June 20
				break;
			case "summer":
				startDate = new Date(year, 5, 21); // June 21
				endDate = new Date(year, 8, 22); // September 22
				break;
			case "fall":
				startDate = new Date(year, 8, 23); // September 23
				endDate = new Date(year, 11, 20); // December 20
				break;
			case "winter":
				startDate = new Date(year - 1, 11, 21); // December 21 (previous year)
				endDate = new Date(year, 2, 19); // March 19
				break;
			default:
				startDate = new Date(year, 0, 1);
				endDate = new Date(year, 11, 31);
		}

		return { startDate, endDate };
	}

	private extractQuarterNumber(text: string): number | null {
		const quarterMap: Record<string, number> = {
			"1": 1,
			first: 1,
			"1st": 1,
			ראשון: 1,
			"2": 2,
			second: 2,
			"2nd": 2,
			שני: 2,
			"3": 3,
			third: 3,
			"3rd": 3,
			שלישי: 3,
			"4": 4,
			fourth: 4,
			"4th": 4,
			רביעי: 4,
		};

		return quarterMap[text.toLowerCase()] || null;
	}

	private extractYear(text: string): number | null {
		const yearMatch = text.match(/\b(19|20)\d{2}\b/);
		return yearMatch ? parseInt(yearMatch[0], 10) : null;
	}

	private getMonthIndex(monthName: string): number {
		const normalizedMonth = monthName.toLowerCase();

		// Check English months
		const enIndex = this.monthNames.en.indexOf(normalizedMonth);
		if (enIndex !== -1) return enIndex;

		// Check Hebrew months
		const heIndex = this.monthNames.he.indexOf(monthName);
		if (heIndex !== -1) return heIndex;

		return -1;
	}

	private constructDate(match: RegExpMatchArray): Date | null {
		try {
			// Attempt to parse the date components
			const components = match.slice(1).map((comp, idx) => {
				if (idx === 1 && isNaN(Number(comp))) {
					// Month name
					return this.getMonthIndex(comp) + 1;
				}
				return parseInt(comp, 10);
			});

			// Adjust year if it's 2-digit
			if (components[2] && components[2] < 100) {
				components[2] += components[2] < 30 ? 2000 : 1900;
			}

			// Try different date formats
			const date = new Date(components[2], components[1] - 1, components[0]);

			if (!isNaN(date.getTime())) {
				return date;
			}
		} catch (error) {
			console.error("Error constructing date:", error);
		}

		return null;
	}

	private parseDate(text: string): Date | null {
		// Try parsing as specific date first
		const specificDate = this.parseSpecificDate(text);
		if (specificDate) {
			return specificDate.startDate || null;
		}

		// Try parsing month names
		const monthIndex = this.getMonthIndex(text);
		if (monthIndex !== -1) {
			const year = this.extractYear(text) || this.today.getFullYear();
			return new Date(year, monthIndex, 1);
		}

		return null;
	}

	combineTemporalExpressions(
		expr1: TemporalExpression | null,
		expr2: TemporalExpression | null,
	): TemporalExpression | null {
		if (!expr1) return expr2;
		if (!expr2) return expr1;

		// Combine date ranges by taking the intersection
		const startDate =
			expr1.startDate && expr2.startDate
				? new Date(
						Math.max(expr1.startDate.getTime(), expr2.startDate.getTime()),
					)
				: expr1.startDate || expr2.startDate;

		const endDate =
			expr1.endDate && expr2.endDate
				? new Date(Math.min(expr1.endDate.getTime(), expr2.endDate.getTime()))
				: expr1.endDate || expr2.endDate;

		// If the intersection is invalid, return the more specific expression
		if (startDate && endDate && startDate > endDate) {
			return expr2.type === "count" ? expr2 : expr1;
		}

		return {
			type: "range",
			startDate,
			endDate,
			count: expr2.count || expr1.count,
			unit: expr2.unit || expr1.unit,
			documentType: expr2.documentType || expr1.documentType,
			direction: expr2.direction || expr1.direction,
		};
	}
}
