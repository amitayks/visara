import Foundation
import Photos

protocol PhotoLibraryObserverDelegate: AnyObject {
    func photoLibraryDidChange(changes: [[String: Any]])
}

class PhotoLibraryObserver: NSObject, PHPhotoLibraryChangeObserver {
    weak var delegate: PhotoLibraryObserverDelegate?

    private var throttleTimer: Timer?
    private var throttleMs: Int = 5000
    private var pendingChanges: [PHChange] = []
    private var isObserving = false

    func startObserving(throttleMs: Int) {
        guard !isObserving else { return }

        self.throttleMs = throttleMs
        self.isObserving = true

        PHPhotoLibrary.shared().register(self)
    }

    func stopObserving() {
        guard isObserving else { return }

        PHPhotoLibrary.shared().unregisterChangeObserver(self)
        throttleTimer?.invalidate()
        throttleTimer = nil
        pendingChanges.removeAll()
        isObserving = false
    }

    // MARK: - PHPhotoLibraryChangeObserver

    func photoLibraryDidChange(_ changeInstance: PHChange) {
        pendingChanges.append(changeInstance)
        scheduleEmit()
    }

    private func scheduleEmit() {
        throttleTimer?.invalidate()

        throttleTimer = Timer.scheduledTimer(withTimeInterval: TimeInterval(throttleMs) / 1000.0, repeats: false) { [weak self] _ in
            self?.processChanges()
        }
    }

    private func processChanges() {
        guard !pendingChanges.isEmpty else { return }

        var allChanges: [[String: Any]] = []

        for change in pendingChanges {
            let fetchOptions = PHFetchOptions()
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]

            // Check for image changes
            let imagesFetchResult = PHAsset.fetchAssets(with: .image, options: fetchOptions)
            if let imageChanges = change.changeDetails(for: imagesFetchResult) {
                allChanges.append(contentsOf: processAssetChanges(imageChanges))
            }

            // Check for video changes
            let videosFetchResult = PHAsset.fetchAssets(with: .video, options: fetchOptions)
            if let videoChanges = change.changeDetails(for: videosFetchResult) {
                allChanges.append(contentsOf: processAssetChanges(videoChanges))
            }
        }

        pendingChanges.removeAll()

        if !allChanges.isEmpty {
            delegate?.photoLibraryDidChange(changes: allChanges)
        }
    }

    private func processAssetChanges(_ changes: PHFetchResultChangeDetails<PHAsset>) -> [[String: Any]] {
        var result: [[String: Any]] = []

        // Process inserted assets
        changes.insertedObjects.forEach { asset in
            if let mediaChange = convertAssetToMediaChange(asset, action: "added") {
                result.append(mediaChange)
            }
        }

        // Process changed assets
        changes.changedObjects.forEach { asset in
            if let mediaChange = convertAssetToMediaChange(asset, action: "modified") {
                result.append(mediaChange)
            }
        }

        // Note: Deletions are harder to track since we don't have the asset anymore
        // We would need to maintain a cache of asset IDs to detect deletions

        return result
    }

    private func convertAssetToMediaChange(_ asset: PHAsset, action: String) -> [String: Any]? {
        var change: [String: Any] = [:]

        change["action"] = action
        change["uri"] = "ph://\(asset.localIdentifier)"
        change["filename"] = asset.value(forKey: "filename") as? String ?? "unknown"

        // Determine MIME type
        if asset.mediaType == .image {
            change["mimeType"] = "image/jpeg" // Simplified, could check actual format
        } else if asset.mediaType == .video {
            change["mimeType"] = "video/mp4" // Simplified
        }

        change["width"] = asset.pixelWidth
        change["height"] = asset.pixelHeight
        change["fileSize"] = 0 // PHAsset doesn't directly expose file size

        if let creationDate = asset.creationDate {
            change["creationDate"] = Int(creationDate.timeIntervalSince1970 * 1000)
        }

        if let modificationDate = asset.modificationDate {
            change["modificationDate"] = Int(modificationDate.timeIntervalSince1970 * 1000)
        }

        if let location = asset.location {
            change["latitude"] = location.coordinate.latitude
            change["longitude"] = location.coordinate.longitude
        }

        return change
    }

    deinit {
        stopObserving()
    }
}
