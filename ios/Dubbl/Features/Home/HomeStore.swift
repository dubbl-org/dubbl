import SwiftUI

/// The overview's data. Every card loads in parallel and on its own: a failed
/// request leaves that card empty (a dash) instead of failing the screen, and
/// a refresh keeps the last good value when a request fails.
@MainActor @Observable
final class HomeStore {
    private(set) var accounts: [BankAccount]?
    private(set) var receivables: HomeAgingReport?
    private(set) var payables: HomeAgingReport?
    private(set) var profit: HomeProfitAndLoss?
    private(set) var trend: [TrendPoint]?
    private(set) var alerts: HomeAlerts?
    private(set) var forecast: HomeCashForecast?
    private(set) var unreadCount = 0
    private(set) var hasLoaded = false

    private var generation = 0

    var activeAccounts: [BankAccount]? { accounts?.filter(\.isActive) }

    /// Cash across active accounts in the organization's currency.
    func cash(in currency: String) -> Int? {
        activeAccounts?.filter { $0.currencyCode == currency }.reduce(0) { $0 + $1.balance }
    }

    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        let today = Date()
        let year = Calendar.current.component(.year, from: today)

        async let accounts: BankAccountsResponse? = try? api.get("bank-accounts")
        async let receivables: HomeAgingReport? = try? api.get("reports/aged-receivables")
        async let payables: HomeAgingReport? = try? api.get("reports/aged-payables")
        async let profit: HomeProfitAndLoss? = try? api.get(
            "reports/profit-and-loss",
            query: ["startDate": "\(year)-01-01", "endDate": DubblDate.string(today)]
        )
        async let trend: HomeMonthlyTrends? = try? api.get("reports/monthly-trends", query: ["months": "6"])
        async let alerts: HomeAlerts? = try? api.get("dashboard/alerts")
        async let forecast: HomeCashForecast? = try? api.get("reports/cash-flow-forecast", query: ["weeks": "4"])
        async let notifications: NotificationsPage? = try? api.get("notifications", query: ["limit": "1"])

        let results = await (accounts, receivables, payables, profit, trend, alerts, forecast, notifications)
        guard current == generation else { return }

        withAnimation(.snappy) {
            self.accounts = results.0?.bankAccounts ?? self.accounts
            self.receivables = results.1 ?? self.receivables
            self.payables = results.2 ?? self.payables
            self.profit = results.3 ?? self.profit
            self.trend = results.4?.points ?? self.trend
            self.alerts = results.5 ?? self.alerts
            self.forecast = results.6 ?? self.forecast
            if let page = results.7 { self.unreadCount = page.unreadCount }
            hasLoaded = true
        }
    }

    /// Just the bell, after coming back from the inbox.
    func refreshUnread(_ api: APIClient) async {
        guard let page: NotificationsPage = try? await api.get("notifications", query: ["limit": "1"]) else { return }
        withAnimation(.snappy) { unreadCount = page.unreadCount }
    }
}
