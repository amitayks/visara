import {
	DocumentType,
	EntityType,
	RelationshipType,
	SectionType,
} from "../types/hybridTypes";
import type {
	OCRResult,
	ContextualResult,
	DocumentContext,
	Entity,
	Relationship,
	DocumentSection,
	LayoutInfo,
	TextBlock,
} from "../types/hybridTypes";

// Placeholder for ONNX runtime integration
// In a real implementation, you would use @microsoft/onnxruntime-react-native
interface ONNXModel {
	run(input: any): Promise<any>;
	dispose(): void;
}

interface ModelOutput {
	documentType: string;
	confidence: number;
	entities: Array<{
		type: string;
		value: string;
		confidence: number;
		start: number;
		end: number;
	}>;
	relationships: Array<{
		type: string;
		source: number;
		target: number;
		confidence: number;
	}>;
	layout: {
		orientation: string;
		columns: number;
		hasTable: boolean;
	};
}

export class LocalContextEngine {
	private model: ONNXModel | null = null;
	private initialized = false;
	private modelPath = "assets/models/smoldocling-256m-q8.onnx"; // Placeholder path

	// Rule-based patterns for fallback
	private documentPatterns = new Map<DocumentType, RegExp[]>([
		[
			DocumentType.RECEIPT,
			[
				/receipt/i,
				/total.*\$[\d,]+\.?\d*/i,
				/tax.*\$[\d,]+\.?\d*/i,
				/change.*\$[\d,]+\.?\d*/i,
				/cash|card|payment/i,
			],
		],
		[
			DocumentType.INVOICE,
			[
				/invoice/i,
				/bill\s+to/i,
				/due\s+date/i,
				/invoice\s+(number|#)/i,
				/payment\s+terms/i,
			],
		],
		[
			DocumentType.PASSPORT,
			[
				/passport/i,
				/nationality/i,
				/date\s+of\s+birth/i,
				/place\s+of\s+birth/i,
				/passport\s+(number|no)/i,
			],
		],
		[
			DocumentType.DRIVERS_LICENSE,
			[
				/driver'?s?\s+licen[sc]e/i,
				/class\s+[a-z]/i,
				/restrictions/i,
				/endorsements/i,
			],
		],
		[
			DocumentType.ID_CARD,
			[
				/identification/i,
				/id\s+(card|number)/i,
				/date\s+of\s+birth/i,
				/expires?/i,
			],
		],
	]);

	private entityPatterns = new Map<EntityType, RegExp[]>([
		[
			EntityType.DATE,
			[
				/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g,
				/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g,
				/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/gi,
				/\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}/gi,
			],
		],
		[
			EntityType.AMOUNT,
			[
				/\$\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?/g,
				/\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?\s*(?:\$|USD|EUR|GBP|₪)/g,
				/₪\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?/g,
			],
		],
		[
			EntityType.PHONE,
			[
				/(?:\+\d{1,3}\s?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
				/\d{3}-\d{3}-\d{4}/g,
				/\(\d{3}\)\s?\d{3}-\d{4}/g,
			],
		],
		[EntityType.EMAIL, [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g]],
		[
			EntityType.DOCUMENT_NUMBER,
			[
				/(?:invoice|receipt|ref|confirmation)[\s#:]*([A-Z0-9-]+)/gi,
				/(?:no|number|#)[\s:]*([A-Z0-9-]+)/gi,
			],
		],
	]);

	async initialize(): Promise<void> {
		if (this.initialized) return;

		console.log("Initializing Local Context Engine...");

		try {
			// In a real implementation, you would:
			// 1. Load the ONNX model from assets or download it
			// 2. Initialize the ONNX runtime
			// 3. Warm up the model with a sample input

			// this.model = await this.loadONNXModel();

			// For now, use rule-based fallback
			console.log(
				"Using rule-based context understanding (ONNX model not available)",
			);

			this.initialized = true;
			console.log("Local Context Engine initialized");
		} catch (error) {
			console.warn(
				"Failed to initialize ONNX model, using rule-based fallback:",
				error,
			);
			this.initialized = true; // Still initialize with fallback
		}
	}

	private async loadONNXModel(): Promise<ONNXModel> {
		// Placeholder for ONNX model loading
		// In a real implementation:
		/*
    const session = await InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'], // or 'nnapi' for Android
      graphOptimizationLevel: 'all'
    });
    
    return {
      run: async (input) => {
        const feeds = { input: new Tensor('float32', input.data, input.dims) };
        const output = await session.run(feeds);
        return output;
      },
      dispose: () => session.release()
    };
    */

		throw new Error("ONNX runtime not available");
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	async understandContext(ocrResult: OCRResult): Promise<ContextualResult> {
		if (!this.initialized) {
			await this.initialize();
		}

		console.log("Starting context understanding...");
		const startTime = Date.now();

		try {
			let result: ContextualResult;

			if (this.model) {
				// Use AI model for context understanding
				result = await this.processWithModel(ocrResult);
			} else {
				// Use rule-based fallback
				result = await this.processWithRules(ocrResult);
			}

			const processingTime = Date.now() - startTime;
			console.log(`Context understanding completed in ${processingTime}ms`);
			console.log(
				`Document type: ${result.documentType} (confidence: ${result.confidence.toFixed(3)})`,
			);

			return result;
		} catch (error) {
			console.error("Context understanding failed:", error);

			// Return basic result as fallback
			return this.createBasicResult(ocrResult);
		}
	}

	private async processWithModel(
		ocrResult: OCRResult,
	): Promise<ContextualResult> {
		if (!this.model) {
			throw new Error("Model not available");
		}

		// Prepare input for the model
		const input = this.prepareModelInput(ocrResult);

		// Run inference
		const output: ModelOutput = await this.model.run(input);

		// Parse model output
		const documentType = this.parseDocumentType(output.documentType);
		const entities = this.parseEntities(output.entities, ocrResult.text);
		const relationships = this.parseRelationships(
			output.relationships,
			entities,
		);
		const layout = this.parseLayout(output.layout, ocrResult);
		const sections = this.analyzeSections(ocrResult.blocks);

		const context: DocumentContext = {
			layout,
			entities,
			relationships,
			sections,
			confidence: output.confidence,
		};

		return {
			documentType,
			confidence: output.confidence,
			context,
			rawOCR: ocrResult,
		};
	}

	private async processWithRules(
		ocrResult: OCRResult,
	): Promise<ContextualResult> {
		console.log("Using rule-based context understanding...");

		const text = ocrResult.text;

		// Step 1: Classify document type
		const { documentType, confidence } = this.classifyDocument(text);

		// Step 2: Extract entities
		const entities = this.extractEntities(text, ocrResult.blocks);

		// Step 3: Find relationships
		const relationships = this.findRelationships(entities);

		// Step 4: Analyze layout
		const layout = this.analyzeLayout(ocrResult);

		// Step 5: Identify sections
		const sections = this.analyzeSections(ocrResult.blocks);

		const context: DocumentContext = {
			layout,
			entities,
			relationships,
			sections,
			confidence,
		};

		return {
			documentType,
			confidence,
			context,
			rawOCR: ocrResult,
		};
	}

	private classifyDocument(text: string): {
		documentType: DocumentType;
		confidence: number;
	} {
		const scores = new Map<DocumentType, number>();

		// Calculate scores for each document type
		for (const [docType, patterns] of this.documentPatterns) {
			let score = 0;
			for (const pattern of patterns) {
				const matches = text.match(pattern);
				if (matches) {
					score += matches.length;
				}
			}
			if (score > 0) {
				scores.set(docType, score);
			}
		}

		// Find the document type with the highest score
		let bestType = DocumentType.UNKNOWN;
		let bestScore = 0;

		for (const [docType, score] of scores) {
			if (score > bestScore) {
				bestType = docType;
				bestScore = score;
			}
		}

		// Calculate confidence based on score and text characteristics
		const confidence =
			bestScore > 0 ? Math.min(0.9, 0.5 + bestScore * 0.1) : 0.3;

		return { documentType: bestType, confidence };
	}

	private extractEntities(text: string, blocks: TextBlock[]): Entity[] {
		const entities: Entity[] = [];
		let entityId = 0;

		// Extract entities using patterns
		for (const [entityType, patterns] of this.entityPatterns) {
			for (const pattern of patterns) {
				const matches = Array.from(text.matchAll(pattern));

				for (const match of matches) {
					if (match.index !== undefined) {
						const entity: Entity = {
							type: entityType,
							value: match[0],
							confidence: this.calculateEntityConfidence(entityType, match[0]),
							normalizedValue: this.normalizeEntityValue(entityType, match[0]),
						};

						// Try to find bounding box from OCR blocks
						const boundingBox = this.findEntityBoundingBox(match[0], blocks);
						if (boundingBox) {
							entity.boundingBox = boundingBox;
						}

						entities.push(entity);
					}
				}
			}
		}

		// Additional entity extraction for specific document types
		entities.push(...this.extractContextualEntities(text, blocks));

		return entities;
	}

	private extractContextualEntities(
		text: string,
		blocks: TextBlock[],
	): Entity[] {
		const entities: Entity[] = [];

		// Extract line items (for receipts/invoices)
		const lineItemPattern = /^(.+?)\s+(\d+\.?\d*)\s*$/gm;
		const lineMatches = Array.from(text.matchAll(lineItemPattern));

		for (const match of lineMatches) {
			if (match[1] && match[2]) {
				entities.push({
					type: EntityType.LINE_ITEM,
					value: match[1].trim(),
					confidence: 0.7,
					normalizedValue: {
						description: match[1].trim(),
						amount: parseFloat(match[2]),
					},
				});
			}
		}

		// Extract totals
		const totalPattern = /(?:total|sum|amount due)[\s:]*\$?([\d,]+\.?\d*)/gi;
		const totalMatches = Array.from(text.matchAll(totalPattern));

		for (const match of totalMatches) {
			entities.push({
				type: EntityType.TOTAL,
				value: match[0],
				confidence: 0.8,
				normalizedValue: parseFloat(match[1].replace(/,/g, "")),
			});
		}

		return entities;
	}

	private findRelationships(entities: Entity[]): Relationship[] {
		const relationships: Relationship[] = [];

		// Find item-price relationships
		const items = entities.filter((e) => e.type === EntityType.LINE_ITEM);
		const amounts = entities.filter((e) => e.type === EntityType.AMOUNT);

		// Simple heuristic: match items with amounts based on proximity
		for (const item of items) {
			const nearbyAmounts = amounts.filter(
				(amount) =>
					item.boundingBox &&
					amount.boundingBox &&
					Math.abs(item.boundingBox.y - amount.boundingBox.y) < 50,
			);

			if (nearbyAmounts.length > 0) {
				relationships.push({
					type: RelationshipType.ITEM_PRICE,
					source: item,
					target: nearbyAmounts[0],
					confidence: 0.7,
				});
			}
		}

		// Find subtotal-tax-total relationships
		const subtotals = entities.filter(
			(e) =>
				e.type === EntityType.AMOUNT &&
				e.value.toLowerCase().includes("subtotal"),
		);
		const taxes = entities.filter((e) => e.type === EntityType.TAX);
		const totals = entities.filter((e) => e.type === EntityType.TOTAL);

		for (const subtotal of subtotals) {
			for (const tax of taxes) {
				relationships.push({
					type: RelationshipType.SUBTOTAL_TAX,
					source: subtotal,
					target: tax,
					confidence: 0.8,
				});
			}

			for (const total of totals) {
				relationships.push({
					type: RelationshipType.TAX_TOTAL,
					source: taxes.length > 0 ? taxes[0] : subtotal,
					target: total,
					confidence: 0.8,
				});
			}
		}

		return relationships;
	}

	private analyzeLayout(ocrResult: OCRResult): LayoutInfo {
		const blocks = ocrResult.blocks;
		const text = ocrResult.text;

		// Determine orientation
		const avgWidth =
			blocks.reduce((sum, block) => sum + block.boundingBox.width, 0) /
			blocks.length;
		const avgHeight =
			blocks.reduce((sum, block) => sum + block.boundingBox.height, 0) /
			blocks.length;
		const orientation = avgWidth > avgHeight ? "landscape" : "portrait";

		// Estimate number of columns
		const xPositions = blocks
			.map((block) => block.boundingBox.x)
			.sort((a, b) => a - b);
		const columns = this.estimateColumns(xPositions);

		// Detect table presence
		const hasTable = this.detectTable(blocks, text);

		// Detect header/footer
		const sortedByY = [...blocks].sort(
			(a, b) => a.boundingBox.y - b.boundingBox.y,
		);
		const hasHeader = sortedByY.length > 0 && sortedByY[0].boundingBox.y < 100;
		const hasFooter =
			sortedByY.length > 0 &&
			sortedByY[sortedByY.length - 1].boundingBox.y >
				Math.max(...blocks.map((b) => b.boundingBox.y + b.boundingBox.height)) -
					100;

		// Determine text direction
		const textDirection = this.determineTextDirection(text);

		return {
			orientation,
			columns,
			hasTable,
			hasHeader,
			hasFooter,
			textDirection,
		};
	}

	private analyzeSections(blocks: TextBlock[]): DocumentSection[] {
		const sections: DocumentSection[] = [];

		if (blocks.length === 0) return sections;

		// Sort blocks by position
		const sortedBlocks = [...blocks].sort((a, b) => {
			if (Math.abs(a.boundingBox.y - b.boundingBox.y) < 20) {
				return a.boundingBox.x - b.boundingBox.x;
			}
			return a.boundingBox.y - b.boundingBox.y;
		});

		// Group blocks into sections
		let currentSection: TextBlock[] = [sortedBlocks[0]];
		let currentSectionType = this.determineSectionType(sortedBlocks[0]);

		for (let i = 1; i < sortedBlocks.length; i++) {
			const block = sortedBlocks[i];
			const sectionType = this.determineSectionType(block);

			if (
				sectionType === currentSectionType ||
				(currentSection.length > 0 &&
					Math.abs(
						block.boundingBox.y -
							currentSection[currentSection.length - 1].boundingBox.y,
					) < 50)
			) {
				currentSection.push(block);
			} else {
				// Finalize current section
				if (currentSection.length > 0) {
					sections.push(
						this.createDocumentSection(currentSectionType, currentSection),
					);
				}

				// Start new section
				currentSection = [block];
				currentSectionType = sectionType;
			}
		}

		// Add final section
		if (currentSection.length > 0) {
			sections.push(
				this.createDocumentSection(currentSectionType, currentSection),
			);
		}

		return sections;
	}

	private createDocumentSection(
		type: SectionType,
		blocks: TextBlock[],
	): DocumentSection {
		const entities: Entity[] = []; // Would extract entities specific to this section

		// Calculate bounding box for the entire section
		const minX = Math.min(...blocks.map((b) => b.boundingBox.x));
		const minY = Math.min(...blocks.map((b) => b.boundingBox.y));
		const maxX = Math.max(
			...blocks.map((b) => b.boundingBox.x + b.boundingBox.width),
		);
		const maxY = Math.max(
			...blocks.map((b) => b.boundingBox.y + b.boundingBox.height),
		);

		return {
			type,
			content: blocks,
			entities,
			boundingBox: {
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY,
			},
		};
	}

	// Helper methods
	private calculateEntityConfidence(
		entityType: EntityType,
		value: string,
	): number {
		// Base confidence
		let confidence = 0.7;

		// Adjust based on entity type and value characteristics
		switch (entityType) {
			case EntityType.DATE:
				// Higher confidence for well-formatted dates
				if (/\d{4}-\d{2}-\d{2}/.test(value)) confidence = 0.9;
				else if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) confidence = 0.8;
				break;

			case EntityType.AMOUNT:
				// Higher confidence for properly formatted amounts
				if (/\$\d+\.\d{2}/.test(value)) confidence = 0.9;
				break;

			case EntityType.EMAIL:
				// Email pattern is quite reliable
				confidence = 0.95;
				break;

			case EntityType.PHONE:
				// Phone pattern reliability varies
				if (/\(\d{3}\)\s?\d{3}-\d{4}/.test(value)) confidence = 0.9;
				else confidence = 0.7;
				break;
		}

		return Math.min(0.99, confidence);
	}

	private normalizeEntityValue(entityType: EntityType, value: string): any {
		switch (entityType) {
			case EntityType.DATE:
				try {
					return new Date(value);
				} catch {
					return value;
				}

			case EntityType.AMOUNT:
				const numMatch = value.match(/[\d,]+\.?\d*/);
				if (numMatch) {
					return parseFloat(numMatch[0].replace(/,/g, ""));
				}
				return value;

			default:
				return value;
		}
	}

	private findEntityBoundingBox(
		entityValue: string,
		blocks: TextBlock[],
	): Entity["boundingBox"] {
		for (const block of blocks) {
			if (block.text.includes(entityValue)) {
				return {
					x: block.boundingBox.x,
					y: block.boundingBox.y,
					width: block.boundingBox.width,
					height: block.boundingBox.height,
				};
			}
		}
		return undefined;
	}

	private estimateColumns(xPositions: number[]): number {
		if (xPositions.length < 2) return 1;

		// Simple clustering approach
		const sorted = [...xPositions].sort((a, b) => a - b);
		const gaps = [];

		for (let i = 1; i < sorted.length; i++) {
			const gap = sorted[i] - sorted[i - 1];
			if (gap > 50) {
				// Significant gap
				gaps.push(gap);
			}
		}

		return Math.min(4, gaps.length + 1); // Max 4 columns
	}

	private detectTable(blocks: TextBlock[], text: string): boolean {
		// Simple heuristics for table detection
		const lines = text.split("\n");

		// Check for aligned content
		const alignedLines = lines.filter((line) => {
			const parts = line.trim().split(/\s{2,}/);
			return parts.length >= 3; // At least 3 columns
		});

		return alignedLines.length >= 3; // At least 3 rows
	}

	private determineTextDirection(text: string): "ltr" | "rtl" | "mixed" {
		const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
		const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
		const latinChars = (text.match(/[a-zA-Z]/g) || []).length;

		const rtlChars = hebrewChars + arabicChars;

		if (rtlChars > latinChars * 0.5 && latinChars > 0) {
			return "mixed";
		} else if (rtlChars > latinChars) {
			return "rtl";
		} else {
			return "ltr";
		}
	}

	private determineSectionType(block: TextBlock): SectionType {
		const text = block.text.toLowerCase();

		if (block.boundingBox.y < 100) {
			return SectionType.HEADER;
		} else if (text.includes("total") || text.includes("signature")) {
			return SectionType.FOOTER;
		} else if (text.includes("table") || block.text.split(/\s+/).length < 3) {
			return SectionType.TABLE;
		} else {
			return SectionType.BODY;
		}
	}

	private createBasicResult(ocrResult: OCRResult): ContextualResult {
		return {
			documentType: DocumentType.UNKNOWN,
			confidence: 0.3,
			context: {
				layout: {
					orientation: "portrait",
					columns: 1,
					hasTable: false,
					hasHeader: false,
					hasFooter: false,
					textDirection: "ltr",
					confidence: 0.5,
				},
				entities: [],
				relationships: [],
				sections: [],
				confidence: 0.3,
			},
			rawOCR: ocrResult,
		};
	}

	// Utility methods
	private prepareModelInput(ocrResult: OCRResult): any {
		// Prepare input tensor for the ONNX model
		// This would involve tokenization and formatting for the specific model
		return {
			text: ocrResult.text,
			blocks: ocrResult.blocks.map((block) => ({
				text: block.text,
				x: block.boundingBox.x,
				y: block.boundingBox.y,
				width: block.boundingBox.width,
				height: block.boundingBox.height,
			})),
		};
	}

	private parseDocumentType(modelOutput: string): DocumentType {
		const typeMap: Record<string, DocumentType> = {
			receipt: DocumentType.RECEIPT,
			invoice: DocumentType.INVOICE,
			passport: DocumentType.PASSPORT,
			id_card: DocumentType.ID_CARD,
			drivers_license: DocumentType.DRIVERS_LICENSE,
			bank_statement: DocumentType.BANK_STATEMENT,
			utility_bill: DocumentType.UTILITY_BILL,
		};

		return typeMap[modelOutput.toLowerCase()] || DocumentType.UNKNOWN;
	}

	private parseEntities(modelEntities: any[], text: string): Entity[] {
		return modelEntities.map((entity) => ({
			type: entity.type as EntityType,
			value: entity.value,
			confidence: entity.confidence,
			normalizedValue: this.normalizeEntityValue(entity.type, entity.value),
		}));
	}

	private parseRelationships(
		modelRelationships: any[],
		entities: Entity[],
	): Relationship[] {
		return modelRelationships.map((rel) => ({
			type: rel.type as RelationshipType,
			source: entities[rel.source],
			target: entities[rel.target],
			confidence: rel.confidence,
		}));
	}

	private parseLayout(modelLayout: any, ocrResult: OCRResult): LayoutInfo {
		return {
			orientation:
				modelLayout.orientation === "landscape" ? "landscape" : "portrait",
			columns: modelLayout.columns || 1,
			hasTable: modelLayout.hasTable || false,
			hasHeader: true, // Default
			hasFooter: true, // Default
			textDirection: this.determineTextDirection(ocrResult.text),
		};
	}

	async clearCache(): Promise<void> {
		// Clear any cached model data or temporary files
		console.log("Context engine cache cleared");
	}

	dispose(): void {
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
		this.initialized = false;
	}
}
