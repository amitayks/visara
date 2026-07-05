package com.visara.mediaindexer

import android.Manifest
import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.provider.MediaStore
import android.util.AtomicFile
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.visara.specs.NativeMediaIndexerSpec
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import org.json.JSONException
import org.json.JSONObject

/**
 * MediaIndexer TurboModule (media-indexer-native spec, design D7).
 *
 * Streams the MediaStore library as minimal `indexer_batch` events, computes
 * cross-launch deltas (including deletions, diffed natively against a
 * persisted id baseline in filesDir/media_index_ids.bin), emits throttled
 * `indexer_changed` pokes from a ContentObserver, handles the photo/video
 * runtime-permission flow, OS-confirmed deletion, and the Android-only PDF
 * sweep. Replaces the legacy MediaObserver module.
 */
@ReactModule(name = NativeMediaIndexerSpec.NAME)
class MediaIndexerModule(private val reactContext: ReactApplicationContext) :
    NativeMediaIndexerSpec(reactContext) {

    companion object {
        val NAME: String = NativeMediaIndexerSpec.NAME

        private const val TAG = "MediaIndexerModule"

        private const val EVENT_BATCH = "indexer_batch"
        private const val EVENT_SCAN_COMPLETE = "indexer_scan_complete"
        private const val EVENT_CHANGED = "indexer_changed"

        private const val TOKEN_VERSION = 1
        private const val ID_FILE_NAME = "media_index_ids.bin"
        private const val ID_FILE_MAGIC = 0x56495849 // "VIXI"
        private const val PDF_BATCH_SIZE = 500

        /** Deltas larger than this fall back to full:true (fullScan streams in batches; a promise payload does not). */
        private const val DELTA_ROW_CAP = 10_000

        /** SQLite bind-variable safety margin for _ID IN (...) chunks. */
        private const val IN_CHUNK = 500

        private const val ACCESS_REQUEST_CODE = 46101
        private const val DELETE_REQUEST_CODE = 46102

        private const val PDF_MIME = "application/pdf"

        private val FILES_URI: Uri = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)

        private val PROJECTION = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_TAKEN,
            MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.WIDTH,
            MediaStore.Files.FileColumns.HEIGHT,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
        )

        private val MEDIA_TYPE_SELECTION =
            "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"

        private val MEDIA_TYPE_ARGS = arrayOf(
            MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
            MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
        )

        private val SORT_NEWEST_TAKEN = "${MediaStore.Files.FileColumns.DATE_TAKEN} DESC"
        private val SORT_NEWEST_ADDED = "${MediaStore.Files.FileColumns.DATE_ADDED} DESC"
    }

    private data class ParsedToken(val generation: Long, val version: String)

    private class PendingDelete(val ids: List<String>, val promise: Promise)

    /** Cached column indices over the shared 9-column projection (one lookup per cursor, not per row). */
    private class RowReader(cursor: Cursor) {
        private val idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
        private val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
        private val mimeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
        private val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
        private val takenCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_TAKEN)
        private val addedCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED)
        private val widthCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.WIDTH)
        private val heightCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.HEIGHT)
        private val mediaTypeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)

        fun rowId(cursor: Cursor): Long = cursor.getLong(idCol)

        fun readItem(cursor: Cursor): WritableMap {
            val id = cursor.getLong(idCol)
            val (kind, uri) = when (cursor.getInt(mediaTypeCol)) {
                MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE ->
                    "image" to ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ->
                    "video" to ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                // Only reachable from the PDF sweep (full scan selects image|video).
                else -> "pdf" to ContentUris.withAppendedId(FILES_URI, id)
            }
            val dateTaken = cursor.getLong(takenCol)
            val takenAt = if (dateTaken > 0L) dateTaken else cursor.getLong(addedCol) * 1000L

            val item = Arguments.createMap()
            item.putString("id", id.toString())
            item.putString("uri", uri.toString())
            item.putString("filename", cursor.getString(nameCol) ?: "")
            item.putString("mimeType", cursor.getString(mimeCol) ?: "")
            item.putString("kind", kind)
            item.putInt("width", cursor.getInt(widthCol))
            item.putInt("height", cursor.getInt(heightCol))
            // SIZE can exceed Int.MAX_VALUE for large videos — marshal as double.
            item.putDouble("fileSize", cursor.getLong(sizeCol).toDouble())
            item.putDouble("takenAt", takenAt.toDouble())
            return item
        }
    }

    /** Serializes scans, deltas, and all id-baseline file access. */
    private val scanExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "MediaIndexerScan") }

    @Volatile
    private var listenerCount = 0

    private val observerLock = Any()
    private var observerThread: HandlerThread? = null
    private var contentObserver: ContentObserver? = null

    private val permissionLock = Any()
    private val pendingAccessPromises = ArrayList<Promise>()

    private val deleteLock = Any()
    private var pendingDelete: PendingDelete? = null

    private val permissionListener = PermissionListener { requestCode, _, _ ->
        if (requestCode != ACCESS_REQUEST_CODE) {
            false
        } else {
            resolvePendingAccess(computeAccessStatus())
            true
        }
    }

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            if (requestCode != DELETE_REQUEST_CODE) return
            val pending = takePendingDelete() ?: return
            val deleted = if (resultCode == Activity.RESULT_OK) pending.ids else emptyList()
            // User cancel is a resolve with an empty list — never a rejection.
            pending.promise.resolve(buildDeleteResult(deleted))
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    // -----------------------------------------------------------------------
    // Full scan
    // -----------------------------------------------------------------------

    override fun startFullScan(batchSize: Double) {
        val size = batchSize.toInt().coerceAtLeast(1)
        execute { runFullScan(size) }
    }

    private fun runFullScan(batchSize: Int) {
        // Token captured BEFORE the query: changes racing the scan are re-reported
        // by the next changesSince (at-least-once; JS upserts are idempotent).
        val token = buildToken()
        val seenIds = ArrayList<Long>(4096)
        var batch = Arguments.createArray()
        var total = 0
        var completed = false
        try {
            reactContext.contentResolver
                .query(FILES_URI, PROJECTION, MEDIA_TYPE_SELECTION, MEDIA_TYPE_ARGS, SORT_NEWEST_TAKEN)
                ?.use { cursor ->
                    val reader = RowReader(cursor)
                    while (cursor.moveToNext()) {
                        seenIds.add(reader.rowId(cursor))
                        batch.pushMap(reader.readItem(cursor))
                        total++
                        if (batch.size() == batchSize) {
                            emitBatch(batch)
                            batch = Arguments.createArray()
                        }
                    }
                    completed = true
                }
        } catch (e: Exception) {
            Log.e(TAG, "startFullScan failed after $total rows", e)
        }
        if (batch.size() > 0) {
            emitBatch(batch)
        }
        if (completed) {
            // Seed the deletion baseline: without this write the first
            // changesSince after a full scan would loop full:true forever.
            val sorted = seenIds.toLongArray()
            sorted.sort()
            writeIdFile(sorted)
        }
        emitScanComplete(total, token)
    }

    // -----------------------------------------------------------------------
    // PDF scan (Android-only sweep; same event stream, kind='pdf')
    // -----------------------------------------------------------------------

    override fun startPdfScan() {
        execute { runPdfScan() }
    }

    private fun runPdfScan() {
        var batch = Arguments.createArray()
        var total = 0
        try {
            reactContext.contentResolver
                .query(
                    FILES_URI,
                    PROJECTION,
                    "${MediaStore.Files.FileColumns.MIME_TYPE} = ?",
                    arrayOf(PDF_MIME),
                    SORT_NEWEST_ADDED,
                )
                ?.use { cursor ->
                    val reader = RowReader(cursor)
                    while (cursor.moveToNext()) {
                        batch.pushMap(reader.readItem(cursor))
                        total++
                        if (batch.size() == PDF_BATCH_SIZE) {
                            emitBatch(batch)
                            batch = Arguments.createArray()
                        }
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "startPdfScan failed after $total rows", e)
        }
        if (batch.size() > 0) {
            emitBatch(batch)
        }
        emitScanComplete(total, "")
    }

    // -----------------------------------------------------------------------
    // Cross-launch deltas
    // -----------------------------------------------------------------------

    override fun changesSince(token: String, promise: Promise) {
        try {
            scanExecutor.execute {
                try {
                    promise.resolve(computeDelta(token))
                } catch (e: Exception) {
                    Log.e(TAG, "changesSince failed; degrading to full", e)
                    try {
                        promise.resolve(fullDelta())
                    } catch (inner: Exception) {
                        promise.reject("E_MEDIA_DELTA", "changesSince failed", inner)
                    }
                }
            }
        } catch (e: RejectedExecutionException) {
            promise.reject("E_MEDIA_DELTA", "MediaIndexer is shutting down", e)
        }
    }

    private fun computeDelta(token: String): WritableMap {
        val parsed = parseToken(token) ?: return fullDelta()
        val currentVersion = try {
            MediaStore.getVersion(reactContext)
        } catch (e: Exception) {
            return fullDelta()
        }
        if (parsed.version != currentVersion) return fullDelta()
        val previousIds = readIdFile() ?: return fullDelta()

        // New token captured BEFORE the queries — same at-least-once stance as fullScan.
        val newToken = buildToken()
        val gen = parsed.generation.toString()

        val added = Arguments.createArray()
        val addedOk = collectItems(
            "$MEDIA_TYPE_SELECTION AND ${MediaStore.MediaColumns.GENERATION_ADDED} > ?",
            MEDIA_TYPE_ARGS + gen,
            added,
        )
        if (!addedOk) return fullDelta()

        val updated = Arguments.createArray()
        val updatedOk = collectItems(
            "$MEDIA_TYPE_SELECTION AND ${MediaStore.MediaColumns.GENERATION_MODIFIED} > ?" +
                " AND ${MediaStore.MediaColumns.GENERATION_ADDED} <= ?",
            MEDIA_TYPE_ARGS + arrayOf(gen, gen),
            updated,
        )
        if (!updatedOk) return fullDelta()

        // Deletions: cheap _ID-only sweep diffed natively against the persisted
        // baseline — nothing bulky ever crosses the bridge.
        val currentIds = sweepIds() ?: return fullDelta()
        val deletedIds = Arguments.createArray()
        diffSorted(previousIds, currentIds).forEach { deletedIds.pushString(it.toString()) }
        writeIdFile(currentIds)

        val result = Arguments.createMap()
        result.putArray("added", added)
        result.putArray("updated", updated)
        result.putArray("deletedIds", deletedIds)
        result.putString("newToken", newToken)
        result.putBoolean("full", false)
        return result
    }

    private fun fullDelta(): WritableMap {
        val result = Arguments.createMap()
        result.putArray("added", Arguments.createArray())
        result.putArray("updated", Arguments.createArray())
        result.putArray("deletedIds", Arguments.createArray())
        result.putString("newToken", buildToken())
        result.putBoolean("full", true)
        return result
    }

    /** Reads matching rows into [out]; false when the query fails or exceeds [DELTA_ROW_CAP]. */
    private fun collectItems(
        selection: String,
        selectionArgs: Array<String>,
        out: WritableArray,
    ): Boolean {
        reactContext.contentResolver
            .query(FILES_URI, PROJECTION, selection, selectionArgs, SORT_NEWEST_TAKEN)
            ?.use { cursor ->
                val reader = RowReader(cursor)
                var count = 0
                while (cursor.moveToNext()) {
                    if (++count > DELTA_ROW_CAP) return false
                    out.pushMap(reader.readItem(cursor))
                }
                return true
            }
        return false
    }

    /** Sorted _ID sweep of all image+video rows (a cursor of longs — cheap even at 100k). */
    private fun sweepIds(): LongArray? {
        val ids = ArrayList<Long>(4096)
        reactContext.contentResolver
            .query(
                FILES_URI,
                arrayOf(MediaStore.Files.FileColumns._ID),
                MEDIA_TYPE_SELECTION,
                MEDIA_TYPE_ARGS,
                null,
            )
            ?.use { cursor ->
                while (cursor.moveToNext()) {
                    ids.add(cursor.getLong(0))
                }
            } ?: return null
        val sorted = ids.toLongArray()
        sorted.sort()
        return sorted
    }

    /** Elements of sorted [previous] missing from sorted [current] (two-pointer). */
    private fun diffSorted(previous: LongArray, current: LongArray): List<Long> {
        val gone = ArrayList<Long>()
        var i = 0
        var j = 0
        while (i < previous.size) {
            when {
                j >= current.size || previous[i] < current[j] -> {
                    gone.add(previous[i])
                    i++
                }
                previous[i] == current[j] -> {
                    i++
                    j++
                }
                else -> j++
            }
        }
        return gone
    }

    // -----------------------------------------------------------------------
    // Change token (opaque JSON {v, generation, version})
    // -----------------------------------------------------------------------

    private fun buildToken(): String {
        val generation = try {
            MediaStore.getGeneration(reactContext, MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore.getGeneration failed", e)
            0L
        }
        val version = try {
            MediaStore.getVersion(reactContext)
        } catch (e: Exception) {
            Log.w(TAG, "MediaStore.getVersion failed", e)
            ""
        }
        return JSONObject()
            .put("v", TOKEN_VERSION)
            .put("generation", generation)
            .put("version", version)
            .toString()
    }

    private fun parseToken(token: String): ParsedToken? {
        if (token.isEmpty()) return null
        return try {
            val obj = JSONObject(token)
            if (obj.optInt("v", -1) != TOKEN_VERSION) return null
            val version = obj.optString("version", "")
            if (version.isEmpty()) return null
            ParsedToken(obj.getLong("generation"), version)
        } catch (e: JSONException) {
            null
        }
    }

    // -----------------------------------------------------------------------
    // Persisted id baseline (filesDir/media_index_ids.bin: magic, count, sorted longs)
    // -----------------------------------------------------------------------

    private fun idFile(): AtomicFile = AtomicFile(File(reactContext.filesDir, ID_FILE_NAME))

    /** Null on missing/corrupt file — callers degrade to full:true. */
    private fun readIdFile(): LongArray? {
        val atomic = idFile()
        if (!atomic.baseFile.exists()) return null
        return try {
            val bytes = atomic.readFully()
            if (bytes.size < 8) return null
            val buffer = ByteBuffer.wrap(bytes)
            if (buffer.int != ID_FILE_MAGIC) return null
            val count = buffer.int
            if (count < 0 || (bytes.size - 8) % 8 != 0 || count != (bytes.size - 8) / 8) return null
            LongArray(count) { buffer.long }
        } catch (e: Exception) {
            Log.w(TAG, "id baseline unreadable — will degrade to full scan", e)
            null
        }
    }

    private fun writeIdFile(sortedIds: LongArray) {
        val atomic = idFile()
        var stream: FileOutputStream? = null
        try {
            stream = atomic.startWrite()
            val buffer = ByteBuffer.allocate(8 + sortedIds.size * 8)
            buffer.putInt(ID_FILE_MAGIC)
            buffer.putInt(sortedIds.size)
            sortedIds.forEach { buffer.putLong(it) }
            stream.write(buffer.array())
            atomic.finishWrite(stream)
        } catch (e: Exception) {
            Log.w(TAG, "id baseline write failed", e)
            if (stream != null) atomic.failWrite(stream)
        }
    }

    // -----------------------------------------------------------------------
    // Live observation (poke, not a data path)
    // -----------------------------------------------------------------------

    override fun startObserving(throttleMs: Double) {
        val throttle = throttleMs.toLong().coerceAtLeast(0L)
        synchronized(observerLock) {
            if (contentObserver != null) return
            val thread = HandlerThread("MediaIndexerObserver")
            thread.start()
            val handler = Handler(thread.looper)
            val observer = object : ContentObserver(handler) {
                // Touched only on the observer HandlerThread (onChange + delayed runnable).
                private var scheduled = false

                override fun onChange(selfChange: Boolean, uri: Uri?) {
                    if (scheduled) return
                    scheduled = true
                    handler.postDelayed({
                        scheduled = false
                        sendEvent(EVENT_CHANGED, Arguments.createMap())
                    }, throttle)
                }
            }
            val resolver = reactContext.contentResolver
            resolver.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer)
            resolver.registerContentObserver(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true, observer)
            resolver.registerContentObserver(FILES_URI, true, observer)
            observerThread = thread
            contentObserver = observer
        }
    }

    override fun stopObserving() {
        synchronized(observerLock) {
            contentObserver?.let { reactContext.contentResolver.unregisterContentObserver(it) }
            contentObserver = null
            observerThread?.quitSafely()
            observerThread = null
        }
    }

    // -----------------------------------------------------------------------
    // Access (READ_MEDIA_IMAGES + READ_MEDIA_VIDEO; minSdk 36 — no legacy branches)
    // -----------------------------------------------------------------------

    override fun requestAccess(promise: Promise) {
        val current = computeAccessStatus()
        if (current == "granted") {
            promise.resolve(current)
            return
        }
        val activity = reactContext.currentActivity as? PermissionAwareActivity
        if (activity == null) {
            Log.w(TAG, "requestAccess without a PermissionAwareActivity — resolving current status")
            promise.resolve(current)
            return
        }
        val shouldRequest: Boolean
        synchronized(permissionLock) {
            pendingAccessPromises.add(promise)
            shouldRequest = pendingAccessPromises.size == 1
        }
        if (!shouldRequest) return
        try {
            activity.requestPermissions(
                arrayOf(
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
                ),
                ACCESS_REQUEST_CODE,
                permissionListener,
            )
        } catch (e: Exception) {
            Log.e(TAG, "requestPermissions failed", e)
            resolvePendingAccess(computeAccessStatus())
        }
    }

    override fun getAccessStatus(promise: Promise) {
        promise.resolve(computeAccessStatus())
    }

    private fun computeAccessStatus(): String {
        val images = reactContext.checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) ==
            PackageManager.PERMISSION_GRANTED
        val video = reactContext.checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) ==
            PackageManager.PERMISSION_GRANTED
        val userSelected =
            reactContext.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) ==
                PackageManager.PERMISSION_GRANTED
        return when {
            images && video -> "granted"
            userSelected -> "limited"
            else -> "denied"
        }
    }

    private fun resolvePendingAccess(status: String) {
        val drained: List<Promise>
        synchronized(permissionLock) {
            drained = ArrayList(pendingAccessPromises)
            pendingAccessPromises.clear()
        }
        drained.forEach { it.resolve(status) }
    }

    // -----------------------------------------------------------------------
    // OS-confirmed deletion
    // -----------------------------------------------------------------------

    override fun deleteAssets(ids: ReadableArray, promise: Promise) {
        val idList = ArrayList<String>(ids.size())
        for (i in 0 until ids.size()) {
            ids.getString(i)?.let { idList.add(it) }
        }
        if (idList.isEmpty()) {
            promise.resolve(buildDeleteResult(emptyList()))
            return
        }
        val activity = reactContext.currentActivity
        if (activity == null) {
            Log.w(TAG, "deleteAssets without a current activity")
            promise.resolve(buildDeleteResult(emptyList()))
            return
        }
        synchronized(deleteLock) {
            if (pendingDelete != null) {
                promise.reject(
                    "E_DELETE_IN_PROGRESS",
                    "Another deleteAssets call is awaiting user confirmation",
                )
                return
            }
            pendingDelete = PendingDelete(idList, promise)
        }
        try {
            scanExecutor.execute {
                try {
                    val uris = resolveTypedUris(idList)
                    if (uris.isEmpty()) {
                        finishDeleteEarly()
                        return@execute
                    }
                    val pendingIntent =
                        MediaStore.createDeleteRequest(reactContext.contentResolver, uris)
                    activity.startIntentSenderForResult(
                        pendingIntent.intentSender,
                        DELETE_REQUEST_CODE,
                        null,
                        0,
                        0,
                        0,
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "deleteAssets failed", e)
                    finishDeleteEarly()
                }
            }
        } catch (e: RejectedExecutionException) {
            Log.w(TAG, "deleteAssets rejected — module shutting down", e)
            takePendingDelete()?.promise?.resolve(buildDeleteResult(emptyList()))
        }
    }

    /** Map raw _IDs to per-type item URIs (image/video; anything else via the Files URI). */
    private fun resolveTypedUris(ids: List<String>): List<Uri> {
        val longIds = ids.mapNotNull { it.toLongOrNull() }
        val uris = ArrayList<Uri>(longIds.size)
        longIds.chunked(IN_CHUNK).forEach { chunk ->
            val placeholders = chunk.joinToString(",") { "?" }
            val selection = "${MediaStore.Files.FileColumns._ID} IN ($placeholders)"
            val args = chunk.map { it.toString() }.toTypedArray()
            reactContext.contentResolver
                .query(
                    FILES_URI,
                    arrayOf(
                        MediaStore.Files.FileColumns._ID,
                        MediaStore.Files.FileColumns.MEDIA_TYPE,
                    ),
                    selection,
                    args,
                    null,
                )
                ?.use { cursor ->
                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(0)
                        val uri = when (cursor.getInt(1)) {
                            MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE ->
                                ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                            MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO ->
                                ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
                            else -> ContentUris.withAppendedId(FILES_URI, id)
                        }
                        uris.add(uri)
                    }
                }
        }
        return uris
    }

    private fun takePendingDelete(): PendingDelete? {
        synchronized(deleteLock) {
            val pending = pendingDelete
            pendingDelete = null
            return pending
        }
    }

    private fun finishDeleteEarly() {
        takePendingDelete()?.promise?.resolve(buildDeleteResult(emptyList()))
    }

    private fun buildDeleteResult(ids: List<String>): WritableMap {
        val deleted = Arguments.createArray()
        ids.forEach { deleted.pushString(it) }
        val result = Arguments.createMap()
        result.putArray("deleted", deleted)
        return result
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    override fun addListener(eventName: String?) {
        // Required for RCTEventEmitter compatibility; track listener count.
        listenerCount++
    }

    override fun removeListeners(count: Double) {
        listenerCount -= count.toInt()
        if (listenerCount < 0) {
            listenerCount = 0
        }
    }

    private fun emitBatch(items: WritableArray) {
        val payload = Arguments.createMap()
        payload.putArray("items", items)
        sendEvent(EVENT_BATCH, payload)
    }

    private fun emitScanComplete(total: Int, token: String) {
        val payload = Arguments.createMap()
        payload.putInt("total", total)
        payload.putString("token", token)
        sendEvent(EVENT_SCAN_COMPLETE, payload)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        // Only send events if there are listeners (pattern shared with siblings).
        if (listenerCount <= 0) return
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "sendEvent($eventName) failed", e)
        }
    }

    private fun execute(task: () -> Unit) {
        try {
            scanExecutor.execute { task() }
        } catch (e: RejectedExecutionException) {
            Log.w(TAG, "task rejected — module shutting down", e)
        }
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    override fun invalidate() {
        stopObserving()
        reactContext.removeActivityEventListener(activityEventListener)
        scanExecutor.shutdown()
        synchronized(deleteLock) { pendingDelete = null }
        synchronized(permissionLock) { pendingAccessPromises.clear() }
        super.invalidate()
    }
}
