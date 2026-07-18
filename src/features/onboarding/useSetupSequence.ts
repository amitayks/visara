/**
 * Setup-finale orchestration (onboarding-experience spec): one user tap runs
 * the whole first-run sequence — real platform photo access request, Android
 * notification permission (best-effort), model download auto-start
 * (fire-and-forget, Wi-Fi + charging gated) — then completes onboarding.
 *
 * Photo denial pauses the sequence in a recoverable `blocked` phase (retry +
 * open system settings + continue-anyway); nothing here ever blocks
 * completion, and the model download is never awaited beyond scheduling it.
 */

import { GemmaModelDeliveryService, requestMediaAccess } from "@backend/facade";
import { useSettingsStore } from "@state/settingsStore";
import { toast } from "@ui/components";
import { useCallback, useRef, useState } from "react";
import { Linking, PermissionsAndroid, Platform } from "react-native";

export type SetupTaskId = "photos" | "notifications" | "model";
export type SetupTaskStatus = "pending" | "active" | "done" | "attention";

export interface SetupTaskState {
	id: SetupTaskId;
	status: SetupTaskStatus;
	/** Supporting line under the task title; tracks the live outcome. */
	note: string;
}

export type SetupPhase = "idle" | "running" | "blocked" | "finishing";

/** Floor per task so instant resolutions still read as a sequence. */
const MIN_TASK_MS = 550;
/** Pause on the fully-ticked checklist before entering the app. */
const FINISH_DELAY_MS = 900;

/** Only Android needs a runtime notification permission (drain-progress FGS). */
const TASK_ORDER: readonly SetupTaskId[] =
	Platform.OS === "android"
		? ["photos", "notifications", "model"]
		: ["photos", "model"];

const PENDING_NOTES: Record<SetupTaskId, string> = {
	photos: "Find and organize your photo library.",
	notifications: "See analysis progress while Visara works.",
	model: "Downloads once over Wi-Fi while charging.",
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort Android 13+ notification prompt; declining is fine. */
async function requestNotifications(): Promise<boolean> {
	try {
		const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
		if (await PermissionsAndroid.check(permission)) return true;
		const result = await PermissionsAndroid.request(permission);
		return result === PermissionsAndroid.RESULTS.GRANTED;
	} catch (error) {
		console.warn("Onboarding notification request failed", error);
		return false;
	}
}

function initialTasks(): SetupTaskState[] {
	return TASK_ORDER.map((id) => ({
		id,
		status: "pending",
		note: PENDING_NOTES[id],
	}));
}

export interface SetupSequence {
	tasks: SetupTaskState[];
	phase: SetupPhase;
	/** Starts (or, from `blocked`, restarts) the sequence. */
	run: () => void;
	openSettings: () => void;
}

export function useSetupSequence(): SetupSequence {
	const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
	const setPermissionState = useSettingsStore((s) => s.setPermissionState);
	const [tasks, setTasks] = useState<SetupTaskState[]>(initialTasks);
	const [phase, setPhase] = useState<SetupPhase>("idle");
	const activeRef = useRef(false);

	const patchTask = useCallback(
		(id: SetupTaskId, status: SetupTaskStatus, note: string) => {
			setTasks((current) =>
				current.map((task) =>
					task.id === id ? { ...task, status, note } : task,
				),
			);
		},
		[],
	);

	const run = useCallback(() => {
		if (activeRef.current) return;
		activeRef.current = true;
		setPhase("running");

		void (async () => {
			try {
				// 1. Photo access — the real platform prompt, never assumed granted.
				patchTask("photos", "active", "Answer the system prompt to continue.");
				const [access] = await Promise.all([
					requestMediaAccess(),
					sleep(MIN_TASK_MS),
				]);
				setPermissionState(access);
				if (access === "denied") {
					patchTask(
						"photos",
						"attention",
						"Denied — Visara can't organize your photos without it.",
					);
					setPhase("blocked");
					return;
				}
				patchTask(
					"photos",
					"done",
					access === "limited"
						? "Organizing the photos you selected."
						: "Full library access granted.",
				);

				// 2. Notifications (Android only) — optional, declining never blocks.
				if (TASK_ORDER.includes("notifications")) {
					patchTask(
						"notifications",
						"active",
						"Answer the system prompt to continue.",
					);
					const [granted] = await Promise.all([
						requestNotifications(),
						sleep(MIN_TASK_MS),
					]);
					patchTask(
						"notifications",
						"done",
						granted
							? "Progress notifications enabled."
							: "Skipped — enable anytime in system settings.",
					);
				}

				// 3. Model delivery — opt in and schedule; never await the transfer.
				patchTask("model", "active", "Scheduling the download…");
				GemmaModelDeliveryService.setEnabled(true);
				const [result] = await Promise.all([
					GemmaModelDeliveryService.startDownload(),
					sleep(MIN_TASK_MS),
				]);
				if (!result.started && result.reason === "notEnoughSpace") {
					patchTask(
						"model",
						"attention",
						"Not enough free space — download it later from Settings.",
					);
				} else if (!result.started && result.reason === "alreadyReady") {
					patchTask("model", "done", "Already downloaded and ready.");
				} else {
					patchTask(
						"model",
						"done",
						"Runs over Wi-Fi while charging. Manage it in Settings.",
					);
				}

				setPhase("finishing");
				await sleep(FINISH_DELAY_MS);
				completeOnboarding();
			} catch (error) {
				console.warn("Onboarding setup sequence failed", error);
				toast.error("Setup hit a snag. Please try again.");
				setPhase("idle");
				setTasks(initialTasks());
			} finally {
				activeRef.current = false;
			}
		})();
	}, [patchTask, setPermissionState, completeOnboarding]);

	const openSettings = useCallback(() => {
		Linking.openSettings().catch(() => {
			toast.error("Could not open system settings.");
		});
	}, []);

	return { tasks, phase, run, openSettings };
}
