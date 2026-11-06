import AuthenticationServices
import CryptoKit
import UIKit

/// Signs in through the web app in the system browser sheet. The server's own
/// sign-in page handles every method it offers (email and password with 2FA,
/// Google, Apple, SSO), then /app-authorize hands back a one-time code that is
/// bound to this attempt with PKCE.
@MainActor
final class WebSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Failure: LocalizedError {
        case cancelled
        case denied
        case malformedResponse

        var errorDescription: String? {
            switch self {
            case .cancelled: nil
            case .denied: "Sign-in was cancelled in the browser."
            case .malformedResponse: "The server's sign-in response couldn't be read."
            }
        }
    }

    struct Result: Sendable {
        var code: String
        var verifier: String
    }

    private var activeSession: ASWebAuthenticationSession?

    /// `createAccount` starts on the sign-up page instead of sign-in.
    func run(createAccount: Bool) async throws -> Result {
        guard let origin = AppConfig.originURL else { throw APIError.notConfigured }

        let verifier = Self.randomURLSafe(bytes: 32)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(bytes: 16)

        var authorize = URLComponents()
        authorize.path = "/app-authorize"
        authorize.queryItems = [
            .init(name: "redirect_uri", value: AppConfig.redirectURI),
            .init(name: "code_challenge", value: challenge),
            .init(name: "state", value: state),
            .init(name: "platform", value: "ios"),
            .init(name: "device_name", value: UIDevice.current.name),
        ]
        let authorizePath = authorize.string ?? "/app-authorize"

        let start: URL
        if createAccount {
            var signUp = URLComponents(url: origin.appending(path: "sign-up"), resolvingAgainstBaseURL: false)
            signUp?.queryItems = [.init(name: "callbackUrl", value: authorizePath)]
            guard let url = signUp?.url else { throw Failure.malformedResponse }
            start = url
        } else {
            guard let url = URL(string: authorizePath, relativeTo: origin)?.absoluteURL else { throw Failure.malformedResponse }
            start = url
        }

        let callback = try await present(start)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if items.contains(where: { $0.name == "error" }) { throw Failure.denied }
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value
        else { throw Failure.malformedResponse }
        return Result(code: code, verifier: verifier)
    }

    private func present(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callback: .customScheme(AppConfig.callbackScheme)
            ) { [weak self] callbackURL, error in
                Task { @MainActor in self?.activeSession = nil }
                if let error {
                    if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                        continuation.resume(throwing: Failure.cancelled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: Failure.malformedResponse)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            // Reuse the Safari session so someone already signed in on the web
            // only has to tap Continue.
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = self
            activeSession = session
            if !session.start() {
                activeSession = nil
                continuation.resume(throwing: Failure.malformedResponse)
            }
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let key = scenes.flatMap(\.windows).first(where: \.isKeyWindow) { return key }
            return ASPresentationAnchor(windowScene: scenes[0])
        }
    }

    private static func randomURLSafe(bytes count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
