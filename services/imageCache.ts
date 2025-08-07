import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

interface CacheItem {
  uri: string;
  cachedPath?: string;
  timestamp: number;
  size?: number;
}

export class ImageCache {
  private cache = new Map<string, CacheItem>();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
  private cacheDir: string;

  constructor() {
    this.cacheDir = `${RNFS.CachesDirectoryPath}/images`;
    this.initializeCache();
  }

  private async initializeCache() {
    try {
      // Ensure cache directory exists
      const exists = await RNFS.exists(this.cacheDir);
      if (!exists) {
        await RNFS.mkdir(this.cacheDir);
      }
      
      // Clean up old cache entries on startup
      this.cleanupExpiredCache();
    } catch (error) {
      console.error('Failed to initialize image cache:', error);
    }
  }

  /**
   * Get cached image URI or return original if caching fails
   */
  async getCachedImageUri(originalUri: string): Promise<string> {
    try {
      // For file:// URIs, return as-is (already local)
      if (originalUri.startsWith('file://')) {
        return originalUri;
      }

      // For content:// URIs, check if we have a cached version
      if (originalUri.startsWith('content://')) {
        const cacheKey = this.generateCacheKey(originalUri);
        const cached = this.cache.get(cacheKey);

        if (cached && cached.cachedPath) {
          // Check if cached file still exists and is not expired
          const exists = await RNFS.exists(cached.cachedPath);
          const isExpired = Date.now() - cached.timestamp > this.CACHE_DURATION;

          if (exists && !isExpired) {
            return `file://${cached.cachedPath}`;
          } else {
            // Remove expired or missing cache entry
            this.cache.delete(cacheKey);
            if (exists) {
              await RNFS.unlink(cached.cachedPath);
            }
          }
        }

        // Try to cache the content URI for faster access
        return await this.cacheContentUri(originalUri, cacheKey);
      }

      // For other URIs, return as-is
      return originalUri;
    } catch (error) {
      console.error('Error getting cached image URI:', error);
      return originalUri; // Fallback to original URI
    }
  }

  /**
   * Cache a content:// URI by copying to app cache directory
   */
  private async cacheContentUri(contentUri: string, cacheKey: string): Promise<string> {
    try {
      const cachedPath = `${this.cacheDir}/${cacheKey}.jpg`;
      
      // Try to copy the content URI to cache directory
      // This might not work on all Android versions, so we handle errors gracefully
      try {
        await RNFS.copyFile(contentUri, cachedPath);
        
        // Get file size for cache management
        const stat = await RNFS.stat(cachedPath);
        
        // Store in cache
        this.cache.set(cacheKey, {
          uri: contentUri,
          cachedPath,
          timestamp: Date.now(),
          size: stat.size,
        });

        console.log(`Cached content URI: ${contentUri} -> ${cachedPath}`);
        return `file://${cachedPath}`;
      } catch (copyError) {
        // If copying fails, just return the original content URI
        console.log('Content URI caching failed, using original URI:', copyError);
        
        // Store in cache without cached path (for tracking)
        this.cache.set(cacheKey, {
          uri: contentUri,
          timestamp: Date.now(),
        });
        
        return contentUri;
      }
    } catch (error) {
      console.error('Error caching content URI:', error);
      return contentUri;
    }
  }

  /**
   * Generate a unique cache key for a URI
   */
  private generateCacheKey(uri: string): string {
    // Create a simple hash from the URI
    let hash = 0;
    for (let i = 0; i < uri.length; i++) {
      const char = uri.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clean up expired cache entries
   */
  private async cleanupExpiredCache() {
    try {
      const now = Date.now();
      const keysToDelete: string[] = [];
      let totalSize = 0;

      // Check for expired entries and calculate total size
      for (const [key, item] of this.cache.entries()) {
        const isExpired = now - item.timestamp > this.CACHE_DURATION;
        
        if (isExpired) {
          keysToDelete.push(key);
        } else if (item.size) {
          totalSize += item.size;
        }
      }

      // Remove expired entries
      for (const key of keysToDelete) {
        await this.removeCacheEntry(key);
      }

      // If cache is too large, remove oldest entries
      if (totalSize > this.MAX_CACHE_SIZE) {
        await this.trimCache();
      }

      console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`);
    } catch (error) {
      console.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Remove a specific cache entry
   */
  private async removeCacheEntry(key: string) {
    try {
      const item = this.cache.get(key);
      if (item && item.cachedPath) {
        const exists = await RNFS.exists(item.cachedPath);
        if (exists) {
          await RNFS.unlink(item.cachedPath);
        }
      }
      this.cache.delete(key);
    } catch (error) {
      console.error('Error removing cache entry:', error);
    }
  }

  /**
   * Trim cache to stay under size limit
   */
  private async trimCache() {
    try {
      // Sort entries by timestamp (oldest first)
      const entries = Array.from(this.cache.entries())
        .filter(([_, item]) => item.cachedPath && item.size)
        .sort(([_, a], [__, b]) => a.timestamp - b.timestamp);

      let currentSize = entries.reduce((total, [_, item]) => total + (item.size || 0), 0);
      
      // Remove oldest entries until we're under the limit
      for (const [key, item] of entries) {
        if (currentSize <= this.MAX_CACHE_SIZE * 0.8) { // Target 80% of max size
          break;
        }
        
        await this.removeCacheEntry(key);
        currentSize -= (item.size || 0);
      }

      console.log(`Cache trimmed, new size: ${(currentSize / 1024 / 1024).toFixed(2)}MB`);
    } catch (error) {
      console.error('Error trimming cache:', error);
    }
  }

  /**
   * Clear all cached images
   */
  async clearCache() {
    try {
      // Remove all cached files
      for (const [key] of this.cache.entries()) {
        await this.removeCacheEntry(key);
      }
      
      // Clear cache directory
      const exists = await RNFS.exists(this.cacheDir);
      if (exists) {
        await RNFS.unlink(this.cacheDir);
        await RNFS.mkdir(this.cacheDir);
      }
      
      console.log('Image cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let totalSize = 0;
    let cachedFiles = 0;
    
    for (const item of this.cache.values()) {
      if (item.cachedPath && item.size) {
        totalSize += item.size;
        cachedFiles++;
      }
    }

    return {
      totalEntries: this.cache.size,
      cachedFiles,
      totalSize,
      totalSizeMB: totalSize / 1024 / 1024,
    };
  }
}

export const imageCache = new ImageCache();