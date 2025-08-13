import RNFS from "react-native-fs";
import { memoryManager } from "./memoryManager";

export interface CleanupTask {
	id: string;
	cleanup: () => Promise<void>;
	priority: "high" | "normal" | "low";
	createdAt: number;
}

/**
 * Registry for tracking and executing cleanup tasks
 * Ensures all resources are properly cleaned up even on errors
 */
export class CleanupRegistry {
	private cleanupTasks = new Map<string, CleanupTask>();
	private executedTasks = new Set<string>();
	private readonly taskTimeout = 5000; // 5 seconds max per task

	/**
	 * Register a cleanup task
	 */
	register(
		id: string,
		cleanup: () => Promise<void>,
		priority: "high" | "normal" | "low" = "normal",
	): void {
		if (this.executedTasks.has(id)) {
			console.warn(
				`[CleanupRegistry] Task ${id} already executed, skipping registration`,
			);
			return;
		}

		this.cleanupTasks.set(id, {
			id,
			cleanup,
			priority,
			createdAt: Date.now(),
		});

		console.log(
			`[CleanupRegistry] Registered cleanup task: ${id} (${priority})`,
		);
	}

	/**
	 * Register a file for deletion
	 */
	registerFile(path: string, source: string = "unknown"): void {
		if (!path) return;

		const id = `file_${path}`;
		this.register(
			id,
			async () => {
				try {
					const exists = await RNFS.exists(path);
					if (exists) {
						await RNFS.unlink(path);
						console.log(`[CleanupRegistry] Deleted file: ${path}`);
					}
				} catch (error) {
					console.warn(
						`[CleanupRegistry] Failed to delete file ${path}:`,
						error,
					);
				}
			},
			"high", // File cleanup is high priority
		);

		// Also register with memory manager
		memoryManager.registerTempFile(path, source);
	}

	/**
	 * Register multiple files for deletion
	 */
	registerFiles(paths: string[], source: string = "unknown"): void {
		for (const path of paths) {
			this.registerFile(path, source);
		}
	}

	/**
	 * Execute a specific cleanup task
	 */
	async cleanup(id: string): Promise<void> {
		const task = this.cleanupTasks.get(id);
		if (!task) {
			return;
		}

		if (this.executedTasks.has(id)) {
			console.log(`[CleanupRegistry] Task ${id} already executed`);
			return;
		}

		try {
			// Add timeout to prevent hanging
			await this.executeWithTimeout(task.cleanup(), this.taskTimeout);
			this.executedTasks.add(id);
			this.cleanupTasks.delete(id);
			console.log(`[CleanupRegistry] Executed cleanup task: ${id}`);
		} catch (error) {
			console.error(`[CleanupRegistry] Cleanup task ${id} failed:`, error);
			// Still mark as executed to prevent retry
			this.executedTasks.add(id);
			this.cleanupTasks.delete(id);
		}
	}

	/**
	 * Execute all cleanup tasks
	 */
	async cleanupAll(): Promise<void> {
		if (this.cleanupTasks.size === 0) {
			return;
		}

		console.log(
			`[CleanupRegistry] Starting cleanup of ${this.cleanupTasks.size} tasks`,
		);

		// Sort tasks by priority
		const tasks = Array.from(this.cleanupTasks.values()).sort((a, b) => {
			const priorityOrder = { high: 0, normal: 1, low: 2 };
			return priorityOrder[a.priority] - priorityOrder[b.priority];
		});

		// Execute high priority tasks first, then others in parallel
		const highPriorityTasks = tasks.filter((t) => t.priority === "high");
		const otherTasks = tasks.filter((t) => t.priority !== "high");

		// Execute high priority tasks sequentially
		for (const task of highPriorityTasks) {
			await this.cleanup(task.id);
		}

		// Execute other tasks in parallel
		await Promise.all(otherTasks.map((task) => this.cleanup(task.id)));

		console.log(
			`[CleanupRegistry] Cleanup completed. Executed: ${this.executedTasks.size} tasks`,
		);
	}

	/**
	 * Clear all tasks without executing
	 */
	clear(): void {
		this.cleanupTasks.clear();
		this.executedTasks.clear();
	}

	/**
	 * Get statistics about pending tasks
	 */
	getStats(): {
		pending: number;
		executed: number;
		byPriority: Record<string, number>;
	} {
		const byPriority: Record<string, number> = {
			high: 0,
			normal: 0,
			low: 0,
		};

		for (const task of this.cleanupTasks.values()) {
			byPriority[task.priority]++;
		}

		return {
			pending: this.cleanupTasks.size,
			executed: this.executedTasks.size,
			byPriority,
		};
	}

	/**
	 * Execute a promise with timeout
	 */
	private executeWithTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
	): Promise<T> {
		return Promise.race([
			promise,
			new Promise<T>((_, reject) =>
				setTimeout(() => reject(new Error("Cleanup task timeout")), timeoutMs),
			),
		]);
	}
}

/**
 * Helper class for tracking temp files in a specific operation
 */
export class TempFileTracker {
	private files = new Set<string>();
	private registry: CleanupRegistry;

	constructor(private source: string = "unknown") {
		this.registry = new CleanupRegistry();
	}

	/**
	 * Add a temp file to track
	 */
	add(path: string): void {
		if (!path) return;

		this.files.add(path);
		this.registry.registerFile(path, this.source);
		console.log(`[TempFileTracker] Tracking file: ${path} from ${this.source}`);
	}

	/**
	 * Add multiple temp files
	 */
	addAll(paths: string[]): void {
		for (const path of paths) {
			this.add(path);
		}
	}

	/**
	 * Clean up all tracked files
	 */
	async cleanupAll(): Promise<void> {
		if (this.files.size === 0) return;

		console.log(
			`[TempFileTracker] Cleaning ${this.files.size} files from ${this.source}`,
		);
		await this.registry.cleanupAll();
		this.files.clear();
	}

	/**
	 * Get tracked file count
	 */
	get count(): number {
		return this.files.size;
	}

	/**
	 * Get all tracked file paths
	 */
	get paths(): string[] {
		return Array.from(this.files);
	}
}
