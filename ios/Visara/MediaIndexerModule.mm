#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "VisaraSpecs/VisaraSpecs.h"

// Exported under the spec's JS name ("MediaIndexer") so bridgeless
// TurboModuleRegistry.get("MediaIndexer") resolves this class.
@interface RCT_EXTERN_REMAP_MODULE(MediaIndexer, MediaIndexerModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startFullScan:(double)batchSize)
RCT_EXTERN_METHOD(startPdfScan)
RCT_EXTERN_METHOD(changesSince:(NSString *)token
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startObserving:(double)throttleMs)
RCT_EXTERN_METHOD(stopObserving)
RCT_EXTERN_METHOD(requestAccess:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getAccessStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deleteAssets:(NSArray *)ids
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(exportForInference:(NSString *)uri
                  maxEdge:(double)maxEdge
                  quality:(double)quality
                  destDir:(NSString *)destDir
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Bridgeless entry point: serve the Swift implementation through the
// codegen-generated JSI wrapper.
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMediaIndexerSpecJSI>(params);
}

@end

// Declares RCTTurboModule conformance (via the generated spec protocol) so the
// TurboModuleManager accepts the class; methods live on the Swift class and
// the extern-module category above.
@interface MediaIndexerModule (TurboModuleConformance) <NativeMediaIndexerSpec>
@end
