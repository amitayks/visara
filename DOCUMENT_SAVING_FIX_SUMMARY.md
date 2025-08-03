# Document Saving and Processing Timeout Fix Summary

## Problem
Documents were not appearing in the app despite being processed. The issue was caused by:
1. Inconsistent hash calculation between GalleryScanner and documentProcessor
2. Processing timeouts causing the app to freeze
3. Lack of proper error handling and logging

## Root Causes
1. **Hash Mismatch**: GalleryScanner was calculating hash based on asset properties, while documentProcessor was calculating hash from actual file content
2. **Timeout Handling**: Processing timeouts were not properly handled, causing crashes
3. **Error Propagation**: Errors in processing were not properly logged or handled

## Fixes Applied

### 1. GalleryScanner Hash Generation (services/gallery/GalleryScanner.ts)
- Changed hash generation to create a unique ID that won't match anything
- Moved duplicate detection to AFTER processing, using the actual image hash from the result
- Added better timeout handling that catches timeout errors specifically
- Enhanced logging to track document saving

Key changes:
```typescript
// Don't pre-calculate hash - let documentProcessor do it
const uniqueId = `${assetInfo.id}-${assetInfo.creationTime}-${Math.random()}`;

// After processing, check duplicate using result.imageHash
const existingDoc = await documentStorage.checkDuplicateByHash(result.imageHash);
```

### 2. DocumentProcessor Logging (services/ai/documentProcessor.ts)
- Added detailed logging of URIs being saved
- Added processing time logging
- Changed error handling to throw errors instead of returning failed documents
- Ensures permanent URIs are logged clearly

Key changes:
- Logs original URI, permanent URI, and thumbnail URI
- Shows processing time and confidence level
- Throws errors instead of silently failing

### 3. Background Scanner Error Isolation (services/gallery/backgroundScanner.ts)
- Added global error handler to prevent crashes
- Wrapped performBackgroundScan in try-catch
- Added finally block to ensure cleanup
- Better error logging and notification updates

Key changes:
- Scan failures don't crash the background task
- State is properly cleaned up even on crashes
- Errors are logged but don't stop the service

### 4. Document Storage Logging (services/database/documentStorage.ts)
- Added logging when saving documents
- Logs document hash, type, and confidence
- Logs when duplicates are detected
- Logs successful saves with document ID

### 5. Documents Screen Debugging (app/(tabs)/documents.tsx)
- Added logging when loading documents
- Shows count of loaded documents
- Logs first few documents for debugging
- Added refresh logging

## How the Fix Works

1. **Processing Flow**:
   - GalleryScanner processes an image
   - DocumentProcessor calculates the actual image hash from file content
   - Document is saved with the correct hash
   - Duplicate detection uses the actual image hash

2. **Error Handling**:
   - Timeouts are caught and logged without crashing
   - Failed images are tracked for retry
   - Background task continues even if individual images fail

3. **Debugging**:
   - Comprehensive logging throughout the pipeline
   - Can track documents from processing to saving to display

## Testing Steps

1. Clear app data
2. Enable console logging
3. Start background scanner
4. Watch logs for:
   - `[GalleryScanner] Successfully saved document: {id} - {filename}`
   - `[DocumentStorage] Document saved successfully with ID: {id}`
   - `[Documents] Loaded {count} documents`
5. Pull to refresh on documents screen
6. Check that documents appear

## Expected Log Flow

```
[GalleryScanner] Processing: image.jpg...
Document processed successfully in 2500ms - Type: receipt, Confidence: 92.3%
Saving document with URIs:
    Original: content://media/external/images/media/12345
    Permanent: file:///data/user/0/com.visara/files/visara_documents/abc123.jpg
    Thumbnail: file:///data/user/0/com.visara/files/visara_thumbnails/abc123_thumb.jpg
[DocumentStorage] Saving document with hash: abc123...
[DocumentStorage] Document type: receipt, Confidence: 92.3%
[DocumentStorage] Creating new document in database
[DocumentStorage] Document saved successfully with ID: doc_123456789_abcdefg
[GalleryScanner] Successfully saved document: doc_123456789_abcdefg - image.jpg
[Documents] Loaded 15 documents
Document doc_123456789_abcdefg: receipt - file:///data/user/0/com.visara/files/visara_documents/abc123.jpg
```

## Troubleshooting

If documents still don't appear:
1. Check for `Document already exists with hash` messages
2. Look for processing timeouts
3. Verify permanent URIs are being created
4. Check for database write errors
5. Ensure confidence threshold (0.8) isn't too high

## Future Improvements

1. Implement retry queue for failed images
2. Add progress tracking for individual documents
3. Implement smarter duplicate detection
4. Add user notification for successfully processed documents
5. Consider lowering confidence threshold for testing