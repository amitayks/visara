import Foundation
import Photos
import React

@objc(MediaObserverModule)
class MediaObserverModule: RCTEventEmitter, PhotoLibraryObserverDelegate {

    private static let BATCH_SIZE = 100
    private static let EVENT_MEDIA_BATCH = "media_batch"
    private static let EVENT_SCAN_COMPLETE = "scan_complete"

    private var photoLibraryObserver: PhotoLibraryObserver?
    private var hasListeners = false

    override init() {
        super.init()
        photoLibraryObserver = PhotoLibraryObserver()
        photoLibraryObserver?.delegate = self
    }

    @objc
    override static func moduleName() -> String! {
        return "MediaObserver"
    }

    override func supportedEvents() -> [String]! {
        return [
            MediaObserverModule.EVENT_MEDIA_BATCH,
            MediaObserverModule.EVENT_SCAN_COMPLETE
        ]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc
    func startInitialScan() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.scanPhotoLibrary(sinceTimestamp: 0)
        }
    }

    @objc
    func getChangesSince(_ timestamp: Double) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.scanPhotoLibrary(sinceTimestamp: Int64(timestamp))
        }
    }

    @objc
    func startObserver(_ throttleMs: Double) {
        photoLibraryObserver?.startObserving(throttleMs: Int(throttleMs))
    }

    @objc
    func stopObserver() {
        photoLibraryObserver?.stopObserving()
    }

    // MARK: - PhotoLibraryObserverDelegate

    func photoLibraryDidChange(changes: [[String: Any]]) {
        guard hasListeners else { return }

        let event: [String: Any] = [
            "changes": changes
        ]

        sendEvent(withName: MediaObserverModule.EVENT_MEDIA_BATCH, body: event)
    }

    // MARK: - Private Methods

    private func scanPhotoLibrary(sinceTimestamp: Int64) {
        let status = PHPhotoLibrary.authorizationStatus()

        guard status == .authorized || status == .limited else {
            // No permission, send empty result
            let completionEvent: [String: Any] = ["total": 0]
            sendEvent(withName: MediaObserverModule.EVENT_SCAN_COMPLETE, body: completionEvent)
            return
        }

        var allChanges: [[String: Any]] = []

        // Fetch images
        let imageOptions = PHFetchOptions()
        if sinceTimestamp > 0 {
            let date = Date(timeIntervalSince1970: TimeInterval(sinceTimestamp) / 1000.0)
            imageOptions.predicate = NSPredicate(format: "modificationDate > %@", date as NSDate)
        }
        imageOptions.sortDescriptors = [NSSortDescriptor(key: "modificationDate", ascending: true)]

        let images = PHAsset.fetchAssets(with: .image, options: imageOptions)
        allChanges.append(contentsOf: processAssets(images, action: sinceTimestamp > 0 ? "modified" : "added"))

        // Fetch videos
        let videoOptions = PHFetchOptions()
        if sinceTimestamp > 0 {
            let date = Date(timeIntervalSince1970: TimeInterval(sinceTimestamp) / 1000.0)
            videoOptions.predicate = NSPredicate(format: "modificationDate > %@", date as NSDate)
        }
        videoOptions.sortDescriptors = [NSSortDescriptor(key: "modificationDate", ascending: true)]

        let videos = PHAsset.fetchAssets(with: .video, options: videoOptions)
        allChanges.append(contentsOf: processAssets(videos, action: sinceTimestamp > 0 ? "modified" : "added"))

        // Send batches
        sendBatches(changes: allChanges)

        // Send completion event
        let completionEvent: [String: Any] = ["total": allChanges.count]
        sendEvent(withName: MediaObserverModule.EVENT_SCAN_COMPLETE, body: completionEvent)
    }

    private func processAssets(_ fetchResult: PHFetchResult<PHAsset>, action: String) -> [[String: Any]] {
        var results: [[String: Any]] = []

        fetchResult.enumerateObjects { asset, _, _ in
            var change: [String: Any] = [:]

            change["action"] = action
            change["uri"] = "ph://\(asset.localIdentifier)"

            // Get filename - PHAsset doesn't directly expose filename, use a workaround
            let resources = PHAssetResource.assetResources(for: asset)
            if let resource = resources.first {
                change["filename"] = resource.originalFilename
            } else {
                change["filename"] = "unknown"
            }

            // Determine MIME type
            if asset.mediaType == .image {
                change["mimeType"] = "image/jpeg" // Simplified
            } else if asset.mediaType == .video {
                change["mimeType"] = "video/mp4" // Simplified
            }

            change["width"] = asset.pixelWidth
            change["height"] = asset.pixelHeight

            // Get file size
            if let resource = PHAssetResource.assetResources(for: asset).first,
               let unsignedInt64 = resource.value(forKey: "fileSize") as? CLong {
                change["fileSize"] = unsignedInt64
            } else {
                change["fileSize"] = 0
            }

            if let creationDate = asset.creationDate {
                change["creationDate"] = Int(creationDate.timeIntervalSince1970 * 1000)
            } else {
                change["creationDate"] = 0
            }

            if let modificationDate = asset.modificationDate {
                change["modificationDate"] = Int(modificationDate.timeIntervalSince1970 * 1000)
            } else {
                change["modificationDate"] = 0
            }

            if let location = asset.location {
                change["latitude"] = location.coordinate.latitude
                change["longitude"] = location.coordinate.longitude
            }

            results.append(change)
        }

        return results
    }

    private func sendBatches(changes: [[String: Any]]) {
        guard hasListeners else { return }

        var index = 0
        while index < changes.count {
            let end = min(index + MediaObserverModule.BATCH_SIZE, changes.count)
            let batch = Array(changes[index..<end])

            let event: [String: Any] = [
                "changes": batch
            ]

            sendEvent(withName: MediaObserverModule.EVENT_MEDIA_BATCH, body: event)

            index = end
        }
    }

    // Required for RN 0.81+ TurboModules
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    deinit {
        photoLibraryObserver?.stopObserving()
    }
}
