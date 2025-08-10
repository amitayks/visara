package com.visara.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Debug;
import com.facebook.react.bridge.*;

public class MemoryInfoModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "MemoryInfo";
    
    public MemoryInfoModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void getMemoryInfo(Promise promise) {
        try {
            ActivityManager actManager = (ActivityManager) getReactApplicationContext()
                .getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo memInfo = new ActivityManager.MemoryInfo();
            actManager.getMemoryInfo(memInfo);
            
            WritableMap map = Arguments.createMap();
            map.putDouble("availableMemory", memInfo.availMem);
            map.putDouble("totalMemory", memInfo.totalMem);
            map.putBoolean("lowMemory", memInfo.lowMemory);
            map.putDouble("threshold", memInfo.threshold);
            
            // Get app-specific memory info
            Debug.MemoryInfo debugMemInfo = new Debug.MemoryInfo();
            Debug.getMemoryInfo(debugMemInfo);
            map.putDouble("appTotalPss", debugMemInfo.getTotalPss() * 1024); // Convert from KB to bytes
            map.putDouble("appTotalPrivateDirty", debugMemInfo.getTotalPrivateDirty() * 1024);
            map.putDouble("appTotalSharedDirty", debugMemInfo.getTotalSharedDirty() * 1024);
            
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("MEMORY_INFO_ERROR", e.getMessage());
        }
    }
}