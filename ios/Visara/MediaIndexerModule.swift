import Foundation
import Photos
import React

/// MediaIndexer TurboModule (media-indexer-native spec, design D7).
///
/// Streams the accessible photo library as minimal records
/// (`indexer_batch`* -> `indexer_scan_complete`), reports cross-launch deltas
/// via PHPersistentChange tokens, emits throttled `indexer_changed` pokes
/// while observing, and fronts authorization + OS-confirmed deletion.
/// Replaces the legacy MediaObserver module.
@objc(MediaIndexerModule)
class MediaIndexerModule: RCTEventEmitter, PHPhotoLibraryChangeObserver {

    private static let EVENT_BATCH = "indexer_batch"
    private static let EVENT_SCAN_COMPLETE = "indexer_scan_complete"
    private static let EVENT_CHANGED = "indexer_changed"

    /// Serializes observer registration state and poke coalescing.
    private let observerQueue = DispatchQueue(label: "com.visara.mediaindexer.observer")
    private var isLibraryObserving = false
    private var pendingPoke: DispatchWorkItem?
    private var throttleMs = 2000

    @objc
    override static func moduleName() -> String! {
        return "MediaIndexer"
    }

    override func supportedEvents() -> [String]! {
        return [
            MediaIndexerModule.EVENT_BATCH,
            MediaIndexerModule.EVENT_SCAN_COMPLETE,
            MediaIndexerModule.EVENT_CHANGED
        ]
    }

    // Required for RN 0.81+ TurboModules
    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // MARK: - Full scan (indexer_batch* -> indexer_scan_complete)

    @objc(startFullScan:)
    func startFullScan(_ batchSize: Double) {
        let clamped = batchSize.isFinite ? min(max(batchSize, 1), 100_000) : 500
        let size = Int(clamped)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runFullScan(batchSize: size)
        }
    }

    /// iOS has no shared PDF store: complete immediately with an empty scan.
    @objc
    func startPdfScan() {
        sendEvent(
            withName: MediaIndexerModule.EVENT_SCAN_COMPLETE,
            body: ["total": 0, "token": ""]
        )
    }

    private func runFullScan(batchSize: Int) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            sendEvent(
                withName: MediaIndexerModule.EVENT_SCAN_COMPLETE,
                body: ["total": 0, "token": ""]
            )
            return
        }

        // Capture the change token BEFORE enumerating: anything landing
        // mid-scan is re-reported by the next changesSince (upserts dedup).
        let tokenJson = MediaIndexerModule.encodeToken(PHPhotoLibrary.shared().currentChangeToken)

        // NO predicate and NO sort descriptors — keeps the fetch near-instant
        // on six-figure libraries (D7). Sorting happens in native memory below.
        let options: PHFetchOptions? = nil
        let assets = PHAsset.fetchAssets(with: options)

        var items: [ScanItem] = []
        items.reserveCapacity(assets.count)

        assets.enumerateObjects { asset, _, _ in
            // Cached-property reads only (localIdentifier, creationDate,
            // mediaType, pixel sizes, KVC filename). Never PHAssetResource
            // in the scan path — that is the fat-payload freeze of old.
            guard let item = MediaIndexerModule.scanItem(for: asset) else { return }
            items.append(item)
        }

        // creationDate DESC; nil dates carry takenAt == 0 and sink to the end.
        items.sort { $0.takenAt > $1.takenAt }

        var index = 0
        while index < items.count {
            let end = min(index + batchSize, items.count)
            autoreleasepool {
                let batch = items[index..<end].map { MediaIndexerModule.payload(for: $0) }
                sendEvent(withName: MediaIndexerModule.EVENT_BATCH, body: ["items": batch])
            }
            index = end
        }

        sendEvent(
            withName: MediaIndexerModule.EVENT_SCAN_COMPLETE,
            body: ["total": items.count, "token": tokenJson]
        )
    }

    // MARK: - Cross-launch deltas (PHPersistentChange history)

    @objc(changesSince:resolve:reject:)
    func changesSince(
        _ token: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            resolve(MediaIndexerModule.computeChanges(sinceTokenJson: token))
        }
    }

    private static func computeChanges(sinceTokenJson: String) -> [String: Any] {
        guard let sinceToken = decodeToken(sinceTokenJson) else {
            return fullRescanResult()
        }

        do {
            let changes = try PHPhotoLibrary.shared().fetchPersistentChanges(since: sinceToken)

            var inserted = Set<String>()
            var updated = Set<String>()
            var deleted = Set<String>()
            var lastToken = sinceToken

            for change in changes {
                lastToken = change.changeToken
                let details = try change.changeDetails(for: .asset)
                for id in details.insertedLocalIdentifiers {
                    inserted.insert(id)
                    deleted.remove(id)
                }
                for id in details.updatedLocalIdentifiers where !inserted.contains(id) {
                    updated.insert(id)
                }
                for id in details.deletedLocalIdentifiers {
                    deleted.insert(id)
                    inserted.remove(id)
                    updated.remove(id)
                }
            }

            return [
                "added": payloads(forLocalIdentifiers: Array(inserted)),
                "updated": payloads(forLocalIdentifiers: Array(updated)),
                "deletedIds": Array(deleted),
                "newToken": encodeToken(lastToken),
                "full": false
            ]
        } catch {
            // Expired token / unavailable details / any Photos failure is a
            // routine degradation: hand back a fresh token, caller runs a
            // fullScan + reconcile. Never reject (spec).
            return fullRescanResult()
        }
    }

    private static func fullRescanResult() -> [String: Any] {
        return [
            "added": [] as [[String: Any]],
            "updated": [] as [[String: Any]],
            "deletedIds": [] as [String],
            "newToken": currentTokenJsonIfAuthorized(),
            "full": true
        ]
    }

    private static func payloads(forLocalIdentifiers ids: [String]) -> [[String: Any]] {
        guard !ids.isEmpty else { return [] }
        let fetched = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        var result: [[String: Any]] = []
        result.reserveCapacity(fetched.count)
        fetched.enumerateObjects { asset, _, _ in
            guard let item = MediaIndexerModule.scanItem(for: asset) else { return }
            result.append(MediaIndexerModule.payload(for: item))
        }
        return result
    }

    // MARK: - Live observation (indexer_changed pokes)

    @objc(startObserving:)
    func startObserving(_ throttleMs: Double) {
        let clamped = throttleMs.isFinite ? min(max(throttleMs, 0), 3_600_000) : 2000
        observerQueue.async { [weak self] in
            guard let self = self else { return }
            self.throttleMs = Int(clamped)
            guard !self.isLibraryObserving else { return }
            self.isLibraryObserving = true
            PHPhotoLibrary.shared().register(self)
        }
    }

    /// Spec method AND the RCTEventEmitter hook (identical selector): both
    /// mean "stop emitting pokes". RN also lands here when the last JS
    /// listener detaches and on invalidate — the right teardown either way.
    override func stopObserving() {
        observerQueue.async { [weak self] in
            self?.unregisterLibraryObserver()
        }
    }

    private func unregisterLibraryObserver() {
        pendingPoke?.cancel()
        pendingPoke = nil
        guard isLibraryObserving else { return }
        isLibraryObserving = false
        PHPhotoLibrary.shared().unregisterChangeObserver(self)
    }

    // MARK: - PHPhotoLibraryChangeObserver (arbitrary serial queue)

    func photoLibraryDidChange(_ changeInstance: PHChange) {
        observerQueue.async { [weak self] in
            guard let self = self, self.isLibraryObserving, self.pendingPoke == nil else { return }
            // Coalesce: one scheduled poke absorbs every change in the
            // throttle window; changesSince pulls the actual delta.
            let poke = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.pendingPoke = nil
                guard self.isLibraryObserving else { return }
                self.sendEvent(withName: MediaIndexerModule.EVENT_CHANGED, body: [:])
            }
            self.pendingPoke = poke
            self.observerQueue.asyncAfter(
                deadline: .now() + .milliseconds(self.throttleMs),
                execute: poke
            )
        }
    }

    // MARK: - Authorization

    @objc(requestAccess:reject:)
    func requestAccess(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            resolve(MediaIndexerModule.accessString(for: status))
        }
    }

    @objc(getAccessStatus:reject:)
    func getAccessStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(MediaIndexerModule.accessString(for: PHPhotoLibrary.authorizationStatus(for: .readWrite)))
    }

    private static func accessString(for status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized:
            return "granted"
        case .limited:
            return "limited"
        default:
            return "denied"
        }
    }

    // MARK: - OS-confirmed deletion

    @objc(deleteAssets:resolve:reject:)
    func deleteAssets(
        _ ids: [String],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async {
            let fetched = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
            guard fetched.count > 0 else {
                resolve(["deleted": [] as [String]])
                return
            }

            var targetIds: [String] = []
            targetIds.reserveCapacity(fetched.count)
            fetched.enumerateObjects { asset, _, _ in
                targetIds.append(asset.localIdentifier)
            }

            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.deleteAssets(fetched)
            }) { success, error in
                if success {
                    resolve(["deleted": targetIds])
                    return
                }
                if let photosError = error as? PHPhotosError, photosError.code == .userCancelled {
                    // Declining the system dialog is not an error (spec).
                    resolve(["deleted": [] as [String]])
                    return
                }
                reject(
                    "E_DELETE_FAILED",
                    error?.localizedDescription ?? "Asset deletion failed",
                    error
                )
            }
        }
    }

    // MARK: - Token codec ({"v":1,"ios":"<base64 NSKeyedArchiver>"})

    private static func currentTokenJsonIfAuthorized() -> String {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else { return "" }
        return encodeToken(PHPhotoLibrary.shared().currentChangeToken)
    }

    private static func encodeToken(_ token: PHPersistentChangeToken) -> String {
        guard
            let archived = try? NSKeyedArchiver.archivedData(
                withRootObject: token,
                requiringSecureCoding: true
            )
        else {
            return ""
        }
        let payload: [String: Any] = ["v": 1, "ios": archived.base64EncodedString()]
        guard
            let json = try? JSONSerialization.data(withJSONObject: payload),
            let string = String(data: json, encoding: .utf8)
        else {
            return ""
        }
        return string
    }

    private static func decodeToken(_ tokenJson: String) -> PHPersistentChangeToken? {
        guard
            let data = tokenJson.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let base64 = object["ios"] as? String,
            let archived = Data(base64Encoded: base64),
            let token = try? NSKeyedUnarchiver.unarchivedObject(
                ofClass: PHPersistentChangeToken.self,
                from: archived
            )
        else {
            return nil
        }
        return token
    }

    // MARK: - Minimal record mapping (MediaItemPayload)

    private struct ScanItem {
        let id: String
        let filename: String
        let mimeType: String
        let kind: String
        let width: Int
        let height: Int
        let takenAt: Int64
    }

    private static func scanItem(for asset: PHAsset) -> ScanItem? {
        let kind: String
        switch asset.mediaType {
        case .image:
            kind = "image"
        case .video:
            kind = "video"
        default:
            return nil
        }

        let filename = (asset.value(forKey: "filename") as? String) ?? "unknown"

        let takenAt: Int64
        if let creationDate = asset.creationDate {
            takenAt = Int64(creationDate.timeIntervalSince1970 * 1000)
        } else {
            takenAt = 0
        }

        return ScanItem(
            id: asset.localIdentifier,
            filename: filename,
            mimeType: mime(forFilename: filename, mediaType: asset.mediaType),
            kind: kind,
            width: asset.pixelWidth,
            height: asset.pixelHeight,
            takenAt: takenAt
        )
    }

    private static func payload(for item: ScanItem) -> [String: Any] {
        return [
            "id": item.id,
            "uri": "ph://" + item.id,
            "filename": item.filename,
            "mimeType": item.mimeType,
            "kind": item.kind,
            "width": item.width,
            "height": item.height,
            // Never touch PHAssetResource in the scan path: size stays 0.
            "fileSize": 0,
            "takenAt": item.takenAt
        ]
    }

    private static func mime(forFilename filename: String, mediaType: PHAssetMediaType) -> String {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg":
            return "image/jpeg"
        case "png":
            return "image/png"
        case "heic":
            return "image/heic"
        case "heif":
            return "image/heif"
        case "gif":
            return "image/gif"
        case "webp":
            return "image/webp"
        case "tiff", "tif":
            return "image/tiff"
        case "bmp":
            return "image/bmp"
        case "dng":
            return "image/x-adobe-dng"
        case "avif":
            return "image/avif"
        case "mp4":
            return "video/mp4"
        case "mov":
            return "video/quicktime"
        case "m4v":
            return "video/x-m4v"
        case "avi":
            return "video/x-msvideo"
        case "3gp":
            return "video/3gpp"
        case "webm":
            return "video/webm"
        case "mkv":
            return "video/x-matroska"
        default:
            return mediaType == .video ? "video/mp4" : "image/jpeg"
        }
    }

    deinit {
        // Queue blocks hold self weakly, so deinit sees quiescent state.
        pendingPoke?.cancel()
        if isLibraryObserving {
            PHPhotoLibrary.shared().unregisterChangeObserver(self)
        }
    }
}
