import { Q } from "@nozbe/watermelondb";
import { database } from "./database";
import { AppSettings } from "@models/AppSettings";

export class AppSettingsRepository {
	private static instance: AppSettingsRepository;

	private constructor() {}

	static getInstance(): AppSettingsRepository {
		if (!this.instance) {
			this.instance = new AppSettingsRepository();
		}
		return this.instance;
	}

	async get(key: string): Promise<string | null> {
		const results = await database
			.get<AppSettings>("app_settings")
			.query(Q.where("key", key))
			.fetch();

		return results[0]?.value || null;
	}

	async set(key: string, value: string): Promise<AppSettings> {
		const existing = await database
			.get<AppSettings>("app_settings")
			.query(Q.where("key", key))
			.fetch();

		return await database.write(async () => {
			if (existing.length > 0) {
				// Update existing
				return await existing[0].update((record) => {
					record.value = value;
				});
			}
			// Create new
			return await database
				.get<AppSettings>("app_settings")
				.create((record) => {
					record.key = key;
					record.value = value;
				});
		});
	}

	async delete(key: string): Promise<void> {
		const existing = await database
			.get<AppSettings>("app_settings")
			.query(Q.where("key", key))
			.fetch();

		if (existing.length > 0) {
			await database.write(async () => {
				await existing[0].markAsDeleted();
			});
		}
	}

	async getAll(): Promise<Record<string, string>> {
		const settings = await database
			.get<AppSettings>("app_settings")
			.query()
			.fetch();

		const result: Record<string, string> = {};
		for (const setting of settings) {
			result[setting.key] = setting.value;
		}
		return result;
	}

	async clear(): Promise<void> {
		const settings = await database
			.get<AppSettings>("app_settings")
			.query()
			.fetch();

		await database.write(async () => {
			await Promise.all(settings.map((s) => s.markAsDeleted()));
		});
	}

	// Convenience methods for common settings
	async getGridZoomLevel(): Promise<number> {
		const value = await this.get("grid_zoom_level");
		return value ? Number.parseInt(value, 10) : 4; // Default 4 columns
	}

	async setGridZoomLevel(level: number): Promise<void> {
		await this.set("grid_zoom_level", level.toString());
	}

	async getTheme(): Promise<"light" | "dark" | "auto"> {
		const value = await this.get("theme");
		return (value as "light" | "dark" | "auto") || "auto";
	}

	async setTheme(theme: "light" | "dark" | "auto"): Promise<void> {
		await this.set("theme", theme);
	}

	async getBatterySaverEnabled(): Promise<boolean> {
		const value = await this.get("battery_saver_enabled");
		return value === "true";
	}

	async setBatterySaverEnabled(enabled: boolean): Promise<void> {
		await this.set("battery_saver_enabled", enabled.toString());
	}

	async getNightProcessingEnabled(): Promise<boolean> {
		const value = await this.get("night_processing_enabled");
		return value === "true";
	}

	async setNightProcessingEnabled(enabled: boolean): Promise<void> {
		await this.set("night_processing_enabled", enabled.toString());
	}

	async getOnboardingCompleted(): Promise<boolean> {
		const value = await this.get("onboarding_completed");
		return value === "true";
	}

	async setOnboardingCompleted(completed: boolean): Promise<void> {
		await this.set("onboarding_completed", completed.toString());
	}

	async getLastSyncTimestamp(): Promise<number> {
		const value = await this.get("last_sync_timestamp");
		return value ? Number.parseInt(value, 10) : 0;
	}

	async setLastSyncTimestamp(timestamp: number): Promise<void> {
		await this.set("last_sync_timestamp", timestamp.toString());
	}
}
