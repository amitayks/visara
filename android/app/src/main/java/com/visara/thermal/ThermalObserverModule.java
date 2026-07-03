package com.visara.thermal;

import android.content.Context;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

public class ThermalObserverModule extends ReactContextBaseJavaModule implements TurboModule {
    public static final String NAME = "ThermalObserver";

    private static final String EVENT_THERMAL_STATE_CHANGE = "thermal_state_change";

    private final ReactApplicationContext reactContext;
    @Nullable
    private final PowerManager powerManager;
    @Nullable
    private PowerManager.OnThermalStatusChangedListener thermalStatusListener;
    private int listenerCount = 0;

    public ThermalObserverModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.powerManager =
                (PowerManager) reactContext.getSystemService(Context.POWER_SERVICE);

        // API 29+; minSdk 36 removes any Build.VERSION guard (D8). Registered
        // eagerly, but sendEvent stays silent until JS adds a listener.
        if (powerManager != null) {
            thermalStatusListener = this::emitThermalState;
            powerManager.addThermalStatusListener(thermalStatusListener);
        }
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void getThermalState(Promise promise) {
        try {
            int status = powerManager != null
                    ? powerManager.getCurrentThermalStatus()
                    : PowerManager.THERMAL_STATUS_NONE;
            promise.resolve(buildPayload(status));
        } catch (Exception e) {
            promise.reject("THERMAL_READ_ERROR", e);
        }
    }

    @ReactMethod
    public void addListener(String eventName) {
        // Required for RCTEventEmitter compatibility; track listener count.
        listenerCount++;
    }

    @ReactMethod
    public void removeListeners(double count) {
        listenerCount -= (int) count;
        if (listenerCount < 0) {
            listenerCount = 0;
        }
    }

    private void emitThermalState(int status) {
        sendEvent(EVENT_THERMAL_STATE_CHANGE, buildPayload(status));
    }

    // Normalize the platform status ordinal onto the shared 0..3 scale (D4).
    private WritableMap buildPayload(int status) {
        int level;
        String name;
        switch (status) {
            case PowerManager.THERMAL_STATUS_NONE:
                level = 0;
                name = "nominal";
                break;
            case PowerManager.THERMAL_STATUS_LIGHT:
                level = 1;
                name = "fair";
                break;
            case PowerManager.THERMAL_STATUS_MODERATE:
            case PowerManager.THERMAL_STATUS_SEVERE:
                level = 2;
                name = "serious";
                break;
            case PowerManager.THERMAL_STATUS_CRITICAL:
            case PowerManager.THERMAL_STATUS_EMERGENCY:
            case PowerManager.THERMAL_STATUS_SHUTDOWN:
                level = 3;
                name = "critical";
                break;
            default:
                level = 0;
                name = "nominal";
                break;
        }

        WritableMap map = Arguments.createMap();
        map.putInt("level", level);
        map.putString("name", name);
        map.putInt("rawLevel", status);
        return map;
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        // Only send events if there are listeners.
        if (listenerCount > 0) {
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
        }
    }

    @Override
    public void invalidate() {
        if (powerManager != null && thermalStatusListener != null) {
            powerManager.removeThermalStatusListener(thermalStatusListener);
            thermalStatusListener = null;
        }
        super.invalidate();
    }
}
