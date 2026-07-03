#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VisionTextRecognizerModule, NSObject)

RCT_EXTERN_METHOD(recognizeText:(NSString *)imagePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
