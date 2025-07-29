import RNFS from "react-native-fs";
import { documentStorage } from "../services/database/documentStorage";
import { imageStorage } from "../services/imageStorage";

export class DocumentMigration {
	static async migrateExistingDocuments(): Promise<{
		migrated: number;
		failed: number;
		skipped: number;
	}> {
		console.log("Starting document migration...");

		let migrated = 0;
		let failed = 0;
		let skipped = 0;

		try {
			const allDocuments = await documentStorage.getAllDocuments();
			console.log(`Found ${allDocuments.length} documents to check`);

			for (const doc of allDocuments) {
				try {
					// Check if image URI is temporary (contains 'cache')
					if (doc.imageUri && doc.imageUri.includes("cache")) {
						console.log(
							`Checking document ${doc.id} with URI: ${doc.imageUri}`,
						);

						// Check if the temporary file still exists
						const tempFileExists = await RNFS.exists(doc.imageUri);

						if (tempFileExists) {
							console.log("Temporary file still exists, migrating...");

							// Copy to permanent storage
							const permanentUri =
								await imageStorage.copyImageToPermanentStorage(
									doc.imageUri,
									doc.imageHash,
								);

							// Update the document if the URI changed
							if (permanentUri !== doc.imageUri) {
								await documentStorage.updateDocument(doc.id, {
									// We need to update the imageUri field directly
									// This might require a new method in documentStorage
								});

								console.log(`Migrated document ${doc.id} to permanent storage`);
								migrated++;
							} else {
								console.log(`Failed to migrate document ${doc.id}`);
								failed++;
							}
						} else {
							console.log(
								`Temporary file no longer exists for document ${doc.id}`,
							);
							failed++;
						}
					} else if (
						doc.imageUri &&
						doc.imageUri.includes("visara_documents")
					) {
						console.log(`Document ${doc.id} already using permanent storage`);
						skipped++;
					} else {
						console.log(
							`Document ${doc.id} has unknown URI format: ${doc.imageUri}`,
						);
						skipped++;
					}
				} catch (error) {
					console.error(`Error migrating document ${doc.id}:`, error);
					failed++;
				}
			}

			console.log(
				`Migration complete: ${migrated} migrated, ${failed} failed, ${skipped} skipped`,
			);

			return { migrated, failed, skipped };
		} catch (error) {
			console.error("Error during migration:", error);
			return { migrated: 0, failed: 0, skipped: 0 };
		}
	}

	static async checkDocumentStorage(): Promise<void> {
		console.log("Checking document storage...");

		try {
			const storageInfo = await imageStorage.getStorageInfo();
			console.log("Storage info:", storageInfo);

			const allDocuments = await documentStorage.getAllDocuments();

			let tempCount = 0;
			let permanentCount = 0;
			let missingCount = 0;

			for (const doc of allDocuments) {
				if (doc.imageUri) {
					if (doc.imageUri.includes("cache")) {
						tempCount++;
					} else if (doc.imageUri.includes("visara_documents")) {
						permanentCount++;
					}

					const fileExists = await RNFS.exists(doc.imageUri);
					if (!fileExists) {
						missingCount++;
						console.log(
							`Missing image for document ${doc.id}: ${doc.imageUri}`,
						);
					}
				}
			}

			console.log(`Document storage summary:
        Total documents: ${allDocuments.length}
        Using temporary storage: ${tempCount}
        Using permanent storage: ${permanentCount}
        Missing images: ${missingCount}
      `);
		} catch (error) {
			console.error("Error checking document storage:", error);
		}
	}
}

// Export convenience functions
export const migrateDocuments = () =>
	DocumentMigration.migrateExistingDocuments();
export const checkDocumentStorage = () =>
	DocumentMigration.checkDocumentStorage();
