import { create } from "zustand";

interface SelectionState {
	active: boolean;
	ids: ReadonlySet<string>;
	enter: (id: string) => void;
	toggle: (id: string) => void;
	clear: () => void;
}

/**
 * Multi-select state. Cells subscribe per-id via useIsSelected so a 10k-item
 * grid re-renders only the cells whose membership flipped
 * (ui-state-management spec).
 */
export const useSelectionStore = create<SelectionState>()((set) => ({
	active: false,
	ids: new Set<string>(),

	enter: (id) => set({ active: true, ids: new Set([id]) }),
	toggle: (id) =>
		set((s) => {
			const next = new Set(s.ids);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next.size === 0
				? { active: false, ids: next }
				: { active: true, ids: next };
		}),
	clear: () => set({ active: false, ids: new Set<string>() }),
}));

export function useIsSelected(id: string): boolean {
	return useSelectionStore((s) => s.ids.has(id));
}
