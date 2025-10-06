// ios/Visara/GalleryObserver.h
// Native iOS module for real-time gallery observation

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <Photos/Photos.h>

@interface GalleryObserver : RCTEventEmitter <RCTBridgeModule, PHPhotoLibraryChangeObserver>

@property (nonatomic, strong) PHFetchResult<PHAsset *> *allPhotos;
@property (nonatomic, strong) NSMutableSet<NSString *> *processedAssetIds;
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, assign) BOOL isObserving;
@property (nonatomic, strong) dispatch_queue_t processingQueue;

@end