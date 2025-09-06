import React, { memo, useCallback, useEffect, useState } from "react";
import {
	Image,
	Keyboard,
	RefreshControl,
	ScrollView,
	View,
	ViewStyle,
} from "react-native";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useDocumentStore } from "../../../stores/documentStore";
import { useSearchStore } from "../../../stores/searchStore";
import { DocumentCard } from "../DocumentCard";
import { EmptyState } from "../EmptyState";
import { showToast } from "../Toast";
import { createStyles } from "./DocumentGrid.style";
import { ITEM_WIDTH, SPACING } from "./documentGridConst";

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
	ListEmptyComponent?: React.ReactElement;
	contentContainerStyle?: ViewStyle;
}

export const DocumentGrid = memo(
	({
		onDocumentPress,
		handleStartBackgroundScan,
		contentContainerStyle,
	}: DocumentGridProps) => {
		const { theme } = useTheme();
		const styles = useThemedStyles(createStyles);
		const [imageHeights, setImageHeights] = useState<{ [key: string]: number }>(
			{},
		);
		const [refreshing, setRefreshing] = useState(false);
		const { filteredDocuments, loadDocuments } = useDocumentStore();
		const { searchQuery, queryChips } = useSearchStore();

		const documents = filteredDocuments;

		useEffect(() => {
			const calculateHeights = async () => {
				const heights: { [key: string]: number } = {};
				let loadedCount = 0;

				documents.forEach((doc) => {
					Image.getSize(
						doc.imageUri,
						(width, height) => {
							const aspectRatio = height / width;
							const calculatedHeight = ITEM_WIDTH * aspectRatio;
							// Limit height to reasonable bounds for Pinterest-style layout
							const minHeight = ITEM_WIDTH * 0.8;
							const maxHeight = ITEM_WIDTH * 2.5;
							heights[doc.id] = Math.min(
								Math.max(calculatedHeight, minHeight),
								maxHeight,
							);

							loadedCount++;
							if (loadedCount === documents.length) {
								setImageHeights(heights);
							}
						},
						(error) => {
							// Fallback to default height
							heights[doc.id] = ITEM_WIDTH * 1.4;
							loadedCount++;
							if (loadedCount === documents.length) {
								setImageHeights(heights);
							}
						},
					);
				});
			};

			calculateHeights();
		}, [documents]);

		const handleRefresh = useCallback(async () => {
			setRefreshing(true);
			try {
				await loadDocuments();
				showToast({
					type: "success",
					message: "Gallery refreshed successfully",
					icon: "checkmark-circle",
				});
			} catch (error) {
				console.error("Refresh documents error:", error);
				showToast({
					type: "error",
					message: "Failed to refresh documents",
					icon: "alert-circle",
				});
			} finally {
				setRefreshing(false);
			}
		}, [loadDocuments]);

		// Create masonry layout
		const createMasonryLayout = useCallback(() => {
			const leftColumn: Document[] = [];
			const rightColumn: Document[] = [];
			let leftColumnHeight = 0;
			let rightColumnHeight = 0;

			documents.forEach((doc) => {
				const itemHeight = imageHeights[doc.id] || ITEM_WIDTH * 1.4;

				if (leftColumnHeight <= rightColumnHeight) {
					leftColumn.push(doc);
					leftColumnHeight += itemHeight + SPACING;
				} else {
					rightColumn.push(doc);
					rightColumnHeight += itemHeight + SPACING;
				}
			});

			return { leftColumn, rightColumn };
		}, [documents, imageHeights]);

		const renderColumn = useCallback(
			(columnDocs: Document[], isLeft: boolean) => (
				<View
					style={[
						styles.column,
						isLeft ? styles.leftColumn : styles.rightColumn,
					]}
				>
					{columnDocs.map((doc) => (
						<View key={doc.id} style={styles.cardContainer}>
							<DocumentCard
								document={doc}
								onPress={() => onDocumentPress(doc)}
								width={ITEM_WIDTH}
								height={imageHeights[doc.id]}
							/>
						</View>
					))}
				</View>
			),
			[onDocumentPress, imageHeights],
		);

		if (!documents.length) {
			return (
				<ScrollView
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={handleRefresh}
							colors={[theme.accent]}
							tintColor={theme.accent}
						/>
					}
					contentContainerStyle={[
						styles.container,
						styles.emptyListContainer,
						contentContainerStyle,
					]}
					keyboardShouldPersistTaps="handled"
					onScrollBeginDrag={() => Keyboard.dismiss()}
				>
					{queryChips.length > 0 ? (
						<EmptyState
							icon="search-outline"
							title="No results found"
							message={`No documents found for "${queryChips[0]?.text || searchQuery}"`}
						/>
					) : (
						<EmptyState
							icon="folder-open-outline"
							title="No documents yet"
							message="Tap the scan button to find documents in your gallery"
							action={{
								label: "Start Scanning",
								onPress: handleStartBackgroundScan,
							}}
						/>
					)}
				</ScrollView>
			);
		}

		const { leftColumn, rightColumn } = createMasonryLayout();

		return (
			<ScrollView
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={handleRefresh}
						colors={[theme.accent]}
						tintColor={theme.accent}
					/>
				}
				contentContainerStyle={[styles.container, contentContainerStyle]}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				onScrollBeginDrag={() => Keyboard.dismiss()}
			>
				<View style={styles.masonryContainer}>
					{renderColumn(leftColumn, true)}
					{renderColumn(rightColumn, false)}
				</View>
			</ScrollView>
		);
	},
);
