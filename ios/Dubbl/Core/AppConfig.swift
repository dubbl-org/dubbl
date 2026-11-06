import Foundation

/// Server configuration, persisted in UserDefaults so it can be read from any
/// isolation domain. One binary serves dubbl Cloud, a self-hosted instance or
/// a local dev server; the choice is made from the sign-in screen.
enum AppConfig {
    static let cloudOrigin = "https://dubbl.dev"
    static let localOrigin = "http://localhost:3000"

    /// The redirect the web's /app-authorize page sends the one-time code to.
    static let callbackScheme = "dubbl"
    static let redirectURI = "dubbl://auth/callback"

    static var serverOrigin: String {
        get { UserDefaults.standard.string(forKey: "server_origin") ?? cloudOrigin }
        set { UserDefaults.standard.set(newValue, forKey: "server_origin") }
    }

    /// The organization the user last worked in, re-selected on next launch.
    static var lastOrganizationID: String? {
        get { UserDefaults.standard.string(forKey: "last_org_id") }
        set { UserDefaults.standard.set(newValue, forKey: "last_org_id") }
    }

    static var originURL: URL? {
        URL(string: serverOrigin.trimmingCharacters(in: .whitespaces))
    }

    /// Everything the app calls lives under `/api/v1`.
    static var apiBaseURL: URL? {
        originURL?.appending(path: "api").appending(path: "v1")
    }

    /// A page of the web app on the same server, for things the app links out to.
    static func webURL(_ path: String) -> URL? {
        URL(string: serverOrigin.trimmingCharacters(in: .whitespaces) + path)
    }

    static var serverHost: String {
        originURL?.host() ?? serverOrigin
    }

    static var isCloud: Bool { serverOrigin == cloudOrigin }

    /// Cleans a typed origin: trims, drops trailing slashes and paths, and adds
    /// the missing scheme (http for localhost, LAN IPs and .local names).
    static func normalizeOrigin(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasSuffix("/") { value.removeLast() }
        guard !value.isEmpty else { return value }
        if !value.contains("://") {
            let host = value.split(separator: "/").first?.split(separator: ":").first.map { $0.lowercased() } ?? ""
            let isLocal = host == "localhost" || host.hasSuffix(".local")
                || (!host.isEmpty && host.allSatisfy { $0.isNumber || $0 == "." })
            value = (isLocal ? "http://" : "https://") + value
        }
        guard let url = URL(string: value), let scheme = url.scheme, let host = url.host() else { return value }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)"
    }
}
