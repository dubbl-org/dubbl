#if DEBUG
import Foundation

/// Debug-only demo mode: launch with `DUBBL_DEMO=1` (for example
/// `SIMCTL_CHILD_DUBBL_DEMO=1 xcrun simctl launch booted dev.dubbl.app`) and the
/// app signs in to a fake organization and answers every request from these
/// fixtures, so screens can be built and screenshotted without a server.
///
/// Fixtures are keyed by API path (under /api/v1). Segments starting with
/// "demo-" match any id, so "invoices/*" serves every invoice. Mutations are
/// looked up as "POST invoices/*/pay"; unknown ones answer `{}`.
/// Each feature contributes its own dictionary in a `+Demo.swift` file.
enum DemoData {
    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["DUBBL_DEMO"] == "1"
    }

    /// Opens straight on a tab: DUBBL_DEMO_TAB=home|sales|purchases|contacts|more
    static var initialTab: AppTab? {
        switch ProcessInfo.processInfo.environment["DUBBL_DEMO_TAB"] {
        case "home": .home
        case "sales": .sales
        case "purchases": .purchases
        case "contacts": .contacts
        case "more", "search": .more
        default: nil
        }
    }

    /// Lets a screen auto-open something for screenshots, e.g. DUBBL_DEMO_OPEN=invoice
    /// (tilly, tilly-ask open the assistant)
    static var open: String? { ProcessInfo.processInfo.environment["DUBBL_DEMO_OPEN"] }

    static let user = User(id: "demo-user", name: "Alex Morgan", email: "alex@northwind.studio", image: nil)
    static let organization = Organization(
        id: "demo-org", name: "Northwind Studio", slug: "northwind", logo: nil,
        defaultCurrency: "USD", countryCode: "US", role: .owner, memberCount: 4
    )

    static let all: [String: String] = {
        var fixtures = [String: String]()
        for set in [core, homeFixtures, salesFixtures, purchasesFixtures, contactsFixtures, searchFixtures, notificationsFixtures, settingsFixtures, assistantFixtures, recordsFixtures] {
            fixtures.merge(set) { $1 }
        }
        return fixtures
    }()

    private static let core: [String: String] = [
        "user/profile": #"{"user":{"id":"demo-user","name":"Alex Morgan","email":"alex@northwind.studio","image":null}}"#,
        "organization": #"{"organizations":[{"id":"demo-org","name":"Northwind Studio","slug":"northwind","logo":null,"defaultCurrency":"USD","countryCode":"US","role":"owner","memberCount":4},{"id":"demo-org-2","name":"Harbor & Pine LLC","slug":"harbor","logo":null,"defaultCurrency":"EUR","countryCode":"DE","role":"admin","memberCount":2}]}"#,
    ]

    static func response(method: String, path: String) -> Data {
        let prefix = method == "GET" ? "" : "\(method) "
        let wildcard = path.split(separator: "/").map { $0.hasPrefix("demo-") ? "*" : String($0) }.joined(separator: "/")
        // A fixture for one exact id wins over the "*" fixture for its kind.
        let body = all[prefix + path] ?? all[prefix + wildcard] ?? "{}"
        return Data(body.utf8)
    }
}
#endif
