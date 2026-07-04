import {
	type DeliveryState,
	GemmaModelDeliveryService,
} from "@services/model/GemmaModelDeliveryService";
import { create } from "zustand";

interface ModelStore {
	state: DeliveryState | null;
	/** Sourced from the service on every emit — never a drifting local copy. */
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useModelStore = create<ModelStore>()(() => ({
	state: null,
	enabled: false,
	setEnabled: (enabled) => {
		// The service emits after the write; the subscription below refreshes
		// both fields from service truth (ai-model-settings spec).
		GemmaModelDeliveryService.setEnabled(enabled);
	},
}));

let detach: (() => void) | null = null;

/** Idempotent; called from bootstrap. Service emits current state on attach. */
export function attachModelStore(): () => void {
	if (detach) return detach;
	const unsubscribe = GemmaModelDeliveryService.subscribe((state) => {
		useModelStore.setState({
			state,
			enabled: GemmaModelDeliveryService.isEnabled(),
		});
	});
	detach = () => {
		unsubscribe();
		detach = null;
	};
	return detach;
}
