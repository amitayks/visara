package com.visara.drain

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** TurboReactPackage for DrainService — registration mirrors MediaIndexerPackage. */
class DrainServicePackage : TurboReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == DrainServiceModule.NAME) DrainServiceModule(reactContext) else null
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            mapOf(
                DrainServiceModule.NAME to ReactModuleInfo(
                    DrainServiceModule.NAME,
                    DrainServiceModule::class.java.name,
                    false, // canOverrideExistingModule
                    false, // needsEagerInit
                    false, // isCxxModule
                    true, // isTurboModule
                ),
            )
        }
    }
}
