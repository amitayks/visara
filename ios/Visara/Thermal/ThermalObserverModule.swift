import Foundation
import React

@objc(ThermalObserverModule)
class ThermalObserverModule: RCTEventEmitter {

    private static let EVENT_THERMAL_STATE_CHANGE = "thermal_state_change"

    private var hasListeners = false

    override init() {
        super.init()
        // iOS 11.0+ API; deployment target 26.0 removes any @available guard (D8).
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(thermalStateDidChange),
            name: ProcessInfo.thermalStateDidChangeNotification,
            object: nil
        )
    }

    @objc
    override static func moduleName() -> String! {
        return "ThermalObserver"
    }

    override func supportedEvents() -> [String]! {
        return [ThermalObserverModule.EVENT_THERMAL_STATE_CHANGE]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // Selector must match the codegen spec exactly (getThermalState:reject:).
    @objc(getThermalState:reject:)
    func getThermalState(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(ThermalObserverModule.payload(for: ProcessInfo.processInfo.thermalState))
    }

    @objc
    private func thermalStateDidChange() {
        guard hasListeners else { return }
        let body = ThermalObserverModule.payload(for: ProcessInfo.processInfo.thermalState)
        sendEvent(withName: ThermalObserverModule.EVENT_THERMAL_STATE_CHANGE, body: body)
    }

    // MARK: - Normalization (D4)

    private static func payload(for state: ProcessInfo.ThermalState) -> [String: Any] {
        let level: Int
        let name: String

        switch state {
        case .nominal:
            level = 0
            name = "nominal"
        case .fair:
            level = 1
            name = "fair"
        case .serious:
            level = 2
            name = "serious"
        case .critical:
            level = 3
            name = "critical"
        @unknown default:
            level = 0
            name = "nominal"
        }

        return [
            "level": level,
            "name": name,
            "rawLevel": state.rawValue
        ]
    }

    // Required for RN 0.81+ TurboModules
    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
