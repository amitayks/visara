#import <React/RCTBridgeModule.h>
#import "VisaraSpecs/VisaraSpecs.h"

@interface RCT_EXTERN_MODULE(VisionTextRecognizerModule, NSObject)

RCT_EXTERN_METHOD(recognizeText:(NSString *)imagePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeVisionTextRecognizerSpecJSI>(params);
}

@end

@interface VisionTextRecognizerModule (TurboModuleConformance) <NativeVisionTextRecognizerSpec>
@end
