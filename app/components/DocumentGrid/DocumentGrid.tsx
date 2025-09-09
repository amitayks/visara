import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useState } from "react";
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
import { showToast } from "../Toast";
import { createStyles } from "./DocumentGrid.style";
import { ITEM_WIDTH } from "./documentGridConst";

export interface Document {
	id: string;
	imageUri: string;
	documentType?: string;
	vendor?: string;
	date?: Date;
	totalAmount?: number;
	metadata?: any;
	createdAt: Date;
}

interface DocumentGridProps {
	onDocumentPress: (doc: Document) => void;
	handleStartBackgroundScan: () => void;
}

export const DocumentGrid = memo(
	({ onDocumentPress, handleStartBackgroundScan }: DocumentGridProps) => {
		const { theme } = useTheme();
		const styles = useThemedStyles(createStyles);
		const [refreshing, setRefreshing] = useState(false);
		const [isLoadingMore, setIsLoadingMore] = useState(false);

		const { filteredDocuments, loadDocuments } = useDocumentStore();
		const { searchQuery, queryChips } = useSearchStore();

		const documents = filteredDocuments;

		const handleRefresh = useCallback(async () => {
			setRefreshing(true);
			try {
				await loadDocuments();
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
		}, [loadDocuments]);

		const handleEndReached = useCallback(async () => {
			if (isLoadingMore) return;

			setIsLoadingMore(true);
			try {
				// For now, we'll keep this simple
				// Future enhancement: implement actual pagination
				console.log("Load more documents - feature for future enhancement");
			} catch (error) {
				console.error("Load more error:", error);
			} finally {
				setIsLoadingMore(false);
			}
		}, [isLoadingMore]);

		const renderDocument = useCallback(
			({ item: doc }: { item: Document }) => {
				const height = 300;

				return (
					<View style={[styles.cardContainer]}>
						<DocumentCard
							document={doc}
							onPress={() => onDocumentPress(doc)}
							width={ITEM_WIDTH}
							height={height}
						/>
					</View>
				);
			},
			[onDocumentPress, styles.cardContainer],
		);

		const keyExtractor = useCallback((item: Document) => item.id, []);

		const ListEmptyComponent = useCallback(() => {
			if (queryChips.length > 0) {
				return (
					<View style={styles.emptyListContainer}>
						<EmptyState
							icon="search-outline"
							title="No results found"
							message={`No documents found for "${queryChips[0]?.text || searchQuery}"`}
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
							onPress: handleStartBackgroundScan,
						}}
					/>
				</View>
			);
		}, [
			queryChips,
			searchQuery,
			handleStartBackgroundScan,
			styles.emptyListContainer,
		]);

		const ListFooterComponent = useCallback(() => {
			if (!isLoadingMore) return null;

			return (
				<View style={styles.loadingFooter}>
					<ActivityIndicator size="small" color={theme.accent} />
				</View>
			);
		}, [isLoadingMore, styles.loadingFooter, theme.accent]);

		return (
			<FlashList
				data={documents}
				renderItem={renderDocument}
				keyExtractor={keyExtractor}
				// Use numColumns for basic multi-column layout
				// FlashList v1 doesn't have masonry prop, but performs well with dynamic heights
				numColumns={2}
				// Infinite Scroll
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				// Pull to Refresh
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
