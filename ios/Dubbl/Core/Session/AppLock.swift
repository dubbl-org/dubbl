import LocalAuthentication
import Observation
import SwiftUI

/// Optional Face ID / passcode lock. When on, the app locks whenever it goes
/// to the background and asks again on return.
@MainActor @Observable
final class AppLock {
    private static let key = "app_lock_enabled"

    private(set) var isLocked: Bool
    private var isAuthenticating = false

    var isEnabled: Bool {
        didSet { UserDefaults.standard.set(isEnabled, forKey: Self.key) }
    }

    init() {
        let enabled = UserDefaults.standard.bool(forKey: Self.key)
        isEnabled = enabled
        isLocked = enabled
    }

    /// "Face ID", "Touch ID" or "Passcode", for settings copy.
    var biometryName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Passcode"
        }
    }

    var biometrySymbol: String {
        switch biometryName {
        case "Face ID": "faceid"
        case "Touch ID": "touchid"
        case "Optic ID": "opticid"
        default: "lock"
        }
    }

    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    func scenePhaseChanged(_ phase: ScenePhase) {
        if phase == .background, isEnabled { isLocked = true }
    }

    /// Ask for Face ID (falling back to the passcode). Returns whether it passed.
    @discardableResult
    func unlock() async -> Bool {
        guard isLocked, !isAuthenticating else { return !isLocked }
        isAuthenticating = true
        defer { isAuthenticating = false }
        let context = LAContext()
        let passed = (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock your books")) ?? false
        if passed { isLocked = false }
        return passed
    }

    /// Turning the lock on asks first, so nobody locks themselves out.
    func setEnabled(_ enabled: Bool) async {
        guard enabled else {
            isEnabled = false
            return
        }
        let context = LAContext()
        let passed = (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Turn on app lock")) ?? false
        isEnabled = passed
    }

    func reset() {
        isLocked = false
    }
}
