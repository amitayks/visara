/** biome-ignore-all lint/complexity/noStaticOnlyClass: its bother me */
import { Q } from "@nozbe/watermelondb";
import { database } from "./database";
import { ProcessingQueue } from "@models/ProcessingQueue";

export interface CreateProcessingQueueData {
	mediaFileId: string;
	status: "pending" | "processing" | "completed" | "failed";
	priority: number;
	retryCount?: number;
	errorMessage?: string;
}

export interface UpdateProcessingQueueData {
	status?: "pending" | "processing" | "completed" | "failed";
	priority?: number;
	retryCount?: number;
	errorMessage?: string;
}

export class ProcessingQueueRepository {
	static async create(
		data: CreateProcessingQueueData,
	): Promise<ProcessingQueue> {
		return await database.write(async () => {
			return await database
				.get<ProcessingQueue>("processing_queue")
				.create((queue) => {
					queue.mediaFileId = data.mediaFileId;
					queue.status = data.status;
					queue.priority = data.priority;
					queue.retryCount = data.retryCount || 0;
					queue.errorMessage = data.errorMessage;
				});
		});
	}

	static async findById(id: string): Promise<ProcessingQueue | null> {
		try {
			return await database.get<ProcessingQueue>("processing_queue").find(id);
		} catch {
			return null;
		}
	}

	static async findByMediaFileId(
		mediaFileId: string,
	): Promise<ProcessingQueue[]> {
		return await database
			.get<ProcessingQueue>("processing_queue")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}

	static async findByStatus(
		status: "pending" | "processing" | "completed" | "failed",
	): Promise<ProcessingQueue[]> {
		return await database
			.get<ProcessingQueue>("processing_queue")
			.query(
				Q.where("status", status),
				Q.sortBy("priority", Q.desc),
				Q.sortBy("created_at", Q.asc),
			)
			.fetch();
	}

	static async getPending(): Promise<ProcessingQueue[]> {
		return await this.findByStatus("pending");
	}

	static async getProcessing(): Promise<ProcessingQueue[]> {
		return await this.findByStatus("processing");
	}

	static async getFailed(): Promise<ProcessingQueue[]> {
		return await this.findByStatus("failed");
	}

	static async getNextPending(): Promise<ProcessingQueue | null> {
		const pending = await database
			.get<ProcessingQueue>("processing_queue")
			.query(
				Q.where("status", "pending"),
				Q.sortBy("priority", Q.desc),
				Q.sortBy("created_at", Q.asc),
			)
			.fetch();

		return pending[0] || null;
	}

	static async update(
		queue: ProcessingQueue,
		data: UpdateProcessingQueueData,
	): Promise<ProcessingQueue> {
		return await database.write(async () => {
			return await queue.update((record) => {
				if (data.status !== undefined) record.status = data.status;
				if (data.priority !== undefined) record.priority = data.priority;
				if (data.retryCount !== undefined) record.retryCount = data.retryCount;
				if (data.errorMessage !== undefined)
					record.errorMessage = data.errorMessage;
			});
		});
	}

	static async markAsProcessing(queue: ProcessingQueue): Promise<ProcessingQueue> {
		return await this.update(queue, { status: "processing" });
	}

	static async markAsCompleted(queue: ProcessingQueue): Promise<ProcessingQueue> {
		return await this.update(queue, { status: "completed" });
	}

	static async markAsFailed(
		queue: ProcessingQueue,
		errorMessage: string,
	): Promise<ProcessingQueue> {
		return await this.update(queue, {
			status: "failed",
			errorMessage,
			retryCount: queue.retryCount + 1,
		});
	}

	static async retry(queue: ProcessingQueue): Promise<ProcessingQueue> {
		return await this.update(queue, {
			status: "pending",
			retryCount: queue.retryCount + 1,
			errorMessage: undefined,
		});
	}

	static async delete(queue: ProcessingQueue): Promise<void> {
		await database.write(async () => {
			await queue.markAsDeleted();
		});
	}

	static async deleteByMediaFileId(mediaFileId: string): Promise<void> {
		const queues = await this.findByMediaFileId(mediaFileId);
		await database.write(async () => {
			await Promise.all(queues.map((q) => q.markAsDeleted()));
		});
	}

	static async clearCompleted(): Promise<void> {
		const completed = await this.findByStatus("completed");
		await database.write(async () => {
			await Promise.all(completed.map((q) => q.markAsDeleted()));
		});
	}

	static async clearFailed(): Promise<void> {
		const failed = await this.findByStatus("failed");
		await database.write(async () => {
			await Promise.all(failed.map((q) => q.markAsDeleted()));
		});
	}

	static async count(): Promise<number> {
		return await database
			.get<ProcessingQueue>("processing_queue")
			.query()
			.fetchCount();
	}

	static async countByStatus(
		status: "pending" | "processing" | "completed" | "failed",
	): Promise<number> {
		return await database
			.get<ProcessingQueue>("processing_queue")
			.query(Q.where("status", status))
			.fetchCount();
	}

	static observePending() {
		return database
			.get<ProcessingQueue>("processing_queue")
			.query(
				Q.where("status", "pending"),
				Q.sortBy("priority", Q.desc),
				Q.sortBy("created_at", Q.asc),
			)
			.observe();
	}

	static observeProcessing() {
		return database
			.get<ProcessingQueue>("processing_queue")
			.query(Q.where("status", "processing"))
			.observe();
	}
}
