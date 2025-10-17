/**
 * useDatabase Hook
 *
 * Ensures WatermelonDB is ready before use.
 * Handles any migration/setup errors gracefully.
 *
 * Usage:
 * ```tsx
 * const { isReady, error } = useDatabase();
 *
 * if (!isReady) return <LoadingScreen />;
 * if (error) return <ErrorScreen error={error} />;
 * ```
 *
 * Constitutional alignment:
 * - Code Quality & Architecture: Proper initialization and error handling
 * - User Experience Excellence: Graceful loading states
 */

import { database } from "@services/database/database";
import { useEffect, useState } from "react";

export interface UseDatabaseReturn {
	/** Whether database is ready for use */
	isReady: boolean;
	/** Error if database initialization failed */
	error: Error | null;
}

/**
 * Hook to ensure WatermelonDB is initialized and ready
 */
export function useDatabase(): UseDatabaseReturn {
	const [isReady, setIsReady] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		const initDB = async () => {
			try {
				// WatermelonDB auto-initializes when imported, but we verify it's working
				// by attempting to access the database adapter
				if (!database) {
					throw new Error("Database instance not found");
				}

				if (!database.adapter) {
					throw new Error("Database adapter not initialized");
				}

				// Small delay to ensure adapter is fully ready
				await new Promise((resolve) => setTimeout(resolve, 50));

				setIsReady(true);
				console.log("✅ Database initialized successfully");
			} catch (err) {
				console.error("❌ Database initialization failed:", err);
				setError(err instanceof Error ? err : new Error(String(err)));
				setIsReady(false);
			}
		};

		initDB();
	}, []);

	return { isReady, error };
}
