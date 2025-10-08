package com.visara.mediaobserver;

import android.content.ContentResolver;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.provider.MediaStore;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MediaStoreObserver extends ContentObserver {
    private final Handler handler;
    private final int throttleMs;
    private final ChangeCallback callback;
    private final ContentResolver contentResolver;
    private final Set<Uri> pendingChanges;
    private Runnable pendingTask;

    public interface ChangeCallback {
        void onChanged(List<WritableMap> changes);
    }

    public MediaStoreObserver(Handler handler, int throttleMs, ContentResolver contentResolver, ChangeCallback callback) {
        super(handler);
        this.handler = handler;
        this.throttleMs = throttleMs;
        this.contentResolver = contentResolver;
        this.callback = callback;
        this.pendingChanges = new HashSet<>();
    }

    @Override
    public void onChange(boolean selfChange, Uri uri) {
        super.onChange(selfChange, uri);

        if (uri != null) {
            synchronized (pendingChanges) {
                pendingChanges.add(uri);
            }
        }

        scheduleEmit();
    }

    private void scheduleEmit() {
        // Cancel pending task if exists
        if (pendingTask != null) {
            handler.removeCallbacks(pendingTask);
        }

        // Schedule new task
        pendingTask = () -> {
            Set<Uri> changedUris;
            synchronized (pendingChanges) {
                if (pendingChanges.isEmpty()) {
                    return;
                }
                changedUris = new HashSet<>(pendingChanges);
                pendingChanges.clear();
            }

            // Query details for changed URIs
            List<WritableMap> changes = queryChangedMedia(changedUris);

            // Emit to JS
            callback.onChanged(changes);

            pendingTask = null;
        };

        handler.postDelayed(pendingTask, throttleMs);
    }

    private List<WritableMap> queryChangedMedia(Set<Uri> uris) {
        List<WritableMap> changes = new ArrayList<>();

        for (Uri uri : uris) {
            WritableMap change = queryMediaItem(uri);
            if (change != null) {
                changes.add(change);
            }
        }

        return changes;
    }

    private WritableMap queryMediaItem(Uri uri) {
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

        try (Cursor cursor = contentResolver.query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
                int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED);
                int widthColumn = cursor.getColumnIndex(MediaStore.MediaColumns.WIDTH);
                int heightColumn = cursor.getColumnIndex(MediaStore.MediaColumns.HEIGHT);
                int latColumn = cursor.getColumnIndex(MediaStore.MediaColumns.LATITUDE);
                int lonColumn = cursor.getColumnIndex(MediaStore.MediaColumns.LONGITUDE);

                WritableMap change = Arguments.createMap();
                change.putString("action", "modified");
                change.putString("uri", uri.toString());
                change.putString("filename", cursor.getString(nameColumn));
                change.putString("mimeType", cursor.getString(mimeColumn));

                if (widthColumn >= 0) {
                    change.putInt("width", cursor.getInt(widthColumn));
                } else {
                    change.putInt("width", 0);
                }

                if (heightColumn >= 0) {
                    change.putInt("height", cursor.getInt(heightColumn));
                } else {
                    change.putInt("height", 0);
                }

                change.putInt("fileSize", cursor.getInt(sizeColumn));
                change.putDouble("creationDate", cursor.getLong(dateAddedColumn) * 1000);
                change.putDouble("modificationDate", cursor.getLong(dateModifiedColumn) * 1000);

                if (latColumn >= 0 && !cursor.isNull(latColumn)) {
                    change.putDouble("latitude", cursor.getDouble(latColumn));
                }
                if (lonColumn >= 0 && !cursor.isNull(lonColumn)) {
                    change.putDouble("longitude", cursor.getDouble(lonColumn));
                }

                return change;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }

    public void cleanup() {
        if (pendingTask != null) {
            handler.removeCallbacks(pendingTask);
            pendingTask = null;
        }
        synchronized (pendingChanges) {
            pendingChanges.clear();
        }
    }
}
