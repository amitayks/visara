package com.visara.drain

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.util.Log
import com.visara.app.R

/**
 * Keep-alive foreground service for the enrichment drain (drain-host spec).
 *
 * It runs NO work itself — the drain loop lives in the app's main JS runtime.
 * This service only holds foreground process priority (so Android neither
 * freezes nor kills the process while the library is being analyzed) and owns
 * the progress notification.
 *
 * Crash-proof by construction against the react-native-background-actions
 * failure modes seen on ColorOS/Android 16:
 *  - startForeground() is called synchronously inside onStartCommand — the
 *    ForegroundServiceDidNotStartInTimeException window does not exist.
 *  - START_NOT_STICKY with a null-intent guard — the OS never restarts the
 *    service into a state it cannot fulfil (the old sticky crash loop).
 *  - No headless JS, no task registration, nothing to race.
 */
class VisaraDrainService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand startId=$startId intent=$intent")
        if (intent == null) {
            // System restart without our extras (never expected with
            // NOT_STICKY) — die quietly instead of guessing at a notification.
            stopSelf(startId)
            return START_NOT_STICKY
        }
        val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
        lastProcessed = 0
        lastTotal = 0
        ensureChannel(this)
        try {
            // FIRST real statement — mediaProcessing is the honest Android 15+
            // type for on-device analysis of the photo library (~6h/24h budget,
            // handled via onTimeout below).
            startForeground(
                NOTIFICATION_ID,
                buildNotification(this, text, 0, 0),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING,
            )
        } catch (e: Exception) {
            // Misconfiguration or OS refusal: stopping before returning also
            // satisfies the did-not-start-in-time contract — no crash path.
            stopSelf(startId)
            return START_NOT_STICKY
        }
        isRunning = true
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        // FGS runtime budget exhausted (Android 15+): tell JS to settle, then
        // stop before the system's ANR window closes. JS downgrades to
        // foreground-gated draining and re-grabs the service on next resume.
        Log.d(TAG, "onTimeout startId=$startId fgsType=$fgsType")
        onTeardown?.invoke("timeout")
        stopSelf()
    }

    override fun onDestroy() {
        Log.d(TAG, "onDestroy")
        isRunning = false
        onTeardown?.invoke("destroyed")
        super.onDestroy()
    }

    companion object {
        private const val TAG = "VisaraDrainService"

        const val CHANNEL_ID = "visara_processing"
        const val NOTIFICATION_ID = 4201
        const val EXTRA_TEXT = "com.visara.drain.TEXT"

        /** True between a successful startForeground and onDestroy. */
        @Volatile
        var isRunning = false
            private set

        /**
         * Teardown sink registered by DrainServiceModule; invoked with
         * "timeout" / "destroyed" when the service goes away.
         */
        @Volatile
        var onTeardown: ((String) -> Unit)? = null

        // Last determinate progress, kept so text-only updates (pause/resume)
        // don't reset the bar.
        @Volatile
        private var lastProcessed = 0

        @Volatile
        private var lastTotal = 0

        /** Re-post the notification (module-driven updates). */
        fun postNotification(
            context: Context,
            text: String,
            processed: Int? = null,
            total: Int? = null,
        ) {
            if (processed != null && total != null) {
                lastProcessed = processed
                lastTotal = total
            }
            val manager =
                context.getSystemService(NotificationManager::class.java) ?: return
            manager.notify(
                NOTIFICATION_ID,
                buildNotification(context, text, lastProcessed, lastTotal),
            )
        }

        private fun ensureChannel(context: Context) {
            val manager =
                context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        "Library processing",
                        NotificationManager.IMPORTANCE_LOW,
                    ),
                )
            }
        }

        private fun buildNotification(
            context: Context,
            text: String,
            processed: Int,
            total: Int,
        ): Notification {
            val builder = Notification.Builder(context, CHANNEL_ID)
                .setContentTitle("Visara")
                .setContentText(text)
                .setSmallIcon(R.mipmap.visara_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
            if (total > 0) {
                builder.setProgress(total, processed.coerceAtMost(total), false)
            } else {
                builder.setProgress(0, 0, true)
            }
            context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                builder.setContentIntent(
                    PendingIntent.getActivity(
                        context,
                        0,
                        it,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    ),
                )
            }
            return builder.build()
        }
    }
}
