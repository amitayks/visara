import type { MediaFile } from "@models/MediaFile";
import { MediaFileRepository } from "@services/database/MediaFileRepository";
import { useEffect, useState } from "react";

const THROTTLE_MS = 250;

/**
 * The one sanctioned gallery data path (ui-state-management spec): a single
 * screen-level subscription to WatermelonDB's observeVisible() with trailing
 * throttle, held in screen state — never mirrored into a global store. Cells
 * memo on the reference-stable Model instances inside the array.
 */
export function useVisibleMedia(): { media: MediaFile[]; ready: boolean } {
	const [media, setMedia] = useState<MediaFile[]>([]);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let latest: MediaFile[] | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let first = true;

		const flush = () => {
			timer = null;
			if (latest !== null) {
				setMedia(latest);
				latest = null;
			}
		};

		const subscription = MediaFileRepository.observeVisible().subscribe(
			(files) => {
				if (first) {
					// First emission renders immediately so launch isn't throttled.
					first = false;
					setMedia(files);
					setReady(true);
					return;
				}
				latest = files;
				if (timer === null) {
					timer = setTimeout(flush, THROTTLE_MS);
				}
			},
		);

		return () => {
			if (timer !== null) clearTimeout(timer);
			subscription.unsubscribe();
		};
	}, []);

	return { media, ready };
}
