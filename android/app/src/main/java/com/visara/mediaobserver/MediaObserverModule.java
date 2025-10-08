package com.visara.mediaobserver;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MediaObserverModule extends ReactContextBaseJavaModule implements TurboModule {
    public static final String NAME = "MediaObserver";

    private static final int BATCH_SIZE = 100;
    private static final String EVENT_MEDIA_BATCH = "media_batch";
    private static final String EVENT_SCAN_COMPLETE = "scan_complete";

    private final ReactApplicationContext reactContext;
    private MediaStoreObserver mediaStoreObserver;
    private Handler throttleHandler;
    private boolean isObserverActive = false;
    private int listenerCount = 0;

    public MediaObserverModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.throttleHandler = new Handler(Looper.getMainLooper());
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void startInitialScan() {
        new Thread(() -> {
            try {
                scanMediaStore(0);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    @ReactMethod
    public void getChangesSince(double timestamp) {
        new Thread(() -> {
            try {
                scanMediaStore((long) timestamp);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    @ReactMethod
    public void startObserver(double throttleMs) {
        if (isObserverActive) {
            return;
        }

        isObserverActive = true;
        int throttle = (int) throttleMs;

        if (mediaStoreObserver != null) {
            stopObserver();
        }

        mediaStoreObserver = new MediaStoreObserver(throttleHandler, throttle, reactContext.getContentResolver(), this::onMediaChanged);

        // Register observers for images, videos, and files (PDFs)
        Uri imagesUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        Uri videosUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        Uri filesUri = MediaStore.Files.getContentUri("external");

        reactContext.getContentResolver().registerContentObserver(imagesUri, true, mediaStoreObserver);
        reactContext.getContentResolver().registerContentObserver(videosUri, true, mediaStoreObserver);
        reactContext.getContentResolver().registerContentObserver(filesUri, true, mediaStoreObserver);
    }

    @ReactMethod
    public void stopObserver() {
        if (mediaStoreObserver != null) {
            reactContext.getContentResolver().unregisterContentObserver(mediaStoreObserver);
            mediaStoreObserver.cleanup();
            mediaStoreObserver = null;
        }
        isObserverActive = false;
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required for RCTEventEmitter compatibility
        // Track listener count for optimization
        listenerCount++;
    }

    @ReactMethod
    public void removeListeners(double count) {
        // Required for RCTEventEmitter compatibility
        // Decrease listener count
        listenerCount -= (int) count;
        if (listenerCount < 0) {
            listenerCount = 0;
        }
    }

    private void scanMediaStore(long sinceTimestamp) {
        List<WritableMap> allChanges = new ArrayList<>();
        int totalCount = 0;

        // Scan images
        totalCount += scanMediaType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, sinceTimestamp, allChanges);

        // Scan videos
        totalCount += scanMediaType(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, sinceTimestamp, allChanges);

        // Scan files for PDFs
        totalCount += scanPDFs(sinceTimestamp, allChanges);

        // Send batches
        sendBatches(allChanges);

        // Send completion event
        WritableMap completionEvent = Arguments.createMap();
        completionEvent.putInt("total", totalCount);
        sendEvent(EVENT_SCAN_COMPLETE, completionEvent);
    }

    private int scanMediaType(Uri contentUri, long sinceTimestamp, List<WritableMap> allChanges) {
        String[] projection = {
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.DATE_ADDED,
            MediaStore.MediaColumns.DATE_MODIFIED,
            MediaStore.MediaColumns.WIDTH,
            MediaStore.MediaColumns.HEIGHT,
            MediaStore.MediaColumns.LATITUDE,
            MediaStore.MediaColumns.LONGITUDE
        };

        String selection = sinceTimestamp > 0 ? MediaStore.MediaColumns.DATE_MODIFIED + " > ?" : null;
        String[] selectionArgs = sinceTimestamp > 0 ? new String[]{String.valueOf(sinceTimestamp / 1000)} : null;
        String sortOrder = MediaStore.MediaColumns.DATE_MODIFIED + " ASC";

        int count = 0;
        try (Cursor cursor = reactContext.getContentResolver().query(
                contentUri,
                projection,
                selection,
                selectionArgs,
                sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
                int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT);
                int latColumn = cursor.getColumnIndex(MediaStore.MediaColumns.LATITUDE);
                int lonColumn = cursor.getColumnIndex(MediaStore.MediaColumns.LONGITUDE);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    Uri uri = Uri.withAppendedPath(contentUri, String.valueOf(id));

                    WritableMap change = Arguments.createMap();
                    change.putString("action", sinceTimestamp > 0 ? "modified" : "added");
                    change.putString("uri", uri.toString());
                    change.putString("filename", cursor.getString(nameColumn));
                    change.putString("mimeType", cursor.getString(mimeColumn));
                    change.putInt("width", cursor.getInt(widthColumn));
                    change.putInt("height", cursor.getInt(heightColumn));
                    change.putInt("fileSize", cursor.getInt(sizeColumn));
                    change.putDouble("creationDate", cursor.getLong(dateAddedColumn) * 1000);
                    change.putDouble("modificationDate", cursor.getLong(dateModifiedColumn) * 1000);

                    if (latColumn >= 0 && !cursor.isNull(latColumn)) {
                        change.putDouble("latitude", cursor.getDouble(latColumn));
                    }
                    if (lonColumn >= 0 && !cursor.isNull(lonColumn)) {
                        change.putDouble("longitude", cursor.getDouble(lonColumn));
                    }

                    allChanges.add(change);
                    count++;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return count;
    }

    private int scanPDFs(long sinceTimestamp, List<WritableMap> allChanges) {
        String[] projection = {
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.DATE_MODIFIED
        };

        String selection = MediaStore.Files.FileColumns.MIME_TYPE + "=?";
        String[] selectionArgs = {"application/pdf"};

        if (sinceTimestamp > 0) {
            selection += " AND " + MediaStore.Files.FileColumns.DATE_MODIFIED + " > ?";
            selectionArgs = new String[]{"application/pdf", String.valueOf(sinceTimestamp / 1000)};
        }

        String sortOrder = MediaStore.Files.FileColumns.DATE_MODIFIED + " ASC";
        Uri filesUri = MediaStore.Files.getContentUri("external");

        int count = 0;
        try (Cursor cursor = reactContext.getContentResolver().query(
                filesUri,
                projection,
                selection,
                selectionArgs,
                sortOrder
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED);
                int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    Uri uri = Uri.withAppendedPath(filesUri, String.valueOf(id));

                    WritableMap change = Arguments.createMap();
                    change.putString("action", sinceTimestamp > 0 ? "modified" : "added");
                    change.putString("uri", uri.toString());
                    change.putString("filename", cursor.getString(nameColumn));
                    change.putString("mimeType", cursor.getString(mimeColumn));
                    change.putInt("width", 0);
                    change.putInt("height", 0);
                    change.putInt("fileSize", cursor.getInt(sizeColumn));
                    change.putDouble("creationDate", cursor.getLong(dateAddedColumn) * 1000);
                    change.putDouble("modificationDate", cursor.getLong(dateModifiedColumn) * 1000);

                    allChanges.add(change);
                    count++;
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return count;
    }

    private void sendBatches(List<WritableMap> changes) {
        for (int i = 0; i < changes.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, changes.size());
            List<WritableMap> batch = changes.subList(i, end);

            WritableArray changesArray = Arguments.createArray();
            for (WritableMap change : batch) {
                changesArray.pushMap(change);
            }

            WritableMap event = Arguments.createMap();
            event.putArray("changes", changesArray);
            sendEvent(EVENT_MEDIA_BATCH, event);
        }
    }

    private void onMediaChanged(List<WritableMap> changes) {
        if (changes.isEmpty()) {
            return;
        }

        WritableArray changesArray = Arguments.createArray();
        for (WritableMap change : changes) {
            changesArray.pushMap(change);
        }

        WritableMap event = Arguments.createMap();
        event.putArray("changes", changesArray);
        sendEvent(EVENT_MEDIA_BATCH, event);
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        // Only send events if there are listeners
        if (listenerCount > 0) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }

    @Override
    public void invalidate() {
        stopObserver();
        super.invalidate();
    }
}
