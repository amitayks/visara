import React, { useCallback, useMemo } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
  RefreshControl,
} from "react-native";
import type Document from "../../services/database/models/Document";
import { AnimatedDocumentCard } from "./AnimatedDocumentCard";

interface MasonryGridProps {
  documents: Document[];
  onDocumentPress: (document: Document) => void;
  refreshControl?: React.ReactElement<any>;
  isLoading?: boolean;
}

const { width: screenWidth } = Dimensions.get("window");

export function MasonryGrid({ 
  documents, 
  onDocumentPress, 
  refreshControl,
  isLoading = false,
}: MasonryGridProps) {
  
  // Split documents into two columns for masonry layout
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: Document[] = [];
    const right: Document[] = [];
    
    documents.forEach((doc, index) => {
      if (index % 2 === 0) {
        left.push(doc);
      } else {
        right.push(doc);
      }
    });
    
    return { leftColumn: left, rightColumn: right };
  }, [documents]);

  const renderColumn = useCallback((columnDocuments: Document[], columnIndex: number) => {
    return (
      <View style={styles.column}>
        {columnDocuments.map((document, index) => {
          const globalIndex = columnIndex === 0 ? index * 2 : index * 2 + 1;
          return (
            <AnimatedDocumentCard
              key={document.id}
              document={document}
              index={globalIndex}
              onPress={onDocumentPress}
            />
          );
        })}
      </View>
    );
  }, [onDocumentPress]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <View style={styles.masonryContainer}>
        {renderColumn(leftColumn, 0)}
        {renderColumn(rightColumn, 1)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100, // Extra padding for bottom search bar
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: 8, // 8px gap between columns
  },
  column: {
    flex: 1,
  },
});