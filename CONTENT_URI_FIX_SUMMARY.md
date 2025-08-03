# Content URI Fetch Error Fix Summary

## Problem
The app crashed with the error:
```
ERROR [BackgroundScanner Error] RangeError: Failed to construct 'Response': The status provided (0) is outside the range [200, 599].
```

This occurred because the `fetch()` API cannot handle Android `content://` URIs, which return status code 0.

## Root Cause
The `copyContentUriChunked` method in `imageStorage.ts` was using `fetch()` to read content URIs, which is not supported for Android's content provider URIs.

## Fix Applied

### 1. Updated Image Storage Service (services/imageStorage.ts)
- Removed the `copyContentUriChunked` method that used `fetch()`
- Removed the `blobToBase64` helper method
- Updated `copyImageToPermanentStorage` to use RNFS's native methods:
  - First attempt: Direct base64 read with `RNFS.readFile()`
  - Fallback: Copy via temporary file using `RNFS.copyFile()`
- Added proper cleanup of temporary files

### 2. Updated Thumbnail Service (services/thumbnailService.ts)
- Modified `calculateImageHash` to handle content URIs specially
- For content URIs, generate unique hash based on URI + timestamp + random
- This avoids reading the content URI for hash calculation
- Added fallback for file URIs that can't be read

### 3. Enhanced Gallery Scanner Error Handling (services/gallery/GalleryScanner.ts)
- Added specific error detection for content URI errors
- Skip images with content URI errors instead of crashing
- Track failed images for potential retry
- Added try-catch around document saving
- Better error messages and logging

## How It Works Now

1. **Content URI Processing**:
   ```
   content:// URI → RNFS.readFile() as base64 → Write to permanent storage
   ```

2. **Fallback for Large Files**:
   ```
   content:// URI → Copy to temp file → Copy to permanent → Delete temp
   ```

3. **Hash Generation**:
   - Content URIs: Use URI + timestamp for unique hash
   - File URIs: Try to read content, fallback to URI-based hash

## Benefits

1. **No More Fetch Errors**: Content URIs are handled natively by RNFS
2. **Better Performance**: Direct file operations instead of HTTP-like fetch
3. **Graceful Degradation**: Multiple fallback strategies
4. **No Data Loss**: Failed images are tracked for retry

## Testing

Test with various image sources:
1. Camera photos (file:// URIs)
2. Downloaded images (content:// URIs)
3. Screenshots (mixed URIs)
4. Large images (>10MB)

The app should process all images without crashing, skipping only those that truly can't be accessed.