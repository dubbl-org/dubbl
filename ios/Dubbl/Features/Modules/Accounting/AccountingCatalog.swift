import SwiftUI

/// Accounting (transactions, chart of accounts, banking, assets, loans, budgets, adjustments, year end).
@MainActor
enum AccountingCatalog {
    static let entriesKey = "journal-entries"
    static let accountsKey = "chart-accounts"
    static let scheduledKey = "scheduled-payments"
    static let batchesKey = "payment-batches"
    static let assetsKey = "fixed-assets"
    static let categoriesKey = "asset-categories"
    static let loansKey = "loans"
    static let budgetsKey = "budgets"
    static let accrualsKey = "accruals"
    static let recurringKey = "recurring-journals"
    static let yearsKey = "fiscal-years"

    static let specs: [RecordSpec] = [entries, accounts, batches, assets, categories, loans, budgets, accruals, recurring]

    static let screens: [RecordScreen] = [
        RecordScreen(key: "accounting-transactions", webPath: "/accounting", title: "Transactions") { AnyView(AccountingTransactionsView()) },
        RecordScreen(key: "accounting-accounts", webPath: "/accounting/accounts", title: "Chart of accounts") { AnyView(AccountingAccountsView()) },
        RecordScreen(key: "accounting-categories", webPath: "/accounting/asset-categories", title: "Asset categories") { AnyView(AccountingCategoriesView()) },
        RecordScreen(key: "accounting-scheduled", webPath: "/accounting/banking/scheduled", title: "Scheduled payments") { AnyView(AccountingScheduledPaymentsView()) },
        RecordScreen(key: "accounting-fiscal-years", webPath: "/accounting/fiscal-years", title: "Financial years") { AnyView(AccountingFiscalYearsView()) },
        RecordScreen(key: "accounting-opening-balances", webPath: "/accounting/opening-balances", title: "Opening balances") { AnyView(AccountingOpeningBalancesView()) },
    ]

    /// Journal entries. The list is a custom screen (`totalDebit` is a decimal
    /// string); this spec exists so `RecordRoute(spec: "journal-entries")`
    /// opens an entry from anywhere.
    static let entries = RecordSpec(
        key: entriesKey,
        webPath: "/accounting",
        title: "Transactions",
        singular: "Journal entry",
        symbol: "list.bullet.rectangle",
        endpoint: "entries",
        listKey: "entries",
        detailKey: "entry",
        searchParam: nil,
        row: RecordRow(title: ["description"], number: "entryNumber", date: "date"),
        detail: { AnyView(AccountingEntryDetailView(id: $0)) }
    )

    /// Chart accounts; the grouped list with balances is a custom screen.
    static let accounts = RecordSpec(
        key: accountsKey,
        webPath: "/accounting/accounts",
        title: "Chart of accounts",
        singular: "Account",
        symbol: "list.number",
        endpoint: "accounts",
        listKey: "accounts",
        paged: false,
        searchParam: nil,
        row: RecordRow(title: ["name"], number: "code", status: nil),
        detail: { AnyView(AccountingAccountDetailView(id: $0)) }
    )

    /// `GET payment-batches` (paginated, no filters), `GET payment-batches/{id}`
    /// -> `{ batch }` with items (bill and contact); submit pays every item.
    static let batches = RecordSpec(
        key: batchesKey,
        webPath: "/accounting/banking/batches",
        title: "Payment batches",
        singular: "Payment batch",
        symbol: "square.stack.3d.up",
        endpoint: "payment-batches",
        detailKey: "batch",
        searchParam: nil,
        row: RecordRow(title: ["name"], amount: "totalAmount", date: "createdAt"),
        tones: ["draft": .neutral, "submitted": .info, "completed": .positive],
        hiddenFields: ["paymentCount"],
        actions: [
            RecordAction(title: "Pay batch", symbol: "paperplane", path: "submit", statuses: ["draft"], confirm: "Pay every bill in this batch now?", primary: true),
        ],
        totals: [
            RecordTotal(label: "To pay", field: "totalAmount", statuses: ["draft", "submitted"], tone: .info),
            RecordTotal(label: "Paid", field: "totalAmount", statuses: ["completed"], tone: .positive),
        ],
        emptyMessage: "Group bills into a batch on the web to pay them in one go.",
        tillyPrompt: "Which bills should go in my next payment run?"
    )

    /// `GET fixed-assets` (paginated, `status=`), `GET fixed-assets/{id}` ->
    /// `{ asset }` with category, accounts and depreciation entries.
    static let assets = RecordSpec(
        key: assetsKey,
        webPath: "/accounting/fixed-assets",
        title: "Fixed assets",
        singular: "Fixed asset",
        symbol: "desktopcomputer",
        endpoint: "fixed-assets",
        detailKey: "asset",
        searchParam: nil,
        statuses: [
            RecordStatus("active", "Active"), RecordStatus("in_progress", "In progress"),
            RecordStatus("fully_depreciated", "Fully depreciated"), RecordStatus("disposed", "Disposed"),
        ],
        row: RecordRow(title: ["name"], number: "assetNumber", amount: "netBookValue", date: "purchaseDate"),
        tones: ["active": .positive, "fully_depreciated": .info, "disposed": .neutral, "in_progress": .warning],
        totals: [
            RecordTotal(label: "Book value", field: "netBookValue", statuses: ["active", "fully_depreciated", "in_progress"], tone: .positive),
            RecordTotal(label: "Cost", field: "purchasePrice", statuses: ["active", "fully_depreciated", "in_progress"], tone: .info),
        ],
        create: { done in AnyView(AccountingNewAssetSheet(onDone: done)) },
        detail: { AnyView(AccountingAssetDetailView(id: $0)) },
        emptyMessage: "Equipment, furniture and vehicles you depreciate show up here.",
        tillyPrompt: "Which assets are close to fully depreciated?"
    )

    /// `GET asset-categories` (paginated), `GET asset-categories/{id}` -> `{ category }`.
    /// The list is a custom screen so the defaults read in words.
    static let categories = RecordSpec(
        key: categoriesKey,
        webPath: "/accounting/asset-categories",
        title: "Asset categories",
        singular: "Asset category",
        symbol: "folder",
        endpoint: "asset-categories",
        detailKey: "category",
        searchParam: nil,
        row: RecordRow(title: ["name"], status: nil),
        create: { done in AnyView(AccountingNewCategorySheet(onDone: done)) },
        detail: { AnyView(AccountingCategoryDetailView(id: $0)) },
        emptyMessage: "Categories set the depreciation defaults for new assets."
    )

    /// `GET loans` (paginated), `GET loans/{id}` -> `{ loan, schedule }`;
    /// post-payment posts the next unposted period.
    static let loans = RecordSpec(
        key: loansKey,
        webPath: "/accounting/loans",
        title: "Loans",
        singular: "Loan",
        symbol: "percent",
        endpoint: "loans",
        detailKey: "loan",
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["interestRate"], amount: "principalAmount", date: "startDate"),
        tones: ["active": .info, "paid_off": .positive, "defaulted": .negative],
        totals: [
            RecordTotal(label: "Borrowed", field: "principalAmount", statuses: ["active"], tone: .info),
            RecordTotal(label: "Monthly", field: "monthlyPayment", statuses: ["active"], tone: .orange),
        ],
        create: { done in AnyView(AccountingNewLoanSheet(onDone: done)) },
        detail: { AnyView(AccountingLoanDetailView(id: $0)) },
        emptyMessage: "Business loans and their repayment schedules show up here.",
        tillyPrompt: "How much interest am I paying across my loans?"
    )

    /// `GET budgets` (paginated); the detail reads budget-vs-actual for the budget.
    static let budgets = RecordSpec(
        key: budgetsKey,
        webPath: "/accounting/budgets",
        title: "Budgets",
        singular: "Budget",
        symbol: "chart.bar",
        endpoint: "budgets",
        detailKey: "budget",
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["fiscalYear.name", "periodType"], status: nil, date: "startDate"),
        detail: { AnyView(AccountingBudgetDetailView(id: $0)) },
        emptyMessage: "Set budgets on the web, then track them against actuals here.",
        tillyPrompt: "Where am I over budget this year?"
    )

    /// `GET accrual-schedules` (paginated), `GET accrual-schedules/{id}` -> `{ schedule }` with entries.
    static let accruals = RecordSpec(
        key: accrualsKey,
        webPath: "/accounting/accruals",
        title: "Accruals",
        singular: "Accrual",
        symbol: "arrow.triangle.2.circlepath",
        endpoint: "accrual-schedules",
        detailKey: "schedule",
        searchParam: nil,
        row: RecordRow(title: ["description"], subtitle: ["frequency"], amount: "totalAmount", date: "startDate"),
        tones: ["active": .info, "completed": .positive, "cancelled": .negative],
        totals: [
            RecordTotal(label: "Active", field: "totalAmount", statuses: ["active"], tone: .info),
        ],
        detail: { AnyView(AccountingAccrualDetailView(id: $0)) },
        emptyMessage: "Costs and income spread over several periods show up here."
    )

    /// `GET recurring-journals` (paginated, `status=`), `GET recurring-journals/{id}` -> `{ template }`.
    static let recurring = RecordSpec(
        key: recurringKey,
        webPath: "/accounting/recurring-journals",
        title: "Recurring journals",
        singular: "Recurring journal",
        symbol: "repeat",
        endpoint: "recurring-journals",
        detailKey: "template",
        searchParam: nil,
        statuses: [RecordStatus("active", "Active"), RecordStatus("paused", "Paused"), RecordStatus("completed", "Completed")],
        row: RecordRow(title: ["name"], subtitle: ["frequency"], date: "nextRunDate"),
        tones: ["active": .positive, "paused": .warning, "completed": .neutral],
        create: { done in AnyView(AccountingNewRecurringSheet(onDone: done)) },
        detail: { AnyView(AccountingRecurringDetailView(id: $0)) },
        emptyMessage: "Journals that post themselves every week, month or quarter."
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = AccountingFixtures.all
    #endif
}
