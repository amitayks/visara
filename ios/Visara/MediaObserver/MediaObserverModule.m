#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_REMAP_MODULE(MediaObserver, MediaObserverModule, RCTEventEmitter)

RCT_EXTERN_METHOD(startInitialScan)
RCT_EXTERN_METHOD(getChangesSince:(double)timestamp)
RCT_EXTERN_METHOD(startObserver:(double)throttleMs)
RCT_EXTERN_METHOD(stopObserver)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
