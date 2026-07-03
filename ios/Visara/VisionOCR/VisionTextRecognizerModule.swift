import Foundation
import React
import Vision

/// Apple Vision OCR fallback for Tier-0 text recognition (design D5).
///
/// Source-compiled native module (NO vendored binary, NO `EXCLUDED_ARCHS`) so it
/// builds for every iOS arch including the arm64 simulator and cannot reintroduce
/// the GoogleMLKit/executorch link conflict. Mirrors the `MediaObserverModule`
/// pattern (`@objc(...)` Swift + `RCT_EXTERN_MODULE` ObjC). Exposes a single
/// promise method that maps straight onto the JS `TextRecognitionResult` shape.
@objc(VisionTextRecognizerModule)
class VisionTextRecognizerModule: NSObject {

    @objc
    static func moduleName() -> String! {
        return "VisionTextRecognizerModule"
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // Selector must match the codegen spec exactly (recognizeText:resolve:reject:).
    @objc(recognizeText:resolve:reject:)
    func recognizeText(
        _ imagePath: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let url = VisionTextRecognizerModule.fileURL(from: imagePath) else {
            reject(
                "E_UNSUPPORTED_URI",
                "VisionTextRecognizer only supports file paths, got: \(imagePath)",
                nil
            )
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(url: url, options: [:])
            do {
                try handler.perform([request])
            } catch {
                reject("E_VISION_FAILED", error.localizedDescription, error)
                return
            }

            let observations = request.results ?? []

            // Reading order: top-to-bottom, then left-to-right. Vision's
            // normalized boundingBox has a bottom-left origin, so a larger y means
            // higher up in the image (earlier in reading order).
            let sorted = observations.sorted { lhs, rhs in
                if abs(lhs.boundingBox.origin.y - rhs.boundingBox.origin.y) > 0.01 {
                    return lhs.boundingBox.origin.y > rhs.boundingBox.origin.y
                }
                return lhs.boundingBox.origin.x < rhs.boundingBox.origin.x
            }

            var lines: [String] = []
            var blocks: [[String: Any]] = []

            for observation in sorted {
                guard let candidate = observation.topCandidates(1).first else {
                    continue
                }
                lines.append(candidate.string)

                // Convert Vision's normalized bottom-left-origin box to a
                // top-left-origin bbox (x1/y1 top-left, x2/y2 bottom-right),
                // matching the executorch `OCRDetection.bbox` convention.
                let box = observation.boundingBox
                blocks.append([
                    "text": candidate.string,
                    "confidence": candidate.confidence,
                    "bbox": [
                        "x1": box.minX,
                        "y1": 1.0 - box.maxY,
                        "x2": box.maxX,
                        "y2": 1.0 - box.minY,
                    ],
                ])
            }

            let text = lines.joined(separator: " ")

            var blocksJson = "[]"
            if let data = try? JSONSerialization.data(
                withJSONObject: blocks,
                options: []
            ),
                let json = String(data: data, encoding: .utf8) {
                blocksJson = json
            }

            resolve([
                "text": text,
                "blocks": blocksJson
            ])
        }
    }

    private static func fileURL(from path: String) -> URL? {
        if path.hasPrefix("file://") {
            return URL(string: path)
        }
        // PhotoKit-backed URIs (`ph://`, `assets-library://`) require
        // PHImageManager resolution and are not supported by this Tier-0 fallback
        // (POC/native limitation).
        if path.hasPrefix("ph://") || path.hasPrefix("assets-library://") {
            return nil
        }
        return URL(fileURLWithPath: path)
    }
}
