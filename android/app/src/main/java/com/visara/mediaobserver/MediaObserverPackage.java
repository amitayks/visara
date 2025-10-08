package com.visara.mediaobserver;

import androidx.annotation.NonNull;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class MediaObserverPackage extends TurboReactPackage {

    @Override
    public NativeModule getModule(String name, @NonNull ReactApplicationContext reactContext) {
        if (name.equals(MediaObserverModule.NAME)) {
            return new MediaObserverModule(reactContext);
        }
        return null;
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
            moduleInfos.put(
                    MediaObserverModule.NAME,
                    new ReactModuleInfo(
                            MediaObserverModule.NAME,
                            MediaObserverModule.class.getName(),
                            false, // canOverrideExistingModule
                            false, // needsEagerInit
                            true,  // hasConstants
                            false, // isCxxModule
                            true   // isTurboModule
                    )
            );
            return moduleInfos;
        };
    }
}
