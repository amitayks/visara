import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import migrations from "./migrations";
import Document from "./models/Document";
import { schema } from "./schema";

const adapter = new SQLiteAdapter({
	schema,
	migrations,
	jsi: true,
	onSetUpError: (error) => {
		console.error("Database setup error:", error);
	},
});

export const database = new Database({
	adapter,
	modelClasses: [Document],
});

// Initialize database on import
let databaseInitialized = false;

export const initializeDatabase = async (): Promise<void> => {
	if (databaseInitialized) return;

	try {
		console.log("Initializing database...");
		// Test database connection
		await database.adapter.query(database.get("documents").query());
		console.log("Database initialized successfully");
		databaseInitialized = true;
	} catch (error) {
		console.error("Database initialization failed:", error);
		throw error;
	}
};
