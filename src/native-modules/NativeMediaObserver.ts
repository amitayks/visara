import { TurboModule, TurboModuleRegistry } from "react-native";

export interface MediaChange {
	action: "added" | "modified" | "deleted";
	uri: string;
	filename: string;
	mimeType: string;
	width: number;
	height: number;
	fileSize: number;
	creationDate: number;
	modificationDate: number;
	latitude?: number;
	longitude?: number;
}

export interface Spec extends TurboModule {
	startInitialScan(): void;
	getChangesSince(timestamp: number): void;
	startObserver(throttleMs: number): void;
	stopObserver(): void;
	addListener(eventName: string): void;
	removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("MediaObserver");
