# React Native Pinterest Layout - Package-Based Implementation Guide

## 🎯 Best Packages Found for Pinterest-Style Layouts

After researching the current React Native ecosystem, here are the **top packages** that handle Pinterest-style masonry layouts with different image heights and virtualization:

### 🏆 **Option 1: FlashList v2 (RECOMMENDED)**
**Best overall solution - Modern, performant, and maintained by Shopify**

```bash
npm install @shopify/flash-list
```

**Why FlashList v2 is the best choice:**
- ✅ **Native masonry support** with `masonry` prop
- ✅ **Automatic virtualization** - no size estimates needed
- ✅ **Infinite scroll** built-in with `onEndReached`
- ✅ **60 FPS performance** even on low-end Android devices
- ✅ **JS-only solution** in v2 (no native dependencies)
- ✅ **Active maintenance** by Shopify (2M+ monthly downloads)
- ✅ **Drop-in FlatList replacement**
- ✅ **Different column spans** support via `overrideItemLayout`

## 🚀 Implementation with FlashList v2 (Recommended)

### Step 1: Install FlashList

```bash
npm install @shopify/flash-list
```

### Step 2: Replace Your DocumentGrid

**File: `app/components/DocumentGrid/FlashDocumentGrid.tsx`**

```typescript
import React, { memo, useCallback, useEffect, useState } from "react";
import {
  Image,
  Keyboard,
  RefreshControl,
  View,
  ViewStyle,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useTheme, useThemedStyles } from "../../../contexts/ThemeContext";
import { useDocumentStore } from "../../../stores/documentStore";
import { useSearchStore } from "../../../stores/searchStore";
import { DocumentCard } from "../DocumentCard";
import { EmptyState } from "../EmptyState";
import { showToast } from "../Toast";
import { createStyles } from "./DocumentGrid.style";
import { ITEM_WIDTH } from "./documentGridConst";
import type { Document } from "./DocumentGrid";

interface DocumentGridProps {
  onDocumentPress: (doc: Document) => void;
  handleStartBackgroundScan: () => void;
  contentContainerStyle?: ViewStyle;
}

export const FlashDocumentGrid = memo(
  ({
    onDocumentPress,
    handleStartBackgroundScan,
    contentContainerStyle,
  }: DocumentGridProps) => {
    const { theme } = useTheme();
    const styles = useThemedStyles(createStyles);
    const [imageHeights, setImageHeights] = useState<{ [key: string]: number }>({});
    const [refreshing, setRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    const { filteredDocuments, loadDocuments } = useDocumentStore();
    const { searchQuery, queryChips } = useSearchStore();

    const documents = filteredDocuments;

    // Calculate image height lazily when needed
    const getImageHeight = useCallback((doc: Document): number => {
      if (imageHeights[doc.id]) {
        return imageHeights[doc.id];
      }

      // Start async calculation
      Image.getSize(
        doc.imageUri,
        (width, height) => {
          const aspectRatio = height / width;
          const calculatedHeight = ITEM_WIDTH * aspectRatio;
          const minHeight = ITEM_WIDTH * 0.8;
          const maxHeight = ITEM_WIDTH * 2.5;
          const finalHeight = Math.min(
            Math.max(calculatedHeight, minHeight),
            maxHeight
          );
          
          setImageHeights(prev => ({
            ...prev,
            [doc.id]: finalHeight
          }));
        },
        () => {
          // Fallback height
          setImageHeights(prev => ({
            ...prev,
            [doc.id]: ITEM_WIDTH * 1.4
          }));
        }
      );

      // Return default height while calculating
      return ITEM_WIDTH * 1.4;
    }, [imageHeights]);

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

    const handleEndReached = useCallback(async () => {
      if (isLoadingMore) return;
      
      setIsLoadingMore(true);
      try {
        // Load more documents from your store
        // This depends on your pagination implementation
        // await loadMoreDocuments();
      } catch (error) {
        console.error("Load more error:", error);
      } finally {
        setIsLoadingMore(false);
      }
    }, [isLoadingMore]);

    const renderDocument = useCallback(({ item: doc }: { item: Document }) => {
      const height = getImageHeight(doc);
      
      return (
        <View style={styles.cardContainer}>
          <DocumentCard
            document={doc}
            onPress={() => onDocumentPress(doc)}
            width={ITEM_WIDTH}
            height={height}
          />
        </View>
      );
    }, [onDocumentPress, getImageHeight, styles.cardContainer]);

    const keyExtractor = useCallback((item: Document) => item.id, []);

    const ListEmptyComponent = useCallback(() => {
      if (queryChips.length > 0) {
        return (
          <EmptyState
            icon="search-outline"
            title="No results found"
            message={`No documents found for "${queryChips[0]?.text || searchQuery}"`}
          />
        );
      }
      
      return (
        <EmptyState
          icon="folder-open-outline"
          title="No documents yet"
          message="Tap the scan button to find documents in your gallery"
          action={{
            label: "Start Scanning",
            onPress: handleStartBackgroundScan,
          }}
        />
      );
    }, [queryChips, searchQuery, handleStartBackgroundScan]);

    return (
      <FlashList
        data={documents}
        renderItem={renderDocument}
        keyExtractor={keyExtractor}
        
        // Masonry Layout Configuration
        masonry={true}
        numColumns={2}
        
        // Performance Optimizations
        estimatedItemSize={ITEM_WIDTH * 1.4} // Optional: helps with initial render
        
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
        
        // Styling
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        
        // Keyboard handling
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        
        // Empty state
        ListEmptyComponent={ListEmptyComponent}
        
        // Footer (loading indicator)
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingFooter}>
              {/* Add your loading indicator here */}
            </View>
          ) : null
        }
      />
    );
  }
);

FlashDocumentGrid.displayName = "FlashDocumentGrid";
```

### Step 3: Update Styles

**File: `app/components/DocumentGrid/DocumentGrid.style.ts`**

```typescript
import { StyleSheet } from "react-native";
import { CONTAINER_PADDING, ITEM_WIDTH, SPACING } from "./documentGridConst";

export const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      padding: CONTAINER_PADDING,
    },
    cardContainer: {
      marginBottom: SPACING,
      marginHorizontal: SPACING / 4, // Small horizontal spacing
    },
    loadingFooter: {
      paddingVertical: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyListContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 20,
    },
  });
```

### Step 4: Update Constants for FlashList

**File: `app/components/DocumentGrid/documentGridConst.ts`**

```typescript
import { SCREEN_WIDTH } from "../../../constants/dimensions";

export const COLUMNS = 2;
export const SPACING = 12; // Reduced spacing for masonry
export const CONTAINER_PADDING = 16;
export const ITEM_WIDTH = (SCREEN_WIDTH - CONTAINER_PADDING * 2 - SPACING * 3) / COLUMNS;
```

### Step 5: Enhanced Document Store (Optional)

If you want pagination in your store:

**File: `stores/documentStore.ts`**

```typescript
// Add these to your existing store
interface DocumentStore {
  // ... existing properties
  currentPage: number;
  hasMoreData: boolean;
  isLoadingMore: boolean;
  
  // ... existing methods
  loadMoreDocuments: () => Promise<void>;
  resetPagination: () => void;
}

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  // ... existing state
  currentPage: 1,
  hasMoreData: true,
  isLoadingMore: false,

  loadMoreDocuments: async () => {
    const { currentPage, hasMoreData, isLoadingMore } = get();
    
    if (!hasMoreData || isLoadingMore) return;
    
    set({ isLoadingMore: true });
    
    try {
      // Load next page from your API/database
      const nextPage = currentPage + 1;
      const newDocs = await documentStorage.getDocuments(nextPage, 20);
      
      if (newDocs.length === 0) {
        set({ hasMoreData: false });
        return;
      }
      
      set(state => ({
        filteredDocuments: [...state.filteredDocuments, ...newDocs],
        currentPage: nextPage,
        isLoadingMore: false,
      }));
    } catch (error) {
      console.error("Load more documents error:", error);
      set({ isLoadingMore: false });
    }
  },

  resetPagination: () => {
    set({
      currentPage: 1,
      hasMoreData: true,
      isLoadingMore: false,
    });
  },

  // ... rest of existing methods
}));
```

### Step 6: Update Main App

**File: `app/index.tsx`**

```typescript
// Replace DocumentGrid import
import { FlashDocumentGrid } from "./components/DocumentGrid/FlashDocumentGrid";

// In your render method
<FlashDocumentGrid
  onDocumentPress={handleDocumentPress}
  handleStartBackgroundScan={handleStartBackgroundScan}
  contentContainerStyle={{
    paddingBottom: 100,
  }}
/>
```