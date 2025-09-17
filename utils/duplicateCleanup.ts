// utils/duplicateCleanup.ts
import { Q } from "@nozbe/watermelondb";
import { database } from "../services/database";
import type Document from "../services/database/models/Document";

export class DuplicateCleanup {
	/**
	 * Remove duplicate documents based on imageHash
	 * Keeps the oldest document and removes newer duplicates
	 */
	static async removeDuplicatesByHash(): Promise<{ removed: number; kept: number }> {
		console.log('[DuplicateCleanup] Starting duplicate cleanup by hash...');
		
		const documentsCollection = database.get<Document>("documents");
		const allDocuments = await documentsCollection.query().fetch();
		
		// Group documents by hash
		const hashGroups = new Map<string, Document[]>();
		
		for (const doc of allDocuments) {
			if (!doc.imageHash) continue;
			
			if (!hashGroups.has(doc.imageHash)) {
				hashGroups.set(doc.imageHash, []);
			}
			hashGroups.get(doc.imageHash)!.push(doc);
		}
		
		let removedCount = 0;
		let keptCount = 0;
		
		// Process each group
		for (const [hash, docs] of hashGroups.entries()) {
			if (docs.length > 1) {
				// Sort by creation date (oldest first)
				docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
				
				// Keep the first (oldest), remove the rest
				const toKeep = docs[0];
				const toRemove = docs.slice(1);
				
				console.log(`[DuplicateCleanup] Found ${docs.length} duplicates for hash ${hash.substring(0, 8)}...`);
				console.log(`[DuplicateCleanup] Keeping: ${toKeep.id} (created: ${toKeep.createdAt})`);
				
				// Remove duplicates
				await database.write(async () => {
					for (const duplicate of toRemove) {
						console.log(`[DuplicateCleanup] Removing: ${duplicate.id} (created: ${duplicate.createdAt})`);
						await duplicate.markAsDeleted();
						removedCount++;
					}
				});
				
				keptCount++;
			} else {
				keptCount++;
			}
		}
		
		console.log(`[DuplicateCleanup] Cleanup complete: ${removedCount} duplicates removed, ${keptCount} documents kept`);
		
		return { removed: removedCount, kept: keptCount };
	}

	/**
	 * Remove duplicate documents based on imageUri
	 * Useful for catching edge cases where hash differs but URI is same
	 */
	static async removeDuplicatesByUri(): Promise<{ removed: number; kept: number }> {
		console.log('[DuplicateCleanup] Starting duplicate cleanup by URI...');
		
		const documentsCollection = database.get<Document>("documents");
		const allDocuments = await documentsCollection.query().fetch();
		
		// Group documents by URI
		const uriGroups = new Map<string, Document[]>();
		
		for (const doc of allDocuments) {
			if (!doc.imageUri) continue;
			
			if (!uriGroups.has(doc.imageUri)) {
				uriGroups.set(doc.imageUri, []);
			}
			uriGroups.get(doc.imageUri)!.push(doc);
		}
		
		let removedCount = 0;
		let keptCount = 0;
		
		// Process each group
		for (const [uri, docs] of uriGroups.entries()) {
			if (docs.length > 1) {
				// Sort by creation date (oldest first)
				docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
				
				// Keep the first (oldest), remove the rest
				const toKeep = docs[0];
				const toRemove = docs.slice(1);
				
				console.log(`[DuplicateCleanup] Found ${docs.length} URI duplicates for ${uri.substring(uri.lastIndexOf('/') + 1)}`);
				console.log(`[DuplicateCleanup] Keeping: ${toKeep.id} (created: ${toKeep.createdAt})`);
				
				// Remove duplicates
				await database.write(async () => {
					for (const duplicate of toRemove) {
						console.log(`[DuplicateCleanup] Removing: ${duplicate.id} (created: ${duplicate.createdAt})`);
						await duplicate.markAsDeleted();
						removedCount++;
					}
				});
				
				keptCount++;
			} else {
				keptCount++;
			}
		}
		
		console.log(`[DuplicateCleanup] URI cleanup complete: ${removedCount} duplicates removed, ${keptCount} documents kept`);
		
		return { removed: removedCount, kept: keptCount };
	}

	/**
	 * Get duplicate statistics without removing anything
	 */
	static async getDuplicateStats(): Promise<{
		totalDocuments: number;
		duplicatesByHash: number;
		duplicatesByUri: number;
		uniqueHashes: number;
		uniqueUris: number;
	}> {
		const documentsCollection = database.get<Document>("documents");
		const allDocuments = await documentsCollection.query().fetch();
		
		const hashes = new Set<string>();
		const uris = new Set<string>();
		let duplicatesByHash = 0;
		let duplicatesByUri = 0;
		
		// Count hash duplicates
		const hashCounts = new Map<string, number>();
		const uriCounts = new Map<string, number>();
		
		for (const doc of allDocuments) {
			if (doc.imageHash) {
				hashes.add(doc.imageHash);
				hashCounts.set(doc.imageHash, (hashCounts.get(doc.imageHash) || 0) + 1);
			}
			
			if (doc.imageUri) {
				uris.add(doc.imageUri);
				uriCounts.set(doc.imageUri, (uriCounts.get(doc.imageUri) || 0) + 1);
			}
		}
		
		// Count duplicates
		for (const count of hashCounts.values()) {
			if (count > 1) {
				duplicatesByHash += count - 1; // -1 because we keep one
			}
		}
		
		for (const count of uriCounts.values()) {
			if (count > 1) {
				duplicatesByUri += count - 1;
			}
		}
		
		return {
			totalDocuments: allDocuments.length,
			duplicatesByHash,
			duplicatesByUri,
			uniqueHashes: hashes.size,
			uniqueUris: uris.size,
		};
	}
}

export const duplicateCleanup = DuplicateCleanup;