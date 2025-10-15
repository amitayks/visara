#import <React/RCTBridgeModule.h>

/**
 * Objective-C bridge for MemoryModule
 * Exposes Swift methods to React Native
 */
@interface RCT_EXTERN_MODULE(MemoryModule, NSObject)

RCT_EXTERN_METHOD(getMemoryInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestGC:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
