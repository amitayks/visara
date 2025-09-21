import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useState, useMemo, useEffect } from "react";
import {
	ActivityIndicator,
	Keyboard,
	RefreshControl,
	View,
} from "react-native";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useDocumentStore } from "../../../stores/documentStore";
import { useSearchStore } from "../../../stores/searchStore";
import { DocumentCard } from "../DocumentCard";
import { EmptyState } from "../EmptyState";
import { SkeletonGrid } from "../SkeletonGrid";
import { showToast } from "../Toast";
import { createStyles } from "./DocumentGrid.style";
import { COLUMNS, ITEM_HEIGHT, ITEM_WIDTH } from "./documentGridConst";

export interface Document {
	id: string;
	imageUri: string;
	documentType?: string;
	vendor?: string;
	date?: Date;
	totalAmount?: number;
	metadata?: any;
	createdAt: Date;
	imageHash?: string;
	ocrText?: string;
	keywords?: string[];
	confidence?: number;
	processedAt?: Date;
	imageWidth?: number;
	imageHeight?: number;
	imageSize?: number;
	imageTakenDate?: Date;
}

interface DocumentGridProps {
	onDocumentPress: (doc: Document) => void;
	emptyStateComponent?: () => JSX.Element;
	refreshing?: boolean;
	onRefresh?: () => Promise<void>;
	handleStartBackgroundScan?: () => void;
}

export const DocumentGrid = memo(
	({ onDocumentPress, emptyStateComponent, refreshing: externalRefreshing, onRefresh, handleStartBackgroundScan }: DocumentGridProps) => {
		const { theme } = useTheme();
		const styles = useThemedStyles(createStyles);
		const [refreshing, setRefreshing] = useState(false);
		const isRefreshing = externalRefreshing !== undefined ? externalRefreshing : refreshing;

		const {
			getFilteredDocuments,
			loadDocuments,
			loadMoreDocuments,
			refreshDocuments,
			isLoading,
			hasExistingDocuments,
			isLoadingMore,
			hasMorePages,
			// Add these to trigger re-renders when store changes
			totalDocuments,
			cacheVersion,
		} = useDocumentStore();
		const { searchQuery, searchResults } = useSearchStore();

		// Filter documents based on search results
		const documents = useMemo(() => {
			if (searchQuery && searchResults.length > 0) {
				// Map search results back to documents
				const resultIds = new Set(searchResults.map((r) => r.id));
				const filteredDocs = getFilteredDocuments();
			return filteredDocs.filter((doc) => resultIds.has(doc.id));
			}
			const allDocs = getFilteredDocuments();
		console.log(`[DocumentGrid] No search, returning all: ${allDocs.length} items`);
		return allDocs;
		}, [getFilteredDocuments, searchQuery, searchResults, totalDocuments, cacheVersion]);

		// Debug: Log when component receives new data
		useEffect(() => {
			console.log(`[DocumentGrid] 🔄 Component re-render triggered:`);
			console.log(`  - totalDocuments: ${totalDocuments}`);
			console.log(`  - cacheVersion: ${cacheVersion}`);
			console.log(`  - documents.length: ${documents.length}`);
			console.log(`  - searchQuery: "${searchQuery}"`);
		}, [totalDocuments, cacheVersion, documents.length, searchQuery]);

		const handleRefresh = useCallback(async () => {
			setRefreshing(true);
			try {
				await refreshDocuments();
				showToast({
					type: "success",
					message: "Gallery refreshed successfully",
					// icon: "checkmark-circle",
				});
			} catch (error) {
				console.error("Refresh documents error:", error);
				showToast({
					type: "error",
					message: "Failed to refresh documents",
					// icon: "alert-circle",
				});
			} finally {
				setRefreshing(false);
			}
		}, [refreshDocuments]);

		const handleEndReached = useCallback(async () => {
			if (isLoadingMore || !hasMorePages) return;

			try {
				await loadMoreDocuments();
			} catch (error) {
				console.error("Load more error:", error);
				showToast({
					type: "error",
					message: "Failed to load more documents",
				});
			}
		}, [isLoadingMore, hasMorePages, loadMoreDocuments]);

		const renderDocument = useCallback(
			({ item: doc }: { item: Document }) => {
				return (
					<View style={styles.cardContainer}>
						<DocumentCard
							document={doc}
							onPress={() => onDocumentPress(doc)}
							width={ITEM_WIDTH}
							height={ITEM_HEIGHT}
						/>
					</View>
				);
			},
			[onDocumentPress, styles.cardContainer],
		);

		const keyExtractor = useCallback((item: Document) => item.id, []);

		const ListEmptyComponent = useCallback(() => {
			if (searchQuery.length > 0) {
				return (
					<View style={styles.emptyListContainer}>
						<EmptyState
							icon="search-outline"
							title="No results found"
							message={`No documents found for "${searchQuery}"`}
						/>
					</View>
				);
			}

			return (
				<View style={styles.emptyListContainer}>
					<EmptyState
						icon="folder-open-outline"
						title="No documents yet"
						message="Tap the scan button to find documents in your gallery"
						action={{
							label: "Start Scanning",
							onPress: handleStartBackgroundScan || (() => {}),
						}}
					/>
				</View>
			);
		}, [searchQuery, handleStartBackgroundScan, styles.emptyListContainer]);

		const ListFooterComponent = useCallback(() => {
			if (!isLoadingMore || !hasMorePages) return null;

			return (
				<View style={styles.loadingFooter}>
					<ActivityIndicator size="small" color={theme.accent} />
				</View>
			);
		}, [isLoadingMore, hasMorePages, styles.loadingFooter, theme.accent]);

		// Show skeleton grid when loading and there are existing documents
		// This prevents showing the "start scanning" button when documents exist but are loading
		if (isLoading && hasExistingDocuments) {
			return <SkeletonGrid count={12} />;
		}

		// Debug: Log data being passed to FlashList
		console.log(`[DocumentGrid] 📱 FlashList receiving data: ${documents.length} items`);
		console.log(`[DocumentGrid] 📱 First 3 document IDs:`, documents.slice(0, 3).map(d => d.id));

		return (
			<FlashList
				data={documents}
				renderItem={renderDocument}
				keyExtractor={keyExtractor}
				numColumns={COLUMNS}
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						colors={[theme.accent]}
						tintColor={theme.accent}
					/>
				}
				estimatedItemSize={100}
				// Styling
				contentContainerStyle={{
					paddingBottom: 100,
					// paddingRight: 12,
				}}
				showsVerticalScrollIndicator={false}
				// Keyboard handling
				keyboardShouldPersistTaps="handled"
				onScrollBeginDrag={() => Keyboard.dismiss()}
				// Empty state
				ListEmptyComponent={ListEmptyComponent}
				// Footer (loading indicator)
				ListFooterComponent={ListFooterComponent}
			/>
		);
	},
);

DocumentGrid.displayName = "FlashDocumentGrid";
