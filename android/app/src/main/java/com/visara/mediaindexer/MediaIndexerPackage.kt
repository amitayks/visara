package com.visara.mediaindexer

import android.util.Log
import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** TurboReactPackage for MediaIndexer — registration mirrors MediaObserverPackage. */
class MediaIndexerPackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        Log.d("VisaraHost", "MediaIndexerPackage.getModule($name)")
        return if (name == MediaIndexerModule.NAME) MediaIndexerModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            Log.d("VisaraHost", "MediaIndexerPackage.getReactModuleInfos() called")
            mapOf(
                MediaIndexerModule.NAME to ReactModuleInfo(
                    MediaIndexerModule.NAME,
                    MediaIndexerModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    true, // isTurboModule
                ),
            )
        }
    }
}
