import { Label } from "@models/Label";
import { Q } from "@nozbe/watermelondb";
import { database } from "./database";

export interface CreateLabelData {
	mediaFileId: string;
	label: string;
	confidence: number;
}

export class LabelRepository {
	static async create(data: CreateLabelData): Promise<Label> {
		return await database.write(async () => {
			return await database.get<Label>("labels").create((label) => {
				label.mediaFileId = data.mediaFileId;
				label.label = data.label;
				label.confidence = data.confidence;
			});
		});
	}

	static async findById(id: string): Promise<Label | null> {
		try {
			return await database.get<Label>("labels").find(id);
		} catch {
			return null;
		}
	}

	static async findByMediaFileId(mediaFileId: string): Promise<Label[]> {
		return await database
			.get<Label>("labels")
			.query(Q.where("media_file_id", mediaFileId))
			.fetch();
	}

	static async findByLabel(labelText: string): Promise<Label[]> {
		return await database
			.get<Label>("labels")
			.query(Q.where("label", labelText))
			.fetch();
	}

	static async findByLabelLike(labelText: string): Promise<Label[]> {
		return await database
			.get<Label>("labels")
			.query(Q.where("label", Q.like(`%${Q.sanitizeLikeString(labelText)}%`)))
			.fetch();
	}

	static async getAllUniqueLabels(): Promise<string[]> {
		const labels = await database.get<Label>("labels").query().fetch();
		const uniqueLabels = new Set(labels.map((label) => label.label));
		return Array.from(uniqueLabels).sort();
	}

	static async delete(label: Label): Promise<void> {
		await database.write(async () => {
			await label.markAsDeleted();
		});
	}

	static async deleteByMediaFileId(mediaFileId: string): Promise<void> {
		const labels = await this.findByMediaFileId(mediaFileId);
		await database.write(async () => {
			await Promise.all(labels.map((label) => label.markAsDeleted()));
		});
	}

	static async getMediaFilesWithLabel(labelText: string): Promise<string[]> {
		const labels = await this.findByLabel(labelText);
		return labels.map((label) => label.mediaFileId);
	}

	static async getMediaFilesWithLabelAboveConfidence(
		labelText: string,
		minConfidence: number,
	): Promise<string[]> {
		const labels = await database
			.get<Label>("labels")
			.query(
				Q.where("label", labelText),
				Q.where("confidence", Q.gte(minConfidence)),
			)
			.fetch();
		return labels.map((label) => label.mediaFileId);
	}

	static async count(): Promise<number> {
		return await database.get<Label>("labels").query().fetchCount();
	}

	static async countForMediaFile(mediaFileId: string): Promise<number> {
		return await database
			.get<Label>("labels")
			.query(Q.where("media_file_id", mediaFileId))
			.fetchCount();
	}
}
