#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "VisaraSpecs/VisaraSpecs.h"

// Exported under the spec's JS name ("ThermalObserver").
@interface RCT_EXTERN_REMAP_MODULE(ThermalObserver, ThermalObserverModule, RCTEventEmitter)

RCT_EXTERN_METHOD(getThermalState:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeThermalObserverSpecJSI>(params);
}

@end

@interface ThermalObserverModule (TurboModuleConformance) <NativeThermalObserverSpec>
@end
