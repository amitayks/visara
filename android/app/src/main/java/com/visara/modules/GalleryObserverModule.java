// android/app/src/main/java/com/visara/modules/GalleryObserverModule.java
// Native Android module for real-time gallery observation

package com.visara.modules;

import android.Manifest;
import android.content.ContentResolver;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class GalleryObserverModule extends ReactContextBaseJavaModule {
    private static final String TAG = "GalleryObserver";
    private static final String MODULE_NAME = "GalleryObserver";
    
    private final ReactApplicationContext reactContext;
    private ContentObserver contentObserver;
    private final Set<String> processedImageIds = new HashSet<>();
    private boolean isObserving = false;
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();
    private long lastProcessedTime = 0;
    private static final long DEBOUNCE_DELAY = 500; // 500ms debounce

    public GalleryObserverModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void startObserving(Promise promise) {
        if (isObserving) {
            Log.d(TAG, "Already observing gallery");
            promise.resolve(true);
            return;
        }

        // Check permissions
        if (!hasGalleryPermission()) {
            promise.reject("permission_denied", "Gallery permission not granted");
            return;
        }

        try {
            startContentObserver();
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start observing", e);
            promise.reject("start_failed", "Failed to start gallery observer", e);
        }
    }

    @ReactMethod
    public void stopObserving() {
        if (isObserving && contentObserver != null) {
            reactContext.getContentResolver().unregisterContentObserver(contentObserver);
            contentObserver = null;
            isObserving = false;
            Log.d(TAG, "Stopped observing gallery");
        }
    }

    @ReactMethod
    public void getInitialImageCount(Promise promise) {
        executorService.execute(() -> {
            try {
                int count = getImageCount();
                promise.resolve(count);
            } catch (Exception e) {
                Log.e(TAG, "Failed to get image count", e);
                promise.reject("count_failed", "Failed to get image count", e);
            }
        });
    }

    @ReactMethod
    public void getImageBatch(int offset, int limit, Promise promise) {
        executorService.execute(() -> {
            try {
                WritableArray batch = getImageBatchInternal(offset, limit);
                promise.resolve(batch);
            } catch (Exception e) {
                Log.e(TAG, "Failed to get image batch", e);
                promise.reject("batch_failed", "Failed to get image batch", e);
            }
        });
    }

    @ReactMethod
    public void markAsProcessed(ReadableArray assetIds) {
        for (int i = 0; i < assetIds.size(); i++) {
            processedImageIds.add(assetIds.getString(i));
        }
        Log.d(TAG, "Marked " + assetIds.size() + " images as processed");
    }

    @ReactMethod
    public void clearProcessedTracking() {
        processedImageIds.clear();
        Log.d(TAG, "Cleared all processed tracking");
    }

    private void startContentObserver() {
        contentObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
            @Override
            public void onChange(boolean selfChange, Uri uri) {
                super.onChange(selfChange, uri);
                
                // Debounce rapid changes
                long currentTime = System.currentTimeMillis();
                if (currentTime - lastProcessedTime < DEBOUNCE_DELAY) {
                    return;
                }
                lastProcessedTime = currentTime;
                
                // Process on background thread
                executorService.execute(() -> handleGalleryChange(uri));
            }
        };

        // Register observer for both internal and external storage
        ContentResolver resolver = reactContext.getContentResolver();
        resolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            true,
            contentObserver
        );
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            resolver.registerContentObserver(
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL),
                true,
                contentObserver
            );
        }

        isObserving = true;
        Log.d(TAG, "Started observing gallery changes");
    }

    private void handleGalleryChange(Uri changedUri) {
        try {
            // Query for recent images (last 10 added)
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DATE_MODIFIED,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT,
                MediaStore.Images.Media.SIZE
            };

            String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC LIMIT 10";
            
            Cursor cursor = reactContext.getContentResolver().query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            );

            WritableArray newImages = Arguments.createArray();

            if (cursor != null) {
                try {
                    int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                    int pathColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                    int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                    int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED);
                    int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                    int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);
                    int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);

                    while (cursor.moveToNext()) {
                        String imageId = cursor.getString(idColumn);
                        
                        // Skip if already processed
                        if (processedImageIds.contains(imageId)) {
                            continue;
                        }

                        String imagePath = cursor.getString(pathColumn);
                        long dateAdded = cursor.getLong(dateAddedColumn) * 1000; // Convert to milliseconds
                        
                        // Check if this is a new image (added in last 30 seconds)
                        if (System.currentTimeMillis() - dateAdded > 30000) {
                            continue;
                        }

                        WritableMap imageInfo = Arguments.createMap();
                        imageInfo.putString("uri", "file://" + imagePath);
                        imageInfo.putString("id", imageId);
                        imageInfo.putInt("width", cursor.getInt(widthColumn));
                        imageInfo.putInt("height", cursor.getInt(heightColumn));
                        imageInfo.putDouble("creationDate", dateAdded);
                        imageInfo.putDouble("modificationDate", cursor.getLong(dateModifiedColumn) * 1000);
                        imageInfo.putDouble("size", cursor.getLong(sizeColumn));
                        imageInfo.putString("mediaType", "image");
                        imageInfo.putBoolean("isNew", true);

                        newImages.pushMap(imageInfo);
                        
                        Log.d(TAG, "New image detected: " + imageId);
                    }
                } finally {
                    cursor.close();
                }
            }

            // Send event if new images found
            if (newImages.size() > 0) {
                WritableMap event = Arguments.createMap();
                event.putArray("images", newImages);
                event.putInt("count", newImages.size());
                event.putDouble("timestamp", System.currentTimeMillis());

                sendEvent("onNewImages", event);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error handling gallery change", e);
            
            WritableMap errorEvent = Arguments.createMap();
            errorEvent.putString("error", e.getMessage());
            errorEvent.putDouble("timestamp", System.currentTimeMillis());
            
            sendEvent("onGalleryError", errorEvent);
        }
    }

    private WritableArray getImageBatchInternal(int offset, int limit) {
        WritableArray batch = Arguments.createArray();

        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATA,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.DATE_MODIFIED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
            MediaStore.Images.Media.SIZE
        };

        // Fix: Remove LIMIT/OFFSET from sortOrder as it's not supported by MediaStore
        String sortOrder = MediaStore.Images.Media.DATE_ADDED + " DESC";

        Cursor cursor = reactContext.getContentResolver().query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            sortOrder
        );

        if (cursor != null) {
            try {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int pathColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);

                // Manual pagination: skip offset records and process only limit records
                int currentIndex = 0;
                int processedCount = 0;

                while (cursor.moveToNext() && processedCount < limit) {
                    // Skip records until we reach the offset
                    if (currentIndex < offset) {
                        currentIndex++;
                        continue;
                    }

                    WritableMap imageInfo = Arguments.createMap();
                    imageInfo.putString("uri", "file://" + cursor.getString(pathColumn));
                    imageInfo.putString("id", cursor.getString(idColumn));
                    imageInfo.putInt("width", cursor.getInt(widthColumn));
                    imageInfo.putInt("height", cursor.getInt(heightColumn));
                    imageInfo.putDouble("creationDate", cursor.getLong(dateAddedColumn) * 1000);
                    imageInfo.putDouble("modificationDate", cursor.getLong(dateModifiedColumn) * 1000);
                    imageInfo.putDouble("size", cursor.getLong(sizeColumn));

                    batch.pushMap(imageInfo);
                    
                    currentIndex++;
                    processedCount++;
                }

                Log.d(TAG, "getImageBatch: offset=" + offset + ", limit=" + limit + 
                           ", total=" + cursor.getCount() + ", returned=" + processedCount);
            } finally {
                cursor.close();
            }
        }

        return batch;
    }

    private int getImageCount() {
        int count = 0;
        String[] projection = {MediaStore.Images.Media._ID};
        
        Cursor cursor = reactContext.getContentResolver().query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            null
        );

        if (cursor != null) {
            count = cursor.getCount();
            cursor.close();
        }

        return count;
    }

    private boolean hasGalleryPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ uses READ_MEDIA_IMAGES
            return ContextCompat.checkSelfPermission(reactContext, 
                Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        } else {
            // Older versions use READ_EXTERNAL_STORAGE
            return ContextCompat.checkSelfPermission(reactContext, 
                Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private void sendEvent(String eventName, WritableMap params) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
}