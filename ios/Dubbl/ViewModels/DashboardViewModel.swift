import Foundation

struct DashboardSummary {
    var totalRevenue: Int = 0
    var totalExpenses: Int = 0
    var totalOutstanding: Int = 0
    var totalOverdue: Int = 0
    var invoiceCount: Int = 0
    var billCount: Int = 0
    var bankBalance: Int = 0
    var recentInvoices: [Invoice] = []
    var recentBills: [Bill] = []
    var overdueInvoices: [Invoice] = []
}

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var summary = DashboardSummary()
    @Published var isLoading = false
    @Published var error: String?

    private let invoiceService = InvoiceService()
    private let billService = BillService()
    private let bankService = BankService()

    func load() async {
        isLoading = true
        error = nil

        do {
            async let invoicesResult = invoiceService.list(page: 1, limit: 10)
            async let overdueResult = invoiceService.list(page: 1, limit: 5, status: "overdue")
            async let billsResult = billService.list(page: 1, limit: 10)
            async let bankResult = bankService.listAccounts(page: 1, limit: 50)

            let (invoices, overdue, bills, banks) = try await (invoicesResult, overdueResult, billsResult, bankResult)

            summary.recentInvoices = invoices.data
            summary.invoiceCount = invoices.total ?? invoices.data.count
            summary.overdueInvoices = overdue.data

            summary.recentBills = bills.data
            summary.billCount = bills.total ?? bills.data.count

            summary.totalRevenue = invoices.data
                .filter { $0.status == .paid }
                .compactMap(\.total)
                .reduce(0, +)

            summary.totalOutstanding = invoices.data
                .compactMap(\.amountDue)
                .reduce(0, +)

            summary.totalOverdue = overdue.data
                .compactMap(\.amountDue)
                .reduce(0, +)

            summary.totalExpenses = bills.data
                .filter { $0.status == .paid }
                .compactMap(\.total)
                .reduce(0, +)

            summary.bankBalance = banks.data
                .compactMap(\.balance)
                .reduce(0, +)

        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }

        isLoading = false
    }
}
