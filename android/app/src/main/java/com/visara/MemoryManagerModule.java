package com.visara.app;

import com.facebook.react.bridge.*;

public class MemoryManagerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "MemoryManager";
    
    public MemoryManagerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void runGC(Promise promise) {
        try {
            System.gc();
            System.runFinalization();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("GC_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void runGC() {
        // Overloaded method without promise for synchronous calls
        System.gc();
        System.runFinalization();
    }
}