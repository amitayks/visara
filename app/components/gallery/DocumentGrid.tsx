import React, { memo, useCallback, useEffect, useState } from "react";
import {
	Dimensions,
	Image,
	RefreshControl,
	ScrollView,
	StyleSheet,
	Text,
	View,
	ViewStyle,
} from "react-native";
import { DocumentCard } from "./DocumentCard";
import { SkeletonGrid } from "./SkeletonGrid";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMNS = 2;
const SPACING = 15;
const CONTAINER_PADDING = 16;
const ITEM_WIDTH = (SCREEN_WIDTH - CONTAINER_PADDING * 2 - SPACING) / COLUMNS;

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
	documents: Document[];
	refreshing: boolean;
	onRefresh: () => void;
	onDocumentPress: (doc: Document) => void;
	ListEmptyComponent?: React.ReactElement;
	contentContainerStyle?: ViewStyle;
}

export const DocumentGrid = memo(
	({
		documents,
		refreshing,
		onRefresh,
		onDocumentPress,
		ListEmptyComponent,
		contentContainerStyle,
	}: DocumentGridProps) => {
		const [imageHeights, setImageHeights] = useState<{ [key: string]: number }>(
			{},
		);
		const [loading, setLoading] = useState(true);

		// Calculate image heights for Pinterest layout
		useEffect(() => {
			if (!documents.length) {
				setLoading(false);
				return;
			}

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
								setLoading(false);
							}
						},
						(error) => {
							// Fallback to default height
							heights[doc.id] = ITEM_WIDTH * 1.4;
							loadedCount++;
							if (loadedCount === documents.length) {
								setImageHeights(heights);
								setLoading(false);
							}
						},
					);
				});
			};

			calculateHeights();
		}, [documents]);

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

		if (loading || (!documents && !refreshing)) {
			return <SkeletonGrid columns={COLUMNS} count={6} />;
		}

		const EmptyComponent = ListEmptyComponent || (
			<View style={styles.emptyContainer}>
				<Text style={styles.emptyTitle}>No documents yet</Text>
				<Text style={styles.emptySubtitle}>
					Your scanned documents will appear here
				</Text>
			</View>
		);

		if (documents.length === 0) {
			return (
				<ScrollView
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							colors={["#6366F1"]}
							tintColor="#6366F1"
						/>
					}
					contentContainerStyle={[
						styles.container,
						styles.emptyListContainer,
						contentContainerStyle,
					]}
				>
					{EmptyComponent}
				</ScrollView>
			);
		}

		const { leftColumn, rightColumn } = createMasonryLayout();

		return (
			<ScrollView
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						colors={["#6366F1"]}
						tintColor="#6366F1"
					/>
				}
				contentContainerStyle={[styles.container, contentContainerStyle]}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.masonryContainer}>
					{renderColumn(leftColumn, true)}
					{renderColumn(rightColumn, false)}
				</View>
			</ScrollView>
		);
	},
);

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: CONTAINER_PADDING,
		paddingTop: 16,
	},
	emptyListContainer: {
		flex: 1,
		justifyContent: "center",
	},
	masonryContainer: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	column: {
		flex: 1,
	},
	leftColumn: {
		marginRight: SPACING / 2,
	},
	rightColumn: {
		marginLeft: SPACING / 2,
	},
	cardContainer: {
		marginBottom: SPACING,
	},
	emptyContainer: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 60,
	},
	emptyTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#333",
		marginBottom: 8,
	},
	emptySubtitle: {
		fontSize: 14,
		color: "#999",
		textAlign: "center",
	},
});
