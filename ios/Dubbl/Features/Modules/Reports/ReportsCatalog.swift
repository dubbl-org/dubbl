import SwiftUI

/// Reports (every report in the web's reports panel). Each is a custom screen
/// built on the shared kit in ReportsKit.swift: a period or "as at" picker,
/// the bottom line first, then sections that drill into accounts and records.
@MainActor
enum ReportsCatalog {
    static let specs: [RecordSpec] = []

    static let screens: [RecordScreen] = [
        screen("/reports", "Reports") { ReportsHomeView() },
        // The big picture
        screen("/reports/executive-summary", "Executive summary") { ReportsExecutiveView() },
        screen("/reports/profit-and-loss", "Profit and loss") { ReportsProfitLossView() },
        screen("/reports/balance-sheet", "Balance sheet") { ReportsBalanceSheetView() },
        screen("/reports/cash-flow", "Cash flow") { ReportsCashFlowView() },
        screen("/reports/pack", "Report pack") { ReportsPackView() },
        // Profit and spending
        screen("/reports/tracking", "Tracking") { ReportsTrackingView() },
        screen("/reports/pnl-comparison", "P&L comparison") { ReportsPnLComparisonView() },
        screen("/reports/budget-vs-actual", "Budget vs actual") { ReportsBudgetView() },
        screen("/reports/expense-analytics", "Expense analytics") { ReportsExpenseAnalyticsView() },
        screen("/reports/profitability", "Profitability") { ReportsProfitabilityView() },
        screen("/reports/vendor-spend", "Vendor spend") { ReportsVendorSpendView() },
        screen("/reports/sales-by-customer", "Sales by customer") { ReportsSalesByCustomerView() },
        screen("/reports/sales-by-item", "Sales by item") { ReportsSalesByItemView() },
        // Getting paid
        screen("/reports/aged-receivables", "Aged receivables") { ReportsAgedView(payables: false) },
        screen("/reports/aged-payables", "Aged payables") { ReportsAgedView(payables: true) },
        screen("/reports/payment-performance", "Payment performance") { ReportsPaymentPerformanceView() },
        screen("/reports/duplicate-detection", "Duplicate detection") { ReportsDuplicatesView() },
        // Tax
        screen("/reports/vat-return", "VAT return") { ReportsVatReturnView() },
        screen("/reports/tax-summary", "Tax summary") { ReportsTaxSummaryView() },
        screen("/reports/1099", "1099 totals") { Reports1099View() },
        // Planning
        screen("/reports/cash-flow-forecast", "Cash flow forecast") { ReportsForecastView() },
        screen("/reports/financial-calendar", "Financial calendar") { ReportsCalendarView() },
        screen("/reports/financial-ratios", "Financial ratios") { ReportsRatiosView() },
        // For your accountant
        screen("/reports/trial-balance", "Trial balance") { ReportsTrialBalanceView() },
        screen("/reports/general-ledger", "General ledger") { ReportsGeneralLedgerView() },
        screen("/reports/comparative-balance-sheet", "Comparative balance sheet") { ReportsComparativeView() },
        screen("/reports/consolidation", "Consolidation") { ReportsConsolidationView() },
        // Saved and scheduled
        screen("/reports/bank-reconciliation-status", "Reconciliation status") { ReportsReconciliationView() },
        screen("/reports/bank-cash-flow", "Bank cash flow") { ReportsBankCashFlowView() },
        screen("/reports/custom", "Custom reports") { ReportsCustomView() },
        screen("/reports/saved", "Saved reports") { ReportsSavedView() },
        screen("/reports/schedules", "Schedules") { ReportsSchedulesView() },
    ]

    /// A screen keyed by its web path ("/reports/balance-sheet" -> "reports-balance-sheet").
    private static func screen<V: View>(_ path: String, _ title: String, _ make: @escaping () -> V) -> RecordScreen {
        let key = path.split(separator: "/").joined(separator: "-")
        return RecordScreen(key: key, webPath: path, title: title) { AnyView(make()) }
    }

    #if DEBUG
    nonisolated static let fixtures: [String: String] = ReportsFixtures.all
    #endif
}
