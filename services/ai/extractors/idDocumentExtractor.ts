import { DocumentType, EntityType } from "../types/hybridTypes";
import type {
	DocumentExtractor,
	ContextualResult,
	IDData,
	ValidationResult,
	Entity,
	PersonalInfo,
} from "../types/hybridTypes";

export class IDDocumentExtractor implements DocumentExtractor<IDData> {
	async initialize?(): Promise<void> {
		console.log("ID document extractor initialized");
	}

	canHandle(documentType: DocumentType): boolean {
		return (
			documentType === DocumentType.ID_CARD ||
			documentType === DocumentType.DRIVERS_LICENSE
		);
	}

	async extract(context: ContextualResult): Promise<IDData> {
		console.log("Extracting ID document data...");

		const text = context.rawOCR?.text || "";
		const entities = context.context?.entities || [];
		const blocks = context.rawOCR?.blocks || [];

		return {
			documentType: context.documentType,
			personalInfo: this.extractPersonalInfo(text, entities),
			documentInfo: this.extractDocumentInfo(
				text,
				entities,
				context.documentType,
			),
			address: this.extractAddress(text, entities),
			photo: this.extractPhotoRegion(blocks),
			securityFeatures: this.detectSecurityFeatures(text),
		};
	}

	private extractPersonalInfo(text: string, entities: Entity[]): PersonalInfo {
		// Extract names
		const nameEntities = entities.filter(
			(e) => e.type === EntityType.PERSON_NAME,
		);
		let firstName = "";
		let lastName = "";
		let middleName: string | undefined;

		if (nameEntities.length > 0) {
			const fullName = nameEntities[0].value;
			const nameParts = fullName.split(/\s+/);
			firstName = nameParts[0] || "";
			lastName = nameParts[nameParts.length - 1] || "";
			if (nameParts.length > 2) {
				middleName = nameParts.slice(1, -1).join(" ");
			}
		} else {
			// Pattern matching for names
			const namePatterns = [
				/(?:name|full name)[\s:]*([A-Za-z\s]+)/gi,
				/(?:first name)[\s:]*([A-Za-z]+)/gi,
				/(?:last name|surname)[\s:]*([A-Za-z]+)/gi,
			];

			for (const pattern of namePatterns) {
				const match = text.match(pattern);
				if (match) {
					if (pattern.source.includes("first")) {
						firstName = match[1].trim();
					} else if (pattern.source.includes("last|surname")) {
						lastName = match[1].trim();
					} else {
						// Full name
						const nameParts = match[1].trim().split(/\s+/);
						firstName = nameParts[0] || "";
						lastName = nameParts[nameParts.length - 1] || "";
						if (nameParts.length > 2) {
							middleName = nameParts.slice(1, -1).join(" ");
						}
					}
				}
			}
		}

		// Extract date of birth
		let dateOfBirth = new Date();
		const dobEntity = entities.find(
			(e) =>
				e.type === EntityType.DATE &&
				(e.value.toLowerCase().includes("birth") ||
					e.value.toLowerCase().includes("dob")),
		);

		if (dobEntity && dobEntity.normalizedValue instanceof Date) {
			dateOfBirth = dobEntity.normalizedValue;
		} else {
			const dobPattern =
				/(?:date of birth|dob|birth date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi;
			const dobMatch = text.match(dobPattern);
			if (dobMatch) {
				try {
					dateOfBirth = new Date(dobMatch[1]);
				} catch {
					// Keep default
				}
			}
		}

		// Extract gender
		let gender: string | undefined;
		const genderPattern = /(?:sex|gender)[\s:]*([MF]|Male|Female)/gi;
		const genderMatch = text.match(genderPattern);
		if (genderMatch) {
			gender = genderMatch[1].toUpperCase();
		}

		return {
			firstName,
			lastName,
			middleName,
			dateOfBirth,
			gender,
		};
	}

	private extractDocumentInfo(
		text: string,
		entities: Entity[],
		docType: DocumentType,
	): IDData["documentInfo"] {
		// Extract document number
		let documentNumber = "";
		const docNumEntity = entities.find(
			(e) => e.type === EntityType.DOCUMENT_NUMBER,
		);
		if (docNumEntity) {
			documentNumber = docNumEntity.value;
		} else {
			const patterns = [
				/(?:license|id)\s*(?:number|#|no)[\s:]*([A-Z0-9-]+)/gi,
				/(?:dl|id)[\s:]*([A-Z0-9-]+)/gi,
			];

			for (const pattern of patterns) {
				const match = text.match(pattern);
				if (match) {
					documentNumber = match[1];
					break;
				}
			}
		}

		// Extract dates
		const dateEntities = entities.filter((e) => e.type === EntityType.DATE);
		let issueDate = new Date();
		let expiryDate: Date | undefined;

		// Look for issue/expiry date patterns
		const issueDatePattern =
			/(?:issued|issue date)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi;
		const expiryDatePattern =
			/(?:expires?|expiry|exp)[\s:]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/gi;

		const issueMatch = text.match(issueDatePattern);
		if (issueMatch) {
			try {
				issueDate = new Date(issueMatch[1]);
			} catch {
				// Keep default
			}
		}

		const expiryMatch = text.match(expiryDatePattern);
		if (expiryMatch) {
			try {
				expiryDate = new Date(expiryMatch[1]);
			} catch {
				// Keep undefined
			}
		}

		// Extract issuing authority
		let issuingAuthority = "";
		const authorityPatterns = [
			/(?:issued by|authority)[\s:]*([A-Za-z\s]+)/gi,
			/(?:department of|ministry of)[\s:]*([A-Za-z\s]+)/gi,
		];

		for (const pattern of authorityPatterns) {
			const match = text.match(pattern);
			if (match) {
				issuingAuthority = match[1].trim();
				break;
			}
		}

		// Default authority based on document type
		if (!issuingAuthority) {
			if (docType === DocumentType.DRIVERS_LICENSE) {
				issuingAuthority = "Department of Motor Vehicles";
			} else {
				issuingAuthority = "Government Authority";
			}
		}

		return {
			documentNumber,
			issueDate,
			expiryDate,
			issuingAuthority,
		};
	}

	private extractAddress(text: string, entities: Entity[]): IDData["address"] {
		const addressEntity = entities.find((e) => e.type === EntityType.ADDRESS);
		if (addressEntity) {
			return this.parseAddress(addressEntity.value);
		}

		// Pattern matching for address
		const addressPattern =
			/(?:address|addr)[\s:]*([^\n]+(?:\n[^\n]*)*?)(?:\n\s*\n|$)/gi;
		const addressMatch = text.match(addressPattern);

		if (addressMatch) {
			return this.parseAddress(addressMatch[1]);
		}

		return undefined;
	}

	private parseAddress(addressText: string): IDData["address"] {
		const lines = addressText
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		if (lines.length === 0) return undefined;

		let street = lines[0];
		let city = "";
		let state: string | undefined;
		let postalCode = "";
		let country = "USA"; // Default

		// Parse last line for city, state, ZIP
		if (lines.length > 1) {
			const lastLine = lines[lines.length - 1];
			const cityStateZipPattern =
				/([A-Za-z\s]+),?\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/;
			const match = lastLine.match(cityStateZipPattern);

			if (match) {
				city = match[1].trim();
				state = match[2];
				postalCode = match[3];
			} else {
				city = lastLine;
			}
		}

		return {
			street,
			city,
			state,
			postalCode,
			country,
		};
	}

	private extractPhotoRegion(blocks: any[]): IDData["photo"] {
		// Look for regions with very little text (likely photo areas)
		const photoRegions = blocks.filter(
			(block: any) =>
				block.text.trim().length < 5 &&
				block.boundingBox.width > 50 &&
				block.boundingBox.height > 50,
		);

		if (photoRegions.length > 0) {
			// Return the largest region (likely the main photo)
			const largestRegion = photoRegions.reduce(
				(largest: any, current: any) => {
					const currentArea =
						current.boundingBox.width * current.boundingBox.height;
					const largestArea =
						largest.boundingBox.width * largest.boundingBox.height;
					return currentArea > largestArea ? current : largest;
				},
			);

			return {
				boundingBox: {
					x: largestRegion.boundingBox.x,
					y: largestRegion.boundingBox.y,
					width: largestRegion.boundingBox.width,
					height: largestRegion.boundingBox.height,
				},
			};
		}

		return undefined;
	}

	private detectSecurityFeatures(text: string): string[] {
		const features: string[] = [];
		const securityFeatures = [
			"hologram",
			"watermark",
			"rfid",
			"chip",
			"magnetic stripe",
			"uv reactive",
			"microprint",
			"raised text",
			"ghost image",
		];

		const lowerText = text.toLowerCase();
		for (const feature of securityFeatures) {
			if (lowerText.includes(feature)) {
				features.push(feature);
			}
		}

		return features;
	}

	async validate(data: IDData): Promise<ValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];
		const suggestions: string[] = [];
		let confidence = 1.0;

		// Validate personal info
		if (!data.personalInfo.firstName) {
			errors.push("First name is required");
			confidence -= 0.2;
		}

		if (!data.personalInfo.lastName) {
			errors.push("Last name is required");
			confidence -= 0.2;
		}

		// Validate date of birth
		const now = new Date();
		const age =
			(now.getTime() - data.personalInfo.dateOfBirth.getTime()) /
			(1000 * 3600 * 24 * 365.25);
		if (age < 0 || age > 150) {
			warnings.push("Date of birth seems invalid");
			confidence -= 0.1;
		}

		// Validate document info
		if (!data.documentInfo.documentNumber) {
			errors.push("Document number is required");
			confidence -= 0.3;
		}

		// Validate expiry date
		if (data.documentInfo.expiryDate && data.documentInfo.expiryDate < now) {
			warnings.push("Document has expired");
			confidence -= 0.1;
		}

		if (
			data.documentInfo.expiryDate &&
			data.documentInfo.expiryDate < data.documentInfo.issueDate
		) {
			errors.push("Expiry date cannot be before issue date");
			confidence -= 0.2;
		}

		// Validate address
		if (!data.address) {
			warnings.push("Address information not found");
			confidence -= 0.1;
		} else if (!data.address.city || !data.address.street) {
			warnings.push("Incomplete address information");
			confidence -= 0.05;
		}

		// Security features boost confidence
		if (data.securityFeatures.length > 0) {
			confidence += 0.05;
		}

		// Photo detection boost confidence
		if (data.photo) {
			confidence += 0.05;
		}

		const validationScore = Math.max(0, Math.min(1, confidence));

		return {
			isValid: errors.length === 0,
			confidence: validationScore,
			errors,
			warnings,
			suggestions,
		};
	}
}
