import SwiftUI

// Every area of dubbl and the pages inside it, mirroring the web dashboard's
// rail and side panel (components/dashboard/shell/nav.ts and each module's
// layout tabs). Pages are named by their web path; RecordCatalog supplies the
// native screen for each.

/// Where a page goes when tapped.
enum MoreTarget: Hashable {
    case invoices(String?)
    case bills(String?)
    case expenses(String?)
    case contacts
    case bankAccounts
    case notifications
    case organizations
    /// A page named by its web dashboard path, e.g. "/sales/quotes"; RecordCatalog has its screen.
    case page(String)

    /// Only pages without a native screen yet leave the app.
    @MainActor
    var opensOnWeb: Bool {
        if case let .page(path) = self { return !RecordCatalog.hasPage(path) }
        return false
    }
}

struct MorePage: Identifiable, Hashable {
    let title: String
    let symbol: String
    let target: MoreTarget

    var id: String { "\(title)|\(target)" }

    init(_ title: String, _ symbol: String, _ target: MoreTarget) {
        self.title = title
        self.symbol = symbol
        self.target = target
    }

    init(_ title: String, _ symbol: String, web path: String) {
        self.init(title, symbol, .page(path))
    }
}

struct MorePageGroup: Identifiable, Hashable {
    let title: String?
    let pages: [MorePage]

    var id: String { title ?? pages.first?.title ?? "" }

    init(_ title: String, _ pages: [MorePage]) {
        self.title = title
        self.pages = pages
    }

    /// The untitled group at the top of a module.
    init(_ pages: [MorePage]) {
        title = nil
        self.pages = pages
    }
}

struct MoreModule: Identifiable, Hashable {
    let key: String
    let title: String
    let symbol: String
    let tone: Tone
    /// One line under the title on the module's page and in its row.
    let blurb: String
    let tillyPrompt: String
    let groups: [MorePageGroup]

    var id: String { key }
    var color: Color { tone.color }
    var pageCount: Int { groups.reduce(0) { $0 + $1.pages.count } }
}

enum MoreDirectory {
    // MARK: Day to day

    static let sales = MoreModule(
        key: "sales", title: "Sales", symbol: "doc.text.fill", tone: .info,
        blurb: "Invoices, quotes and getting paid",
        tillyPrompt: "Who owes me money, and who should I chase first?",
        groups: [
            MorePageGroup([
                MorePage("Invoices", "doc.text", .invoices(nil)),
                MorePage("Overdue invoices", "exclamationmark.circle", .invoices("overdue")),
                MorePage("Quotes", "doc.plaintext", web: "/sales/quotes"),
                MorePage("Cash sales", "banknote", web: "/sales/receipts"),
                MorePage("Credit notes", "arrow.uturn.backward.circle", web: "/sales/credit-notes"),
            ]),
            MorePageGroup("Getting paid", [
                MorePage("Payments", "creditcard", web: "/sales/payments"),
                MorePage("Prepayments", "tray.and.arrow.down", web: "/sales/customer-prepayments"),
            ]),
            MorePageGroup("Automation", [
                MorePage("Recurring invoices", "repeat", web: "/sales/recurring"),
                MorePage("Revenue schedules", "calendar.badge.clock", web: "/sales/revenue-schedules"),
            ]),
        ]
    )

    static let purchases = MoreModule(
        key: "purchases", title: "Purchases", symbol: "cart.fill", tone: .orange,
        blurb: "Bills, expenses and ordering",
        tillyPrompt: "What do I owe suppliers, and what should I pay first?",
        groups: [
            MorePageGroup([
                MorePage("Bills", "doc.text", .bills(nil)),
                MorePage("Bills to pay", "clock", .bills("received")),
                MorePage("Recurring bills", "repeat", web: "/purchases/bills/recurring"),
                MorePage("Supplier credits", "arrow.uturn.backward.circle", web: "/purchases/debit-notes"),
            ]),
            MorePageGroup("Spending", [
                MorePage("Expenses", "receipt", .expenses(nil)),
                MorePage("Recurring expenses", "repeat", web: "/purchases/expenses/recurring"),
            ]),
            MorePageGroup("Ordering", [
                MorePage("Requisitions", "list.clipboard", web: "/purchases/requisitions"),
                MorePage("Purchase orders", "shippingbox", web: "/purchases/orders"),
                MorePage("Goods received", "checkmark.rectangle.stack", web: "/purchases/goods-receipts"),
                MorePage("Landed costs", "airplane.arrival", web: "/purchases/landed-costs"),
            ]),
        ]
    )

    static let contacts = MoreModule(
        key: "contacts", title: "Contacts", symbol: "person.2.fill", tone: .special,
        blurb: "Customers, suppliers and people",
        tillyPrompt: "Which customers are slowest to pay?",
        groups: [
            MorePageGroup([
                MorePage("All contacts", "person.2", .contacts),
                MorePage("People", "person.crop.rectangle.stack", web: "/contacts/people"),
            ]),
            MorePageGroup("Stay in touch", [
                MorePage("Statements", "doc.richtext", web: "/contacts/statements"),
                MorePage("Customer portal", "globe", web: "/contacts/portal"),
                MorePage("Duplicates", "person.2.badge.gearshape", web: "/contacts/duplicates"),
            ]),
            MorePageGroup("Related", [
                MorePage("Aged receivables", "hourglass.bottomhalf.filled", web: "/reports/aged-receivables"),
                MorePage("Aged payables", "hourglass.tophalf.filled", web: "/reports/aged-payables"),
                MorePage("1099 totals", "doc.badge.ellipsis", web: "/reports/1099"),
                MorePage("Payment reminders", "bell.badge", web: "/settings/reminders"),
            ]),
        ]
    )

    static let accounting = MoreModule(
        key: "accounting", title: "Accounting", symbol: "arrow.left.arrow.right", tone: .positive,
        blurb: "Banking, accounts and journals",
        tillyPrompt: "Is anything in my books that needs fixing?",
        groups: [
            MorePageGroup([
                MorePage("Transactions", "list.bullet.rectangle", web: "/accounting"),
                MorePage("Chart of accounts", "list.number", web: "/accounting/accounts"),
            ]),
            MorePageGroup("Banking", [
                MorePage("Bank accounts", "building.columns", .bankAccounts),
                MorePage("Scheduled payments", "calendar", web: "/accounting/banking/scheduled"),
                MorePage("Payment batches", "square.stack.3d.up", web: "/accounting/banking/batches"),
            ]),
            MorePageGroup("Assets and loans", [
                MorePage("Fixed assets", "desktopcomputer", web: "/accounting/fixed-assets"),
                MorePage("Asset categories", "folder", web: "/accounting/asset-categories"),
                MorePage("Loans", "percent", web: "/accounting/loans"),
            ]),
            MorePageGroup("Planning", [
                MorePage("Budgets", "chart.bar", web: "/accounting/budgets"),
            ]),
            MorePageGroup("Adjustments", [
                MorePage("Accruals", "arrow.triangle.2.circlepath", web: "/accounting/accruals"),
                MorePage("Recurring journals", "repeat", web: "/accounting/recurring-journals"),
            ]),
            MorePageGroup("Year end and setup", [
                MorePage("Financial years", "calendar.badge.checkmark", web: "/accounting/fiscal-years"),
                MorePage("Opening balances", "flag", web: "/accounting/opening-balances"),
            ]),
        ]
    )

    static let tax = MoreModule(
        key: "tax", title: "Tax", symbol: "percent", tone: .warning,
        blurb: "Returns, rates and periods",
        tillyPrompt: "How much tax do I owe this quarter?",
        groups: [
            MorePageGroup("Returns", [
                MorePage("VAT return", "doc.text.magnifyingglass", web: "/tax/vat-return"),
                MorePage("BAS", "doc.text.magnifyingglass", web: "/tax/bas"),
                MorePage("Sales tax", "doc.text.magnifyingglass", web: "/tax/sales-tax"),
                MorePage("Schedule C", "doc.text.magnifyingglass", web: "/tax/schedule-c"),
            ]),
            MorePageGroup("Setup", [
                MorePage("Tax rates", "percent", web: "/tax"),
                MorePage("Currencies", "dollarsign.arrow.circlepath", web: "/tax/currencies"),
                MorePage("Tax periods", "calendar", web: "/tax/periods"),
            ]),
        ]
    )

    static let reports = MoreModule(
        key: "reports", title: "Reports", symbol: "chart.line.uptrend.xyaxis", tone: .info,
        blurb: "Profit, cash, tax and your accountant's pack",
        tillyPrompt: "How's business this month compared with last?",
        groups: [
            MorePageGroup("The big picture", [
                MorePage("Executive summary", "rectangle.grid.2x2", web: "/reports/executive-summary"),
                MorePage("Profit and loss", "chart.line.uptrend.xyaxis", web: "/reports/profit-and-loss"),
                MorePage("Balance sheet", "scalemass", web: "/reports/balance-sheet"),
                MorePage("Cash flow", "arrow.left.arrow.right", web: "/reports/cash-flow"),
                MorePage("Report pack", "books.vertical", web: "/reports/pack"),
            ]),
            MorePageGroup("Profit and spending", [
                MorePage("Tracking", "tag", web: "/reports/tracking"),
                MorePage("P&L comparison", "chart.bar.xaxis", web: "/reports/pnl-comparison"),
                MorePage("Budget vs actual", "target", web: "/reports/budget-vs-actual"),
                MorePage("Expense analytics", "chart.pie", web: "/reports/expense-analytics"),
                MorePage("Profitability", "chart.line.uptrend.xyaxis", web: "/reports/profitability"),
                MorePage("Vendor spend", "cart", web: "/reports/vendor-spend"),
                MorePage("Sales by customer", "person.2", web: "/reports/sales-by-customer"),
                MorePage("Sales by item", "shippingbox", web: "/reports/sales-by-item"),
            ]),
            MorePageGroup("Getting paid", [
                MorePage("Aged receivables", "hourglass.bottomhalf.filled", web: "/reports/aged-receivables"),
                MorePage("Aged payables", "hourglass.tophalf.filled", web: "/reports/aged-payables"),
                MorePage("Payment performance", "speedometer", web: "/reports/payment-performance"),
                MorePage("Duplicate detection", "doc.on.doc", web: "/reports/duplicate-detection"),
            ]),
            MorePageGroup("Tax", [
                MorePage("VAT return", "doc.text.magnifyingglass", web: "/reports/vat-return"),
                MorePage("Tax summary", "percent", web: "/reports/tax-summary"),
                MorePage("1099 totals", "doc.badge.ellipsis", web: "/reports/1099"),
            ]),
            MorePageGroup("Planning", [
                MorePage("Cash flow forecast", "chart.line.uptrend.xyaxis", web: "/reports/cash-flow-forecast"),
                MorePage("Financial calendar", "calendar", web: "/reports/financial-calendar"),
                MorePage("Financial ratios", "divide", web: "/reports/financial-ratios"),
            ]),
            MorePageGroup("For your accountant", [
                MorePage("Trial balance", "scalemass", web: "/reports/trial-balance"),
                MorePage("General ledger", "book.closed", web: "/reports/general-ledger"),
                MorePage("Comparative balance sheet", "rectangle.split.2x1", web: "/reports/comparative-balance-sheet"),
                MorePage("Consolidation", "square.stack.3d.down.right", web: "/reports/consolidation"),
            ]),
            MorePageGroup("Saved and scheduled", [
                MorePage("Reconciliation status", "checkmark.circle", web: "/reports/bank-reconciliation-status"),
                MorePage("Bank cash flow", "building.columns", web: "/reports/bank-cash-flow"),
                MorePage("Custom reports", "slider.horizontal.3", web: "/reports/custom"),
                MorePage("Saved reports", "bookmark", web: "/reports/saved"),
                MorePage("Schedules", "clock", web: "/reports/schedules"),
            ]),
        ]
    )

    // MARK: Running the business

    static let projects = MoreModule(
        key: "projects", title: "Projects", symbol: "square.stack.3d.up.fill", tone: .special,
        blurb: "Budgets, time and profit per job",
        tillyPrompt: "Which projects are over budget?",
        groups: [
            MorePageGroup([
                MorePage("All projects", "square.stack.3d.up", web: "/projects"),
            ]),
        ]
    )

    static let inventory = MoreModule(
        key: "inventory", title: "Inventory", symbol: "shippingbox.fill", tone: .orange,
        blurb: "Items, stock and assembly",
        tillyPrompt: "Which items are running low?",
        groups: [
            MorePageGroup([
                MorePage("Items", "shippingbox", web: "/inventory"),
                MorePage("Categories", "folder", web: "/inventory/categories"),
                MorePage("Reorder alerts", "exclamationmark.triangle", web: "/inventory/alerts"),
            ]),
            MorePageGroup("Stock", [
                MorePage("Locations", "mappin.and.ellipse", web: "/inventory/warehouses"),
                MorePage("Transfers", "arrow.left.arrow.right", web: "/inventory/transfers"),
                MorePage("Stocktakes", "checklist", web: "/inventory/stock-takes"),
            ]),
            MorePageGroup("Making things", [
                MorePage("Bills of materials", "list.bullet.indent", web: "/inventory/bom"),
                MorePage("Assembly orders", "hammer", web: "/inventory/assembly"),
            ]),
            MorePageGroup("Insights", [
                MorePage("Stock value", "chart.bar", web: "/inventory/valuation"),
            ]),
        ]
    )

    static let payroll = MoreModule(
        key: "payroll", title: "Payroll", symbol: "building.columns.fill", tone: .positive,
        blurb: "People, pay runs and filings",
        tillyPrompt: "When's the next pay run, and what will it cost?",
        groups: [
            MorePageGroup([
                MorePage("Overview", "rectangle.grid.2x2", web: "/payroll"),
            ]),
            MorePageGroup("People", [
                MorePage("Employees", "person.2", web: "/payroll/employees"),
                MorePage("Contractors", "person.crop.square", web: "/payroll/contractors"),
                MorePage("Compensation", "dollarsign.circle", web: "/payroll/compensation"),
            ]),
            MorePageGroup("Pay", [
                MorePage("Pay runs", "play.circle", web: "/payroll/runs"),
                MorePage("Time and leave", "clock", web: "/payroll/time-leave"),
            ]),
            MorePageGroup("Compliance", [
                MorePage("Tax liabilities", "percent", web: "/payroll/tax-liabilities"),
                MorePage("Tax forms", "doc.text", web: "/payroll/tax-forms"),
            ]),
            MorePageGroup("Insights", [
                MorePage("Reports and forecast", "chart.line.uptrend.xyaxis", web: "/payroll/analytics"),
            ]),
            MorePageGroup("Setup", [
                MorePage("Employee self-service", "person.badge.key", web: "/payroll/self-service"),
                MorePage("Payroll settings", "gearshape", web: "/payroll/settings"),
            ]),
        ]
    )

    static let teams = MoreModule(
        key: "teams", title: "Teams", symbol: "person.3.fill", tone: .info,
        blurb: "Who works on what",
        tillyPrompt: "Who's on which team?",
        groups: [
            MorePageGroup([
                MorePage("Teams", "person.3", web: "/teams"),
                MorePage("Members", "person.2", web: "/teams/members"),
            ]),
        ]
    )

    static let crm = MoreModule(
        key: "crm", title: "CRM", symbol: "target", tone: .negative,
        blurb: "Pipeline, deals and activities",
        tillyPrompt: "Which deals are most likely to close this month?",
        groups: [
            MorePageGroup([
                MorePage("Pipeline", "rectangle.split.3x1", web: "/crm"),
                MorePage("Deals", "briefcase", web: "/crm/deals"),
                MorePage("Activities", "checklist", web: "/crm/activities"),
            ]),
            MorePageGroup("Insights", [
                MorePage("Analytics", "chart.bar", web: "/crm/analytics"),
            ]),
            MorePageGroup("Setup", [
                MorePage("Pipelines and stages", "slider.horizontal.3", web: "/crm/pipelines"),
            ]),
        ]
    )

    static let documents = MoreModule(
        key: "documents", title: "Documents", symbol: "folder.fill", tone: .neutral,
        blurb: "Files, receipts and emails",
        tillyPrompt: "Which documents aren't linked to anything yet?",
        groups: [
            MorePageGroup([
                MorePage("All files", "folder", web: "/documents"),
                MorePage("Attachments", "paperclip", web: "/documents/attachments"),
                MorePage("Emails", "envelope", web: "/documents/emails"),
                MorePage("Unlinked", "link.badge.plus", web: "/documents/unlinked"),
            ]),
        ]
    )

    // MARK: Organization

    static let organization = MoreModule(
        key: "organization", title: "Organization", symbol: "building.2.fill", tone: .neutral,
        blurb: "Members, billing and automation",
        tillyPrompt: "Summarise how my organization is set up.",
        groups: [
            MorePageGroup("Organization", [
                MorePage("General", "building.2", web: "/settings"),
                MorePage("Members", "person.2", web: "/settings/members"),
                MorePage("Roles", "person.badge.shield.checkmark", web: "/settings/roles"),
                MorePage("Billing", "creditcard", web: "/settings/billing"),
                MorePage("Advisors", "person.crop.circle.badge.checkmark", web: "/settings/advisors"),
                MorePage("Templates", "doc.richtext", web: "/settings/document-templates"),
                MorePage("Import and export", "square.and.arrow.down.on.square", web: "/settings/import-export"),
                MorePage("Trash", "trash", web: "/settings/trash"),
                MorePage("Backups", "externaldrive", web: "/settings/backups"),
            ]),
            MorePageGroup("Automation", [
                MorePage("Bank rules", "wand.and.stars", web: "/settings/bank-rules"),
                MorePage("Approvals", "checkmark.seal", web: "/settings/approval-workflows"),
                MorePage("Bill matching", "rectangle.and.arrow.forward", web: "/settings/procurement"),
                MorePage("Webhooks", "point.3.connected.trianglepath.dotted", web: "/settings/webhooks"),
            ]),
            MorePageGroup("Integrations", [
                MorePage("Stripe", "creditcard.and.123", web: "/settings/integrations/stripe"),
                MorePage("Email sending", "paperplane", web: "/settings/email"),
            ]),
            MorePageGroup("Preferences", [
                MorePage("Notifications", "bell", .notifications),
                MorePage("Reminders", "bell.badge", web: "/settings/reminders"),
                MorePage("Cost centers", "building", web: "/settings/cost-centers"),
                MorePage("Tags", "tag", web: "/settings/tags"),
            ]),
            MorePageGroup("Developer", [
                MorePage("API keys", "key", web: "/settings/api-keys"),
                MorePage("Audit log", "clock.arrow.circlepath", web: "/settings/audit-log"),
            ]),
        ]
    )

    /// The four with live figures, shown as tiles.
    static let daily: [MoreModule] = [sales, purchases, contacts, accounting]
    /// The rest, shown as a list.
    static let business: [MoreModule] = [reports, tax, projects, inventory, payroll, teams, crm, documents]
    static let all: [MoreModule] = daily + business + [organization]

    /// Every page with the module it sits in, for search.
    static let pages: [(module: MoreModule, page: MorePage)] = all.flatMap { module in
        module.groups.flatMap(\.pages).map { (module, $0) }
    }
}
