/**
 * GalleryPage (gallery-experience + search-experience specs): the single grid
 * host. Displayed dataset = search results while search mode is active, the
 * PDF filter in document mode, else the full visible library. Search is
 * rendered inline in place of the grid — no overlay search component exists.
 *
 * Data flows: useVisibleMedia (throttled DB observable, screen state) for the
 * library; searchStore for results (the search controller owns
 * debounce/dispatch); processingStore only inside DrainProgress so drain
 * events never re-render the page or the grid.
 */

import { retryPermissions } from "@app/bootstrap";
import { useNavStore } from "@state/navStore";
import { useProcessingStore } from "@state/processingStore";
import { useSearchStore } from "@state/searchStore";
import { useSettingsStore } from "@state/settingsStore";
import { useVisibleMedia } from "@state/useVisibleMedia";
import { Chip, EmptyState, toast } from "@ui/components";
import { StyleSheet } from "@ui/theme";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { DrainProgress } from "./DrainProgress";
import { GalleryGrid } from "./GalleryGrid";
import { GallerySelection } from "./GallerySelection";
import { GallerySkeleton } from "./GallerySkeleton";
import { PDF_MIME_TYPE } from "./gridSections";

/**
 * Denied state with an in-place recovery path: first action re-runs the
 * bootstrap permission request (boots the pipeline on grant, no restart);
 * once a re-request has been attempted the action falls back to the system
 * settings screen (OS suppresses repeat prompts after a hard denial).
 */
function PermissionDenied() {
	const [requested, setRequested] = useState(false);

	return (
		<EmptyState
			icon="image-off-outline"
			title="Photo access needed"
			message="Visara analyzes your photos privately on this device. Allow photo access to build your library."
			action={{
				label: requested ? "Open settings" : "Grant access",
				onPress: () => {
					if (requested) {
						void Linking.openSettings();
						return;
					}
					setRequested(true);
					retryPermissions();
				},
			}}
			testID="gallery-permission-denied"
		/>
	);
}

/** Empty library, with a hint while the first scan is still running. */
function EmptyLibrary() {
	const isProcessing = useProcessingStore((s) => s.isProcessing);

	return (
		<EmptyState
			icon="image-multiple-outline"
			title="No photos yet"
			message={
				isProcessing
					? "Your library is being scanned — photos will appear here shortly."
					: "Photos on this device will appear here once they're discovered."
			}
			testID="gallery-empty"
		/>
	);
}

export function GalleryPage() {
	const { media, ready } = useVisibleMedia();
	const searchMode = useNavStore((s) => s.searchMode);
	const documentMode = useNavStore((s) => s.documentMode);
	const permissionState = useSettingsStore((s) => s.permissionState);
	const searchStatus = useSearchStore((s) => s.status);
	const searchResults = useSearchStore((s) => s.results);

	// Search failures surface to the user (never console-only).
	useEffect(() => {
		if (searchMode && searchStatus === "error") {
			toast.error("Search failed. Edit your query to try again.");
		}
	}, [searchMode, searchStatus]);

	const documents = useMemo(
		() => media.filter((file) => file.mimeType === PDF_MIME_TYPE),
		[media],
	);

	const displayed = searchMode
		? searchResults
		: documentMode
			? documents
			: media;

	let body: ReactElement;
	if (searchMode) {
		if (searchStatus === "searching") {
			body = <GallerySkeleton />;
		} else if (searchStatus === "error") {
			body = (
				<EmptyState
					icon="information-outline"
					title="Search failed"
					message="Something went wrong while searching. Edit the query to retry."
					testID="gallery-search-error"
				/>
			);
		} else if (searchStatus === "idle") {
			body = (
				<EmptyState
					icon="magnify"
					title="Search your photos"
					message="Find photos by what's in them, text they contain, or their labels."
					testID="gallery-search-idle"
				/>
			);
		} else if (displayed.length === 0) {
			body = (
				<EmptyState
					icon="image-off-outline"
					title="No matches"
					message="No photos matched your search."
					testID="gallery-search-empty"
				/>
			);
		} else {
			body = <GalleryGrid items={displayed} />;
		}
	} else if (permissionState === "denied") {
		body = <PermissionDenied />;
	} else if (!ready) {
		body = <GallerySkeleton />;
	} else if (documentMode && displayed.length === 0) {
		body = (
			<EmptyState
				icon="file-document-outline"
				title="No documents"
				message="PDF documents in your library will appear here."
				testID="gallery-documents-empty"
			/>
		);
	} else if (displayed.length === 0) {
		body = <EmptyLibrary />;
	} else {
		body = <GalleryGrid items={displayed} />;
	}

	const showResultCount = searchMode && searchStatus === "done";
	const resultCountLabel = `${searchResults.length} ${
		searchResults.length === 1 ? "result" : "results"
	}`;

	return (
		<View style={styles.page} testID="gallery-page">
			{body}
			<View style={styles.topOverlay} pointerEvents="box-none">
				<DrainProgress />
				{showResultCount ? (
					<View>
						<Chip
							label={resultCountLabel}
							icon="magnify"
							testID="gallery-result-count"
						/>
					</View>
				) : null}
			</View>
			<GallerySelection items={displayed} />
		</View>
	);
}

const styles = StyleSheet.create((theme, rt) => ({
	page: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	topOverlay: {
		position: "absolute",
		top: rt.insets.top + theme.spacing.sm,
		left: theme.spacing.lg,
		right: theme.spacing.lg,
		alignItems: "center",
		gap: theme.spacing.sm,
	},
}));
