import type { HebrewMetadata } from "./ocrTypes";

export class HebrewPatterns {
	static readonly CURRENCY = {
		NIS_SYMBOL: /₪/g,
		NIS_TEXT: /ש"ח|שקל|שקלים|NIS/gi,
		AMOUNT_WITH_CURRENCY:
			/(?:₪|ש"ח|NIS)\s*(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)\s*(?:₪|ש"ח|NIS)/gi,
	};

	static readonly PHONE = {
		MOBILE: /05\d[-\s]?\d{7}|05\d{8}/g,
		LANDLINE: /0[2-9][-\s]?\d{7}|0[2-9]\d{7}/g,
		TOLL_FREE: /1[-\s]?800[-\s]?\d{3}[-\s]?\d{3}|1800\d{6}/g,
		INTERNATIONAL: /\+972[-\s]?\d{1,2}[-\s]?\d{7,8}/g,
	};

	static readonly BUSINESS = {
		VAT_NUMBER:
			/מספר עוסק[\s:]*(\d{9})|ע\.מ\.[\s:]*(\d{9})|עוסק מורשה[\s:]*(\d{9})/gi,
		COMPANY_NUMBER:
			/ח\.פ\.[\s:]*(\d{9})|חברה[\s:]*(\d{9})|מספר חברה[\s:]*(\d{9})/gi,
		DEALER_LICENSE: /רישיון עסק[\s:]*(\d+)|מספר רישיון[\s:]*(\d+)/gi,
		TAX_KEYWORDS: /מע"מ|מס ערך מוסף|כולל מע"מ|לא כולל מע"מ|פטור ממע"מ/gi,
	};

	static readonly DATE = {
		// DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
		STANDARD: /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g,
		// Hebrew month names
		HEBREW_MONTHS:
			/ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר/gi,
		// Date with Hebrew month: 15 באפריל 2024
		HEBREW_DATE:
			/(\d{1,2})\s*ב?(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s*(\d{2,4})/gi,
	};

	static readonly ADDRESS = {
		STREET: /רח(?:וב)?['"]?\s+([א-ת\s]+)\s+(\d+)/g,
		CITY: /(?:עיר|יישוב|מקום)[\s:]+([א-ת\s]+)/g,
		POSTAL_CODE: /מיקוד[\s:]*(\d{7})|(?:ת\.ד\.|תא דואר)[\s:]*(\d+)/g,
	};

	static readonly DOCUMENT_TYPES = {
		RECEIPT: /קבלה|חשבונית מס קבלה|קבלה מס/i,
		INVOICE: /חשבונית|חשבונית מס|חשבון/i,
		DELIVERY_NOTE: /תעודת משלוח|תעודת הובלה/i,
		QUOTE: /הצעת מחיר|הצעה/i,
		ORDER: /הזמנה|הזמנת רכש/i,
		CONTRACT: /חוזה|הסכם/i,
	};

	static extractHebrewMetadata(text: string): HebrewMetadata {
		const metadata: HebrewMetadata = {
			currency: [],
			phones: [],
			vatNumbers: [],
			dates: [],
			businessNumbers: [],
		};

		// Extract currency amounts
		const currencyMatches = text.matchAll(
			HebrewPatterns.CURRENCY.AMOUNT_WITH_CURRENCY,
		);
		for (const match of currencyMatches) {
			const amount = parseFloat((match[1] || match[2]).replace(/[,\s]/g, ""));
			if (!isNaN(amount)) {
				metadata.currency!.push({
					amount,
					symbol: "₪",
				});
			}
		}

		// Extract phone numbers
		const mobilePhones = text.match(HebrewPatterns.PHONE.MOBILE) || [];
		const landlines = text.match(HebrewPatterns.PHONE.LANDLINE) || [];
		metadata.phones = [...new Set([...mobilePhones, ...landlines])];

		// Extract VAT numbers
		const vatMatches = text.matchAll(HebrewPatterns.BUSINESS.VAT_NUMBER);
		for (const match of vatMatches) {
			const vatNumber = match[1] || match[2] || match[3];
			if (vatNumber && vatNumber.length === 9) {
				metadata.vatNumbers!.push(vatNumber);
				metadata.businessNumbers!.push({
					type: "vat",
					number: vatNumber,
				});
			}
		}

		// Extract company numbers
		const companyMatches = text.matchAll(
			HebrewPatterns.BUSINESS.COMPANY_NUMBER,
		);
		for (const match of companyMatches) {
			const companyNumber = match[1] || match[2] || match[3];
			if (companyNumber && companyNumber.length === 9) {
				metadata.businessNumbers!.push({
					type: "company",
					number: companyNumber,
				});
			}
		}

		// Extract dates
		const standardDates = text.matchAll(HebrewPatterns.DATE.STANDARD);
		for (const match of standardDates) {
			const day = parseInt(match[1]);
			const month = parseInt(match[2]) - 1; // JavaScript months are 0-indexed
			const year = parseInt(match[3]);
			const fullYear = year < 100 ? 2000 + year : year;

			if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
				metadata.dates!.push({
					date: new Date(fullYear, month, day),
					format: "DD/MM/YYYY",
				});
			}
		}

		// Extract Hebrew dates
		const hebrewMonthMap: { [key: string]: number } = {
			ינואר: 0,
			פברואר: 1,
			מרץ: 2,
			אפריל: 3,
			מאי: 4,
			יוני: 5,
			יולי: 6,
			אוגוסט: 7,
			ספטמבר: 8,
			אוקטובר: 9,
			נובמבר: 10,
			דצמבר: 11,
		};

		const hebrewDates = text.matchAll(HebrewPatterns.DATE.HEBREW_DATE);
		for (const match of hebrewDates) {
			const day = parseInt(match[1]);
			const month = hebrewMonthMap[match[2]];
			const year = parseInt(match[3]);
			const fullYear = year < 100 ? 2000 + year : year;

			if (day >= 1 && day <= 31 && month !== undefined) {
				metadata.dates!.push({
					date: new Date(fullYear, month, day),
					format: "Hebrew",
				});
			}
		}

		return metadata;
	}

	static detectDocumentType(text: string): string {
		for (const [type, pattern] of Object.entries(
			HebrewPatterns.DOCUMENT_TYPES,
		)) {
			if (pattern.test(text)) {
				return type.toLowerCase();
			}
		}
		return "unknown";
	}

	static isHebrewText(text: string): boolean {
		// Check if text contains Hebrew characters
		const hebrewPattern = /[\u0590-\u05FF]/;
		return hebrewPattern.test(text);
	}

	static getTextDirection(text: string): "rtl" | "ltr" | "mixed" {
		const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
		const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

		const totalAlphabetic = hebrewChars + latinChars;
		if (totalAlphabetic === 0) return "ltr";

		const hebrewRatio = hebrewChars / totalAlphabetic;

		if (hebrewRatio > 0.7) return "rtl";
		if (hebrewRatio < 0.3) return "ltr";
		return "mixed";
	}
}
