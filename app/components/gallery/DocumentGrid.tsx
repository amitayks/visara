import React, { memo, useCallback } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  Dimensions,
  RefreshControl,
  Text,
  ViewStyle,
} from 'react-native';
import { DocumentCard } from './DocumentCard';
import { SkeletonGrid } from './SkeletonGrid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMNS = 2;
const SPACING = 8;
const CONTAINER_PADDING = 16;
const ITEM_WIDTH = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - SPACING) / COLUMNS;

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

export const DocumentGrid = memo(({
  documents,
  refreshing,
  onRefresh,
  onDocumentPress,
  ListEmptyComponent,
  contentContainerStyle
}: DocumentGridProps) => {
  const renderItem = useCallback(({ item, index }: { item: Document; index: number }) => {
    const isLeft = index % 2 === 0;
    
    return (
      <DocumentCard
        document={item}
        onPress={() => onDocumentPress(item)}
        style={{
          ...styles.item,
          ...(isLeft ? styles.leftItem : styles.rightItem)
        }}
        width={ITEM_WIDTH}
      />
    );
  }, [onDocumentPress]);
  
  const keyExtractor = useCallback((item: Document) => item.id, []);
  
  const ItemSeparator = () => <View style={{ height: SPACING }} />;
  
  if (!documents && !refreshing) {
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
  
  return (
    <FlatList
      data={documents}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#6366F1']}
          tintColor="#6366F1"
        />
      }
      contentContainerStyle={[
        styles.container,
        contentContainerStyle,
        documents.length === 0 && styles.emptyListContainer
      ]}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
      ListEmptyComponent={EmptyComponent}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingTop: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  item: {
    width: ITEM_WIDTH,
  },
  leftItem: {
    marginRight: SPACING / 2,
  },
  rightItem: {
    marginLeft: SPACING / 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});