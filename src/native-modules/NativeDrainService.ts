import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

/**
 * DrainService TurboModule spec. Codegen: VisaraSpecs. Android-only —
 * implemented in Kotlin (DrainServiceModule.kt + VisaraDrainService.kt); on
 * iOS the module is absent and this export is null (the iOS drain host is
 * expo-keep-awake, no service involved).
 *
 * The service is a keep-alive token: it runs NO work itself. The drain loop
 * stays in the app's main JS runtime; the foreground service only holds
 * foreground process priority (so Android neither freezes nor kills the app
 * while the library is analyzed) and owns the progress notification.
 *
 * Events (DeviceEventManagerModule):
 *  - "drain_service_teardown" { reason: "timeout" | "destroyed" } — the
 *    service went away without a JS stop() (FGS runtime budget exhausted or
 *    an OS stop). The caller downgrades to foreground-gated draining.
 */
export interface Spec extends TurboModule {
	/**
	 * Start the keep-alive foreground service with an initial notification
	 * text. Resolves `false` (never rejects) when the OS refuses the start —
	 * app not in a foreground-eligible state on Android 12+/strict OEMs.
	 */
	start(text: string): Promise<boolean>;
	/** Stop the service and remove its notification. Idempotent. */
	stop(): Promise<void>;
	/** Update the notification's text + determinate progress bar. */
	updateProgress(processed: number, total: number, text: string): Promise<void>;
	/** Update only the notification text (progress bar keeps its last state). */
	updateText(text: string): Promise<void>;
	/**
	 * Resolve after `ms` on a native handler. React Native suspends JS timers
	 * while the host activity is paused — with only the FGS keeping the
	 * process alive, a backgrounded drain loop would park on setTimeout until
	 * the next foreground. Native promises are still delivered, so this is
	 * the loop's background-safe sleep.
	 */
	delay(ms: number): Promise<void>;
	addListener(eventName: string): void;
	removeListeners(count: number): void;
}

export default TurboModuleRegistry.get<Spec>("DrainService");
