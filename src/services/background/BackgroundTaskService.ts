/** biome-ignore-all lint/complexity/noStaticOnlyClass: it bother me */

import { ThermalService } from "@services/device/ThermalService";
import { storage } from "@services/storage/mmkv";
import { STORAGE_KEYS } from "@utils/constants/storage-keys";
import { getBatteryStatus, shouldAllowProcessing } from "@utils/device/battery";
import {
	AppState,
	type AppStateStatus,
	type NativeEventSubscription,
} from "react-native";
import BackgroundService from "react-native-background-actions";

export interface BackgroundTaskOptions {
	taskName: string;
	taskTitle: string;
	taskDesc: string;
	taskIcon?: {
		name: string;
		type: string;
	};
	color?: string;
	linkingURI?: string;
	progressBar?: {
		max: number;
		value: number;
		indeterminate?: boolean;
	};
}

export interface TaskCheckpoint {
	lastProcessedId?: string;
	totalProcessed: number;
	totalFailed: number;
	timestamp: number;
	isPaused: boolean;
}

export interface BatteryStatus {
	isCharging: boolean;
	level: number;
}

export interface TaskProgress {
	current: number;
	total: number;
	percentage: number;
	status: "idle" | "running" | "paused" | "completed" | "error";
}

/**
 * BackgroundTaskService manages background processing tasks
 * with support for:
 * - Pause/resume capability
 * - Checkpoint persistence
 * - Battery and thermal monitoring
 * - Night processing mode
 * - Notification progress updates
 */
export class BackgroundTaskService {
	private static isRunning = false;
	private static isPaused = false;
	private static currentTask: (() => Promise<void>) | null = null;
	private static shouldStop = false;
	private static appStateSubscription: NativeEventSubscription | null = null;
	private static checkpoint: TaskCheckpoint = {
		totalProcessed: 0,
		totalFailed: 0,
		timestamp: Date.now(),
		isPaused: false,
	};

	// Settings
	private static batterySaverEnabled = false;
	private static nightProcessingEnabled = false;

	/**
	 * Initialize the background task service
	 */
	static async initialize(): Promise<void> {
		try {
			// Load checkpoint from storage
			await this.loadCheckpoint();

			// Load settings from storage
			this.batterySaverEnabled =
				storage.getBoolean(STORAGE_KEYS.BATTERY_SAVER_ENABLED) ?? false;
			this.nightProcessingEnabled =
				storage.getBoolean(STORAGE_KEYS.NIGHT_PROCESSING_ENABLED) ?? false;

			// Prime the thermal cache and subscribe to the OS change stream before
			// any drain starts, so shouldPauseProcessing can read it synchronously.
			// Fail-open: a broken/absent module leaves the cached level at nominal.
			await ThermalService.initialize();

			// Set up app state listener
			this.setupAppStateListener();

			// If there was an active task, restore pause state
			if (this.checkpoint.isPaused) {
				this.isPaused = true;
			}
		} catch (error) {
			console.error("BackgroundTaskService.initialize error:", error);
		}
	}

	/**
	 * Start a background task
	 */
	static async start(
		taskFunction: () => Promise<void>,
		options: BackgroundTaskOptions,
	): Promise<void> {
		if (this.isRunning) {
			console.warn("Background task is already running");
			return;
		}

		try {
			this.isRunning = true;
			this.shouldStop = false;
			this.currentTask = taskFunction;

			// Create the background task wrapper
			const veryIntensiveTask = async (taskDataArguments?: {
				delay: number;
			}) => {
				const { delay } = taskDataArguments || { delay: 100 };

				await new Promise<void>((resolve) => {
					const runTask = async () => {
						// Run the task loop
						while (!this.shouldStop && BackgroundService.isRunning()) {
							try {
								// Check if we should pause
								if (await this.shouldPauseProcessing()) {
									this.isPaused = true;
									this.checkpoint.isPaused = true;
									await this.saveCheckpoint();

									// Update notification to show paused state
									await this.updateNotification({
										...options,
										taskDesc: "Processing paused",
										progressBar: options.progressBar
											? { ...options.progressBar, indeterminate: false }
											: undefined,
									});

									// Wait while paused
									await new Promise<void>((pauseResolve) => {
										const checkPauseInterval = setInterval(async () => {
											const shouldPause = await this.shouldPauseProcessing();
											if (!shouldPause || this.shouldStop) {
												clearInterval(checkPauseInterval);
												pauseResolve();
											}
										}, 1000);
									});

									this.isPaused = false;
									this.checkpoint.isPaused = false;
									await this.saveCheckpoint();
								}

								// Run the actual task function
								if (this.currentTask && !this.shouldStop) {
									await this.currentTask();
								}

								// Small delay between iterations
								await new Promise<void>((delayResolve) =>
									setTimeout(delayResolve, delay),
								);
							} catch (error) {
								console.error("Background task error:", error);
								this.checkpoint.totalFailed += 1;
								await this.saveCheckpoint();
							}
						}

						resolve();
					};

					// Start the task
					runTask().catch((error) => {
						console.error("Fatal background task error:", error);
						resolve();
					});
				});
			};

			// Start the background service
			await BackgroundService.start(veryIntensiveTask, {
				taskName: options.taskName,
				taskTitle: options.taskTitle,
				taskDesc: options.taskDesc,
				taskIcon: options.taskIcon || {
					name: "visara_launcher",
					type: "mipmap",
				},
				// targetSdk 34+ prohibits starting a FGS with type "none"; must match
				// the dataSync type declared on the service in AndroidManifest.xml.
				foregroundServiceType: ["dataSync"],
				color: options.color || "#FF6347",
				linkingURI: options.linkingURI,
				parameters: {
					delay: 100, // Small delay between iterations
				},
				progressBar: options.progressBar,
			});
		} catch (error) {
			console.error("BackgroundTaskService.start error:", error);
			this.isRunning = false;
			throw error;
		}
	}

	/**
	 * Stop the background task
	 */
	static async stop(): Promise<void> {
		try {
			this.shouldStop = true;
			this.currentTask = null;

			if (BackgroundService.isRunning()) {
				await BackgroundService.stop();
			}

			this.isRunning = false;
			this.isPaused = false;

			// Save final checkpoint
			await this.saveCheckpoint();
		} catch (error) {
			console.error("BackgroundTaskService.stop error:", error);
			throw error;
		}
	}

	/**
	 * Pause processing
	 */
	static async pause(): Promise<void> {
		if (!this.isRunning) {
			console.warn("No background task is running");
			return;
		}

		this.isPaused = true;
		this.checkpoint.isPaused = true;
		await this.saveCheckpoint();
	}

	/**
	 * Resume processing
	 */
	static async resume(): Promise<void> {
		if (!this.isRunning) {
			console.warn("No background task is running");
			return;
		}

		this.isPaused = false;
		this.checkpoint.isPaused = false;
		await this.saveCheckpoint();
	}

	/**
	 * Update notification with progress
	 */
	static async updateNotification(
		options: Partial<BackgroundTaskOptions>,
	): Promise<void> {
		try {
			if (BackgroundService.isRunning()) {
				await BackgroundService.updateNotification({
					taskTitle: options.taskTitle,
					taskDesc: options.taskDesc,
					progressBar: options.progressBar,
				});
			}
		} catch (error) {
			console.error("BackgroundTaskService.updateNotification error:", error);
		}
	}

	/**
	 * Update progress
	 */
	static async updateProgress(current: number, total: number): Promise<void> {
		try {
			this.checkpoint.totalProcessed = current;
			this.checkpoint.timestamp = Date.now();

			// Update notification with progress
			if (BackgroundService.isRunning()) {
				const percentage = Math.floor((current / total) * 100);
				await BackgroundService.updateNotification({
					taskDesc: `Processing ${current} of ${total} (${percentage}%)`,
					progressBar: {
						max: total,
						value: current,
						indeterminate: false,
					},
				});
			}

			// Save checkpoint periodically (every 10 items)
			if (current % 10 === 0) {
				await this.saveCheckpoint();
			}
		} catch (error) {
			console.error("BackgroundTaskService.updateProgress error:", error);
		}
	}

	/**
	 * Check if processing should pause based on settings
	 */
	private static async shouldPauseProcessing(): Promise<boolean> {
		// Check if manually paused
		if (this.isPaused) {
			return true;
		}

		// Check battery saver mode
		if (this.batterySaverEnabled) {
			const canProcess = await shouldAllowProcessing(this.batterySaverEnabled);
			if (!canProcess) {
				return true; // Pause if not charging
			}
		}

		// Check night processing mode
		if (this.nightProcessingEnabled) {
			const currentHour = new Date().getHours();
			// Night processing runs ONLY between 00:00-06:00
			const isNightTime = currentHour >= 0 && currentHour < 6;
			if (!isNightTime) {
				return true; // Pause during day
			}
		}

		// Thermal pressure — always-on device safety (not a settings toggle),
		// reading the cached level (no per-tick native round-trip), fail-open.
		// Protects any heavy pass, Tier-0 included.
		if (ThermalService.isThrottledForDrain()) {
			return true;
		}

		return false;
	}

	/**
	 * Save checkpoint to storage
	 */
	private static async saveCheckpoint(): Promise<void> {
		try {
			this.checkpoint.timestamp = Date.now();
			storage.set(
				STORAGE_KEYS.PROCESSING_CHECKPOINT,
				JSON.stringify(this.checkpoint),
			);
		} catch (error) {
			console.error("BackgroundTaskService.saveCheckpoint error:", error);
		}
	}

	/**
	 * Load checkpoint from storage
	 */
	private static async loadCheckpoint(): Promise<void> {
		try {
			const checkpointJson = storage.getString(
				STORAGE_KEYS.PROCESSING_CHECKPOINT,
			);
			if (checkpointJson) {
				this.checkpoint = JSON.parse(checkpointJson);
			}
		} catch (error) {
			console.error("BackgroundTaskService.loadCheckpoint error:", error);
		}
	}

	/**
	 * Get current checkpoint
	 */
	static getCheckpoint(): TaskCheckpoint {
		return { ...this.checkpoint };
	}

	/**
	 * Reset checkpoint
	 */
	static async resetCheckpoint(): Promise<void> {
		this.checkpoint = {
			totalProcessed: 0,
			totalFailed: 0,
			timestamp: Date.now(),
			isPaused: false,
		};
		await this.saveCheckpoint();
	}

	/**
	 * Set last processed ID for resuming
	 */
	static async setLastProcessedId(id: string): Promise<void> {
		this.checkpoint.lastProcessedId = id;
		await this.saveCheckpoint();
	}

	/**
	 * Get task status
	 */
	static getStatus(): {
		isRunning: boolean;
		isPaused: boolean;
		checkpoint: TaskCheckpoint;
	} {
		return {
			isRunning: this.isRunning,
			isPaused: this.isPaused,
			checkpoint: this.getCheckpoint(),
		};
	}

	/**
	 * Update settings
	 */
	static updateSettings(settings: {
		batterySaverEnabled?: boolean;
		nightProcessingEnabled?: boolean;
	}): void {
		// Persistence is owned solely by the settings store (ui-state-management
		// spec: one writer, one type per key); this service only mirrors values
		// in memory for drain gating and reads the boolean keys at initialize().
		if (settings.batterySaverEnabled !== undefined) {
			this.batterySaverEnabled = settings.batterySaverEnabled;
		}
		if (settings.nightProcessingEnabled !== undefined) {
			this.nightProcessingEnabled = settings.nightProcessingEnabled;
		}
	}

	/**
	 * Set up app state listener to handle app termination
	 */
	private static setupAppStateListener(): void {
		this.appStateSubscription = AppState.addEventListener(
			"change",
			this.handleAppStateChange,
		);
	}

	/**
	 * Handle app state changes
	 */
	private static handleAppStateChange = async (
		nextAppState: AppStateStatus,
	): Promise<void> => {
		if (nextAppState === "background" || nextAppState === "inactive") {
			// Save checkpoint when app goes to background
			await this.saveCheckpoint();
		}
	};

	/**
	 * Clean up listeners
	 */
	static cleanup(): void {
		if (this.appStateSubscription) {
			this.appStateSubscription.remove();
			this.appStateSubscription = null;
		}
	}

	/**
	 * Check if service is running
	 */
	static isTaskRunning(): boolean {
		return this.isRunning;
	}

	/**
	 * Check if service is paused
	 */
	static isTaskPaused(): boolean {
		return this.isPaused;
	}

	/**
	 * Increment processed count
	 */
	static async incrementProcessed(): Promise<void> {
		this.checkpoint.totalProcessed += 1;
		this.checkpoint.timestamp = Date.now();
	}

	/**
	 * Increment failed count
	 */
	static async incrementFailed(): Promise<void> {
		this.checkpoint.totalFailed += 1;
		this.checkpoint.timestamp = Date.now();
	}

	/**
	 * Get current battery status
	 */
	static async getBatteryInfo(): Promise<{
		level: number;
		isCharging: boolean;
		percentage: number;
	}> {
		const status = await getBatteryStatus();
		return {
			...status,
			percentage: Math.round(status.level * 100),
		};
	}
}
