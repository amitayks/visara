/**
 * Selection-mode overlay (gallery-experience spec): floating SelectionBar
 * with live count, share loop, and a confirmed delete that runs the
 * full-cleanup facade path (removeMedia — DB row, index entries, semantic
 * vector, queue rows; device file too when permanent). Grid removal stays
 * reactive: nothing here mutates mirrored UI state.
 *
 * GalleryPage mounts this unconditionally; it subscribes to selectionStore
 * itself and renders null while selection is inactive, keeping selection
 * traffic out of the page and the grid.
 */

import { removeMedia } from "@backend/facade";
import type { MediaRow as MediaFile } from "@backend/types";
import { useSelectionStore } from "@state/selectionStore";
import {
	Dialog,
	SegmentedControl,
	SelectionBar,
	Text,
	toast,
} from "@ui/components";
import { sharePhoto } from "@utils/photoActions";
import { useRef, useState } from "react";

export interface GallerySelectionProps {
	/** The displayed dataset — selected ids resolve against it in display order. */
	items: MediaFile[];
}

type DeleteScope = "app" | "device";

const DELETE_SCOPE_OPTIONS = [
	{ label: "From app", value: "app" },
	{ label: "From device", value: "device" },
] as const;

function photosLabel(count: number): string {
	return count === 1 ? "photo" : `${count} photos`;
}

export function GallerySelection({ items }: GallerySelectionProps) {
	const active = useSelectionStore((s) => s.active);
	const ids = useSelectionStore((s) => s.ids);
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [scope, setScope] = useState<DeleteScope>("app");
	const busyRef = useRef(false);

	if (!active) {
		return null;
	}

	const selectedItems = () => items.filter((media) => ids.has(media.id));

	const handleShare = async () => {
		const selected = selectedItems();
		if (selected.length === 0) return;
		try {
			for (const media of selected) {
				await sharePhoto(media);
			}
			useSelectionStore.getState().clear();
		} catch {
			toast.error("Couldn't share the selected photos");
		}
	};

	const handleConfirmDelete = async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		const permanent = scope === "device";
		const selected = selectedItems();

		// Exit selection mode immediately; the grid empties reactively as the
		// database observable emits each removal.
		setConfirmVisible(false);
		useSelectionStore.getState().clear();

		let failed = 0;
		for (const media of selected) {
			try {
				await removeMedia(media, { permanent });
			} catch {
				failed += 1;
			}
		}
		busyRef.current = false;

		if (failed > 0) {
			toast.error(`Couldn't delete ${failed} of ${selected.length}`);
		} else if (permanent) {
			toast.success(`Deleted ${photosLabel(selected.length)} from device`);
		} else {
			toast.success(`Removed ${photosLabel(selected.length)} from app`);
		}
	};

	const count = ids.size;

	return (
		<>
			<SelectionBar
				count={count}
				onShare={() => {
					void handleShare();
				}}
				onDelete={() => {
					setScope("app");
					setConfirmVisible(true);
				}}
				onClear={() => useSelectionStore.getState().clear()}
			/>
			<Dialog
				visible={confirmVisible}
				title={count === 1 ? "Delete photo?" : `Delete ${count} photos?`}
				destructive
				confirmLabel="Delete"
				onConfirm={() => {
					void handleConfirmDelete();
				}}
				onCancel={() => setConfirmVisible(false)}
			>
				<SegmentedControl
					options={DELETE_SCOPE_OPTIONS}
					value={scope}
					onChange={setScope}
					testID="delete-scope"
				/>
				<Text variant="footnote" color="textSecondary">
					{scope === "device"
						? "Photos will be permanently deleted from this device. This can't be undone."
						: "Photos will be removed from Visara's library but stay on your device."}
				</Text>
			</Dialog>
		</>
	);
}
