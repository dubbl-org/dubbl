import Observation

enum AppTab: String, Hashable {
    case home, sales, purchases, contacts, more
}

/// Cross-tab navigation, e.g. "Overdue invoices" on the overview opening the
/// Sales tab already filtered. Screens consume the pending value and clear it.
@MainActor @Observable
final class AppRouter {
    var tab: AppTab = .home
    /// An invoice status filter for the Sales tab ("overdue", "draft"...).
    var pendingInvoiceFilter: String?
    /// Which list the Purchases tab should show ("bills" or "expenses") and its filter.
    var pendingPurchases: (segment: String, filter: String?)?
    /// Tilly, open over everything when set.
    var assistant: AssistantLaunch?

    func showInvoices(filter: String?) {
        pendingInvoiceFilter = filter ?? "all"
        tab = .sales
    }

    func showBills(filter: String?) {
        pendingPurchases = ("bills", filter)
        tab = .purchases
    }

    /// Opens Tilly, optionally asking `prompt` straight away.
    func askTilly(_ prompt: String? = nil, page: String? = nil) {
        assistant = AssistantLaunch(prompt: prompt, page: page)
    }

    func showExpenses(filter: String? = nil) {
        pendingPurchases = ("expenses", filter)
        tab = .purchases
    }
}
