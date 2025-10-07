export const STORAGE_KEYS = {
	SEARCH_INDEX: 'search_index',
	USER_PREFS: 'user_preferences',
	PROCESSING_CHECKPOINT: 'processing_checkpoint',
	ONBOARDING_COMPLETED: 'onboarding_completed',
	THEME: 'theme',
	GRID_ZOOM_LEVEL: 'grid_zoom_level',
	BATTERY_SAVER_ENABLED: 'battery_saver_enabled',
	NIGHT_PROCESSING_ENABLED: 'night_processing_enabled',
	LAST_SYNC_TIMESTAMP: 'last_sync_timestamp',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
