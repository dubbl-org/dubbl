import Foundation

// Report shapes the overview reads. Aggregates go through `LenientInt` because
// a few SQL sums arrive as strings.

/// GET reports/aged-receivables and reports/aged-payables: `{ asAt, buckets, grandTotal }`.
/// Buckets are "Current", "1-30 days", "31-60 days", "61-90 days", "90+ days".
struct HomeAgingReport: Decodable, Sendable {
    struct Bucket: Decodable, Sendable, Hashable {
        var label: String
        @LenientInt var total: Int
        @LenientInt var count: Int
    }

    var asAt: String?
    var buckets: [Bucket]
    @LenientInt var grandTotal: Int

    /// Everything past due: every bucket except "Current".
    var overdue: Int { buckets.filter { $0.label != "Current" }.reduce(0) { $0 + $1.total } }
}

/// GET reports/profit-and-loss (top-level fields are the primary period).
struct HomeProfitAndLoss: Decodable, Sendable {
    var startDate: String?
    var endDate: String?
    @LenientInt var totalRevenue: Int
    @LenientInt var totalExpenses: Int
    @LenientInt var netIncome: Int
}

/// GET reports/monthly-trends: `{ months: [{ month: "YYYY-MM", revenue, expenses, netIncome }] }`.
struct HomeMonthlyTrends: Decodable, Sendable {
    struct Month: Decodable, Sendable {
        var month: String
        @LenientInt var revenue: Int
        @LenientInt var expenses: Int
    }

    var months: [Month]

    var points: [TrendPoint] {
        months.compactMap { month in
            guard let date = DubblDate.parseDay(month.month + "-01") else { return nil }
            return TrendPoint(month: date, revenue: month.revenue, expenses: month.expenses)
        }
    }
}

/// GET dashboard/alerts.
struct HomeAlerts: Decodable, Sendable {
    struct Overdue: Decodable, Sendable {
        @LenientInt var count: Int
        @LenientInt var total: Int
    }

    struct Reconciliation: Decodable, Sendable, Hashable {
        var bankAccountId: String
        var bankAccountName: String
        var lastReconDate: String?
    }

    var overdueInvoices: Overdue
    var overdueBills: Overdue
    @LenientInt var uncategorizedTransactions: Int
    var accountsNeedingReconciliation: [Reconciliation]

    var isClear: Bool {
        overdueInvoices.count == 0 && overdueBills.count == 0
            && uncategorizedTransactions == 0 && accountsNeedingReconciliation.isEmpty
    }
}

/// GET reports/cash-flow-forecast: expected receipts and payments over the
/// next few weeks (open invoices, open bills, recurring templates).
struct HomeCashForecast: Decodable, Sendable {
    @LenientInt var totalInflows: Int
    @LenientInt var totalOutflows: Int
    @LenientInt var netForecast: Int
}

/// GET bank-accounts/{id}: `{ bankAccount }`.
struct HomeBankAccountResponse: Decodable, Sendable {
    var bankAccount: BankAccount
}
