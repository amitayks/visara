import { TurboModule, TurboModuleRegistry } from "react-native";

/**
 * Cross-platform thermal snapshot. The native module normalizes each OS onto a
 * shared 0..3 scale (see the mapping table in {@link ThermalService}); the raw
 * platform ordinal is preserved as {@link ThermalStatePayload.rawLevel} for
 * diagnostics.
 */
export interface ThermalStatePayload {
	level: number; // normalized 0..3
	name: string; // "nominal" | "fair" | "serious" | "critical"
	rawLevel: number; // platform ordinal (iOS 0..3, Android 0..6)
}

export interface Spec extends TurboModule {
	getThermalState(): Promise<ThermalStatePayload>;
	addListener(eventName: string): void;
	removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("ThermalObserver");
