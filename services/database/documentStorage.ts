import { Q } from "@nozbe/watermelondb";
import {
	type DocumentResult,
	ExtractedMetadata,
} from "../ai/documentProcessor";
import { database } from "./index";
import type Document from "./models/Document";

export class DocumentStorage {
	async saveDocument(result: DocumentResult): Promise<Document> {
		console.log(`[DocumentStorage] Saving document with hash: ${result.imageHash}`);
		console.log(`[DocumentStorage] Document type: ${result.documentType}, Confidence: ${(result.confidence * 100).toFixed(1)}%`);
		
		const documentsCollection = database.get<Document>("documents");

		// Check for duplicate by image hash
		const existingDocs = await documentsCollection
			.query(Q.where("image_hash", result.imageHash))
			.fetch();

		if (existingDocs.length > 0) {
			console.log(`[DocumentStorage] Document already exists with hash: ${result.imageHash}`);
			return existingDocs[0];
		}

		return await database.write(async () => {
			console.log(`[DocumentStorage] Creating new document in database`);
			const document = await documentsCollection.create((doc) => {
				doc.imageUri = result.imageUri;
				doc.imageHash = result.imageHash;
				doc.ocrText = result.ocrText;
				doc.documentType = result.documentType;
				doc.confidence = result.confidence;
				doc.processedAt = result.processedAt;
				doc.metadata = result.metadata;
				doc.keywords = result.keywords;
				doc.searchVector = result.searchVector;
				doc.imageWidth = result.imageWidth;
				doc.imageHeight = result.imageHeight;
				doc.imageSize = result.imageSize;

				if (result.imageTakenDate) {
					doc.imageTakenDate = result.imageTakenDate.getTime();
				}

				// Extract key metadata fields
				if (result.metadata.vendor) {
					doc.vendor = result.metadata.vendor;
				}

				if (result.metadata.amounts && result.metadata.amounts.length > 0) {
					const totalAmount = result.metadata.amounts.find((a) => a.isTotal);
					if (totalAmount) {
						doc.totalAmount = totalAmount.value;
						doc.currency = totalAmount.currency;
					} else {
						// Use the largest amount if no total found
						const maxAmount = result.metadata.amounts.reduce((max, curr) =>
							curr.value > max.value ? curr : max,
						);
						doc.totalAmount = maxAmount.value;
						doc.currency = maxAmount.currency;
					}
				}

				if (result.metadata.dates && result.metadata.dates.length > 0) {
					// Use the first date found
					doc.date = result.metadata.dates[0].date.getTime();
				}
				
				// Log what we're saving
				console.log(`[DocumentStorage] Setting document fields:`, {
					id: doc.id,
					documentType: doc.documentType,
					vendor: doc.vendor,
					date: doc.date,
					processedAt: doc.processedAt,
					createdAt: doc.createdAt
				});
			});

			console.log(`[DocumentStorage] Document saved successfully with ID: ${document.id}`);
			return document;
		});
	}

	async getAllDocuments(): Promise<Document[]> {
		const documentsCollection = database.get<Document>("documents");
		return await documentsCollection.query().fetch();
	}

	async getRecentDocuments(limit: number = 10): Promise<Document[]> {
		const documentsCollection = database.get<Document>("documents");
		return await documentsCollection
			.query(Q.sortBy("processed_at", Q.desc), Q.take(limit))
			.fetch();
	}

	async getDocumentsByType(type: string): Promise<Document[]> {
		const documentsCollection = database.get<Document>("documents");
		return await documentsCollection
			.query(Q.where("document_type", type))
			.fetch();
	}

	async searchDocuments(query: string): Promise<Document[]> {
		const documentsCollection = database.get<Document>("documents");
		const lowerQuery = query.toLowerCase();

		// Search in OCR text and vendor name
		return await documentsCollection
			.query(
				Q.or(
					Q.where("ocr_text", Q.like(`%${lowerQuery}%`)),
					Q.where("vendor", Q.like(`%${lowerQuery}%`)),
				),
			)
			.fetch();
	}

	async deleteDocument(id: string): Promise<void> {
		const documentsCollection = database.get<Document>("documents");
		const document = await documentsCollection.find(id);

		await database.write(async () => {
			await document.markAsDeleted();
		});
	}

	async getDocumentById(id: string): Promise<Document | null> {
		const documentsCollection = database.get<Document>("documents");
		try {
			return await documentsCollection.find(id);
		} catch {
			return null;
		}
	}

	async updateDocument(
		id: string,
		updates: Partial<{
			vendor: string;
			totalAmount: number;
			currency: string;
		}>,
	): Promise<Document> {
		const documentsCollection = database.get<Document>("documents");
		const document = await documentsCollection.find(id);

		return await database.write(async () => {
			return await document.update((doc) => {
				if (updates.vendor !== undefined) {
					doc.vendor = updates.vendor;
				}
				if (updates.totalAmount !== undefined) {
					doc.totalAmount = updates.totalAmount;
				}
				if (updates.currency !== undefined) {
					doc.currency = updates.currency;
				}
			});
		});
	}

	async checkDuplicateByHash(imageHash: string): Promise<Document | null> {
		const documentsCollection = database.get<Document>("documents");
		const docs = await documentsCollection
			.query(Q.where("image_hash", imageHash))
			.fetch();

		return docs.length > 0 ? docs[0] : null;
	}
}

export const documentStorage = new DocumentStorage();
