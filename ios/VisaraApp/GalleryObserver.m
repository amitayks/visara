// ios/Visara/GalleryObserver.m
// Native iOS module implementation for real-time gallery observation

#import "GalleryObserver.h"
#import <React/RCTLog.h>

@implementation GalleryObserver

RCT_EXPORT_MODULE();

// Required for RCTEventEmitter - return the main queue
+ (BOOL)requiresMainQueueSetup {
    return NO;
}

// Initialize the observer
- (instancetype)init {
    if (self = [super init]) {
        self.processedAssetIds = [[NSMutableSet alloc] init];
        self.isObserving = NO;
        self.processingQueue = dispatch_queue_create("com.visara.gallery.processing", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

// Supported events that can be sent to JavaScript
- (NSArray<NSString *> *)supportedEvents {
    return @[@"onNewImages", @"onImagesDeleted", @"onGalleryError"];
}

// Start observing gallery changes
RCT_EXPORT_METHOD(startObserving:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    if (self.isObserving) {
        RCTLogInfo(@"[GalleryObserver] Already observing");
        resolve(@YES);
        return;
    }
    
    // Check photo library authorization
    PHAuthorizationStatus status = [PHPhotoLibrary authorizationStatus];
    
    if (status == PHAuthorizationStatusNotDetermined) {
        [PHPhotoLibrary requestAuthorization:^(PHAuthorizationStatus authStatus) {
            if (authStatus == PHAuthorizationStatusAuthorized) {
                [self startPhotoLibraryObserver];
                resolve(@YES);
            } else {
                reject(@"permission_denied", @"Photo library permission denied", nil);
            }
        }];
    } else if (status == PHAuthorizationStatusAuthorized) {
        [self startPhotoLibraryObserver];
        resolve(@YES);
    } else {
        reject(@"permission_denied", @"Photo library permission not granted", nil);
    }
}

// Stop observing gallery changes
RCT_EXPORT_METHOD(stopObserving) {
    if (self.isObserving) {
        [[PHPhotoLibrary sharedPhotoLibrary] unregisterChangeObserver:self];
        self.isObserving = NO;
        self.allPhotos = nil;
        RCTLogInfo(@"[GalleryObserver] Stopped observing");
    }
}

// Get initial image count for progress tracking
RCT_EXPORT_METHOD(getInitialImageCount:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    PHFetchOptions *fetchOptions = [[PHFetchOptions alloc] init];
    fetchOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
    PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:fetchOptions];
    resolve(@(assets.count));
}

// Get batch of images for initial scan
RCT_EXPORT_METHOD(getImageBatch:(NSInteger)offset
                  limit:(NSInteger)limit
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    PHFetchOptions *fetchOptions = [[PHFetchOptions alloc] init];
    fetchOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
    PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:fetchOptions];
    
    NSMutableArray *imageBatch = [[NSMutableArray alloc] init];
    NSInteger endIndex = MIN(offset + limit, assets.count);
    
    for (NSInteger i = offset; i < endIndex; i++) {
        PHAsset *asset = assets[i];
        NSString *localIdentifier = asset.localIdentifier;
        NSString *uri = [NSString stringWithFormat:@"ph://%@", localIdentifier];
        
        [imageBatch addObject:@{
            @"uri": uri,
            @"id": localIdentifier,
            @"width": @(asset.pixelWidth),
            @"height": @(asset.pixelHeight),
            @"creationDate": @([asset.creationDate timeIntervalSince1970] * 1000),
            @"modificationDate": @([asset.modificationDate timeIntervalSince1970] * 1000)
        }];
    }
    
    resolve(imageBatch);
}

// Mark images as processed (for tracking)
RCT_EXPORT_METHOD(markAsProcessed:(NSArray<NSString *> *)assetIds) {
    [self.processedAssetIds addObjectsFromArray:assetIds];
    RCTLogInfo(@"[GalleryObserver] Marked %lu images as processed", (unsigned long)assetIds.count);
}

// Clear processed tracking (for reset)
RCT_EXPORT_METHOD(clearProcessedTracking) {
    [self.processedAssetIds removeAllObjects];
    RCTLogInfo(@"[GalleryObserver] Cleared all processed tracking");
}

#pragma mark - Private Methods

// Start the photo library observer
- (void)startPhotoLibraryObserver {
    dispatch_async(dispatch_get_main_queue(), ^{
        // Fetch all photos initially to track changes
        PHFetchOptions *fetchOptions = [[PHFetchOptions alloc] init];
        fetchOptions.sortDescriptors = @[[NSSortDescriptor sortDescriptorWithKey:@"creationDate" ascending:NO]];
        self.allPhotos = [PHAsset fetchAssetsWithMediaType:PHAssetMediaTypeImage options:fetchOptions];
        
        // Register as observer
        [[PHPhotoLibrary sharedPhotoLibrary] registerChangeObserver:self];
        self.isObserving = YES;
        
        RCTLogInfo(@"[GalleryObserver] Started observing. Total images: %lu", (unsigned long)self.allPhotos.count);
    });
}

#pragma mark - PHPhotoLibraryChangeObserver

// Handle photo library changes
- (void)photoLibraryDidChange:(PHChange *)changeInstance {
    if (!self.hasListeners) {
        return; // Don't process if no JS listeners
    }
    
    // Process changes on background queue
    dispatch_async(self.processingQueue, ^{
        PHFetchResultChangeDetails *changes = [changeInstance changeDetailsForFetchResult:self.allPhotos];
        
        if (changes == nil) {
            return;
        }
        
        // Update our cached fetch result
        self.allPhotos = changes.fetchResultAfterChanges;
        
        // Handle insertions (new images)
        if (changes.hasIncrementalChanges && changes.insertedObjects.count > 0) {
            NSMutableArray *newImages = [[NSMutableArray alloc] init];
            
            for (PHAsset *asset in changes.insertedObjects) {
                NSString *localIdentifier = asset.localIdentifier;
                
                // Skip if already processed
                if ([self.processedAssetIds containsObject:localIdentifier]) {
                    continue;
                }
                
                NSString *uri = [NSString stringWithFormat:@"ph://%@", localIdentifier];
                
                [newImages addObject:@{
                    @"uri": uri,
                    @"id": localIdentifier,
                    @"width": @(asset.pixelWidth),
                    @"height": @(asset.pixelHeight),
                    @"creationDate": @([asset.creationDate timeIntervalSince1970] * 1000),
                    @"modificationDate": @([asset.modificationDate timeIntervalSince1970] * 1000),
                    @"mediaType": @"image",
                    @"isNew": @YES
                }];
                
                RCTLogInfo(@"[GalleryObserver] New image detected: %@", localIdentifier);
            }
            
            if (newImages.count > 0) {
                [self sendEventWithName:@"onNewImages" body:@{
                    @"images": newImages,
                    @"count": @(newImages.count),
                    @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000)
                }];
            }
        }
        
        // Handle deletions
        if (changes.hasIncrementalChanges && changes.removedObjects.count > 0) {
            NSMutableArray *deletedIds = [[NSMutableArray alloc] init];
            
            for (PHAsset *asset in changes.removedObjects) {
                [deletedIds addObject:asset.localIdentifier];
                [self.processedAssetIds removeObject:asset.localIdentifier];
            }
            
            if (deletedIds.count > 0) {
                [self sendEventWithName:@"onImagesDeleted" body:@{
                    @"deletedIds": deletedIds,
                    @"count": @(deletedIds.count),
                    @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000)
                }];
                
                RCTLogInfo(@"[GalleryObserver] %lu images deleted", (unsigned long)deletedIds.count);
            }
        }
    });
}

// Override to track JS listeners
- (void)startObserving {
    self.hasListeners = YES;
}

- (void)stopObserving {
    self.hasListeners = NO;
}

- (void)dealloc {
    [self stopObserving];
}

@end