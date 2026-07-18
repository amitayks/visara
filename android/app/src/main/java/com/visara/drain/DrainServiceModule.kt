package com.visara.drain

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.visara.specs.NativeDrainServiceSpec

/**
 * JS surface over {@link VisaraDrainService}: start/stop the keep-alive FGS,
 * push notification updates, and forward service teardown ("timeout" /
 * "destroyed") to JS as `drain_service_teardown` events. Every method is
 * refusal-tolerant — the drain must keep working without the service.
 */
@ReactModule(name = NativeDrainServiceSpec.NAME)
class DrainServiceModule(private val reactContext: ReactApplicationContext) :
    NativeDrainServiceSpec(reactContext) {

    @Volatile
    private var listenerCount = 0

    init {
        VisaraDrainService.onTeardown = { reason -> emitTeardown(reason) }
    }

    override fun start(text: String, promise: Promise) {
        val intent = Intent(reactContext, VisaraDrainService::class.java)
            .putExtra(VisaraDrainService.EXTRA_TEXT, text)
        try {
            reactContext.startForegroundService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException and friends: the app
            // is not foreground-eligible (Android 12+ / strict OEM builds).
            // Resolve false — the caller drains without the keep-alive and
            // retries the grab at the next resume.
            promise.resolve(false)
        }
    }

    override fun stop(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, VisaraDrainService::class.java))
        } catch (e: Exception) {
            // Nothing to unwind — the service dies with the process anyway.
        }
        promise.resolve(null)
    }

    override fun updateProgress(processed: Double, total: Double, text: String, promise: Promise) {
        if (VisaraDrainService.isRunning) {
            VisaraDrainService.postNotification(
                reactContext,
                text,
                processed.toInt(),
                total.toInt(),
            )
        }
        promise.resolve(null)
    }

    override fun updateText(text: String, promise: Promise) {
        if (VisaraDrainService.isRunning) {
            VisaraDrainService.postNotification(reactContext, text)
        }
        promise.resolve(null)
    }

    override fun addListener(eventName: String) {
        listenerCount++
    }

    override fun removeListeners(count: Double) {
        listenerCount = maxOf(0, listenerCount - count.toInt())
    }

    private fun emitTeardown(reason: String) {
        if (listenerCount <= 0) return
        try {
            val payload = Arguments.createMap().apply { putString("reason", reason) }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_TEARDOWN, payload)
        } catch (e: Exception) {
            // React instance already gone (shutdown race) — nothing to notify.
        }
    }

    override fun invalidate() {
        VisaraDrainService.onTeardown = null
        super.invalidate()
    }

    companion object {
        val NAME: String = NativeDrainServiceSpec.NAME

        private const val EVENT_TEARDOWN = "drain_service_teardown"
    }
}
