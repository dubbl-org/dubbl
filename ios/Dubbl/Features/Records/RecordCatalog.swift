import SwiftUI

/// Every native list and screen, keyed by the web page it replaces. Each area
/// keeps its own catalog in Features/Modules/<Area>/; this only joins them.
@MainActor
enum RecordCatalog {
    static let specs: [RecordSpec] =
        SalesCatalog.specs + PurchasingCatalog.specs + ContactsCatalog.specs + AccountingCatalog.specs
        + TaxCatalog.specs + ReportsCatalog.specs + OperationsCatalog.specs + PayrollCatalog.specs
        + OrganizationCatalog.specs

    static let screens: [RecordScreen] =
        SalesCatalog.screens + PurchasingCatalog.screens + ContactsCatalog.screens + AccountingCatalog.screens
        + TaxCatalog.screens + ReportsCatalog.screens + OperationsCatalog.screens + PayrollCatalog.screens
        + OrganizationCatalog.screens

    static func spec(_ key: String) -> RecordSpec? {
        specs.first { $0.key == key }
    }

    /// True when the app has its own screen for a web path.
    static func hasPage(_ path: String) -> Bool {
        screens.contains { $0.webPath == path } || specs.contains { $0.webPath == path }
    }

    /// The native screen for a web path: a custom screen first, then a list.
    @ViewBuilder
    static func page(_ path: String) -> some View {
        if let screen = screens.first(where: { $0.webPath == path }) {
            screen.make()
        } else if let spec = specs.first(where: { $0.webPath == path }) {
            RecordListView(spec: spec)
        } else {
            EmptyStateView(symbol: "hammer", title: "Coming soon", message: "This page isn't in the app yet.")
        }
    }

    @ViewBuilder
    static func detail(_ route: RecordRoute) -> some View {
        if let spec = spec(route.spec) {
            if let custom = spec.detail {
                custom(route.id)
            } else {
                RecordDetailView(spec: spec, id: route.id)
            }
        }
    }
}

#if DEBUG
extension DemoData {
    /// Fixtures for every area's records, merged into DemoData.all.
    static var recordsFixtures: [String: String] {
        var fixtures = [String: String]()
        for set in [SalesCatalog.fixtures, PurchasingCatalog.fixtures, ContactsCatalog.fixtures, AccountingCatalog.fixtures,
                    TaxCatalog.fixtures, ReportsCatalog.fixtures, OperationsCatalog.fixtures, PayrollCatalog.fixtures,
                    OrganizationCatalog.fixtures] {
            fixtures.merge(set) { $1 }
        }
        return fixtures
    }
}
#endif
