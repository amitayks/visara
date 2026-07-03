package com.visara.thermal;

import androidx.annotation.NonNull;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.HashMap;
import java.util.Map;

public class ThermalObserverPackage extends TurboReactPackage {

    @Override
    public NativeModule getModule(String name, @NonNull ReactApplicationContext reactContext) {
        if (name.equals(ThermalObserverModule.NAME)) {
            return new ThermalObserverModule(reactContext);
        }
        return null;
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
            moduleInfos.put(
                    ThermalObserverModule.NAME,
                    new ReactModuleInfo(
                            ThermalObserverModule.NAME,
                            ThermalObserverModule.class.getName(),
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
