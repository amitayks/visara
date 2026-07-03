#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "VisaraSpecs/VisaraSpecs.h"

// Exported under the spec's JS name ("MediaObserver") so bridgeless
// TurboModuleRegistry.getEnforcing("MediaObserver") resolves this class.
@interface RCT_EXTERN_REMAP_MODULE(MediaObserver, MediaObserverModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startInitialScan)
RCT_EXTERN_METHOD(getChangesSince:(double)timestamp)
RCT_EXTERN_METHOD(startObserver:(double)throttleMs)
RCT_EXTERN_METHOD(stopObserver)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Bridgeless entry point: serve the Swift implementation through the
// codegen-generated JSI wrapper.
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMediaObserverSpecJSI>(params);
}

@end

// Declares RCTTurboModule conformance (via the generated spec protocol) so the
// TurboModuleManager accepts the class; methods live on the Swift class and
// the extern-module category above.
@interface MediaObserverModule (TurboModuleConformance) <NativeMediaObserverSpec>
@end
