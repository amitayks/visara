/**
 * Metadata loading for the photo drawer: fetches the v2 enrichment record
 * (open-vocabulary tags, caption, description, transcribed in-photo text) for
 * whatever photo the drawer currently targets. The effect is keyed on the
 * target id, so paging the viewer while the drawer is open re-fetches for the
 * newly displayed photo. `null` means "loading" (panes render skeletons);
 * pass a null id while the drawer is closed to hold/reset that state.
 */

import { loadMediaMetadata } from "@backend/facade";
import { toast } from "@ui/components";
import { useEffect, useState } from "react";

export interface DrawerMetadata {
	tags: string[];
	caption: string | null;
	description: string | null;
	ocrText: string | null;
}

const EMPTY: DrawerMetadata = {
	tags: [],
	caption: null,
	description: null,
	ocrText: null,
};

export function useDrawerMetadata(
	mediaId: string | null,
): DrawerMetadata | null {
	const [metadata, setMetadata] = useState<DrawerMetadata | null>(null);

	useEffect(() => {
		setMetadata(null);
		if (mediaId == null) return;
		let cancelled = false;
		loadMediaMetadata(mediaId)
			.then((meta) => {
				if (cancelled) return;
				setMetadata({
					tags: meta.labels,
					caption: meta.caption,
					description: meta.description,
					ocrText: meta.ocrText,
				});
			})
			.catch(() => {
				if (cancelled) return;
				setMetadata(EMPTY);
				toast.error("Couldn't load photo details");
			});
		return () => {
			cancelled = true;
		};
	}, [mediaId]);

	return metadata;
}
