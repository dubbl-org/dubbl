import SwiftUI

/// The Purchases tab, a browser of what goes out: bills from suppliers and
/// the team's expense claims. The scope sits in a glass header with what's
/// owed under it, the drawer switches between bill and claim statuses, and
/// the ledger rows carry their own actions.
struct PurchasesView: View {
    enum Segment: String, Hashable { case bills, expenses }

    @Environment(AppEnvironment.self) private var env
    @State private var segment: Segment = .bills
    @State private var path = NavigationPath()
    @State private var bills = PurchasesBillsStore()
    @State private var expenses = PurchasesExpensesStore()
    @State private var paying: Bill?
    @State private var showNewExpense = false
    @State private var drawerOpen = false
    @State private var query = ""
    @State private var rowsShown = false
    @FocusState private var searchFocused: Bool
    @Namespace private var drawerNS
    #if DEBUG
    @State private var demoOpened = false
    #endif

    private var currency: String { env.session.currency }

    private var pendingKey: String? {
        env.router.pendingPurchases.map { "\($0.segment)|\($0.filter ?? "all")" }
    }

    private var term: String { query.trimmingCharacters(in: .whitespaces) }
    private var searching: Bool { !term.isEmpty }

    /// Search narrows what's loaded: number, supplier or reference.
    private var billRows: [Bill] {
        guard searching else { return bills.bills }
        return bills.bills.filter { bill in
            [bill.billNumber, bill.contact?.name ?? "", bill.reference ?? ""]
                .contains { $0.localizedCaseInsensitiveContains(term) }
        }
    }

    /// Search narrows what's loaded: title or who claimed it.
    private var claimRows: [ExpenseClaim] {
        guard searching else { return expenses.claims }
        return expenses.claims.filter { claim in
            [claim.title, claim.submittedByUser?.displayName ?? ""]
                .contains { $0.localizedCaseInsensitiveContains(term) }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                if searching, segment == .bills ? bills.hasLoaded : expenses.hasLoaded {
                    SearchResultsLine(count: segment == .bills ? billRows.count : claimRows.count)
                }
                Group {
                    switch segment {
                    case .bills: billsList
                    case .expenses: expensesList
                    }
                }
                .tabBarClearance()
            }
            .background(DTheme.canvas)
            .toolbar(.hidden, for: .navigationBar)
            .browserDrawer(isOpen: $drawerOpen) { drawer }
            .tabBarPushed(!path.isEmpty, tab: .purchases)
            .navigationDestination(for: RecordPageRoute.self) { route in
                RecordCatalog.page(route.path)
            }
            .navigationDestination(for: RecordRoute.self) { route in
                RecordCatalog.detail(route)
            }
            .navigationDestination(for: PurchasesRoute.self) { route in
                switch route {
                case let .bill(id):
                    BillDetailView(id: id, onUpdate: { bill in
                        bills.apply(bill)
                        Task { await bills.refreshCounts(env.api) }
                    })
                case let .expense(id):
                    ExpenseDetailView(id: id, onUpdate: { claim in
                        expenses.apply(claim)
                        Task { await expenses.refreshCounts(env.api) }
                    })
                }
            }
        }
        .sheet(item: $paying) { bill in
            PurchasesPaymentSheet(bill: bill) { updated in
                bills.apply(updated)
                Task { await bills.refreshCounts(env.api) }
            }
        }
        .sheet(isPresented: $showNewExpense) {
            NewExpenseSheet { claim in
                expenses.insert(claim)
                Task { await expenses.refreshCounts(env.api) }
            }
        }
        .task(id: env.session.orgGeneration) {
            async let billsLoaded: Void = bills.load(env.api)
            async let expensesLoaded: Void = expenses.load(env.api)
            _ = await (billsLoaded, expensesLoaded)
            rowsShown = true
            #if DEBUG
            openDemoScreen()
            #endif
        }
        .onChange(of: bills.filter) { _, _ in reload { await bills.load(env.api) } }
        .onChange(of: expenses.filter) { _, _ in reload { await expenses.load(env.api) } }
        .onChange(of: segment) { _, _ in
            query = ""
            rowsShown = false
            Task { rowsShown = true }
        }
        .onChange(of: pendingKey, initial: true) { _, _ in consumePending() }
        .sensoryFeedback(.selection, trigger: segment)
    }

    // MARK: Header

    private var header: some View {
        BrowserHeader(
            title: title,
            subtitle: subtitle,
            query: $query,
            searchPrompt: segment == .bills ? "Number, supplier or reference" : "Claim or person",
            searchFocused: $searchFocused,
            menuLabel: "Purchases filters",
            onMenu: openDrawer
        ) {
            HeaderPrimaryButton(symbol: "plus", label: "New expense") { showNewExpense = true }
        }
    }

    private var title: String {
        switch segment {
        case .bills: PurchasesScope.billTitle(bills.filter)
        case .expenses: PurchasesScope.expenseTitle(expenses.filter)
        }
    }

    /// "$4.51K to pay · $1.32K overdue" for bills, "$1.49K to approve · $841
    /// to repay" for claims; a narrowed scope shows its own count and sum.
    private var subtitle: Text? {
        switch segment {
        case .bills:
            if bills.filter == "all" {
                guard bills.counts != nil else { return nil }
                let toPay = Text("\(Money.short(bills.toPay, currency: currency)) to pay")
                guard bills.overdue > 0 else { return toPay }
                let overdue = Text("\(Money.short(bills.overdue, currency: currency)) overdue")
                    .foregroundStyle(DTheme.negative).fontWeight(.semibold)
                return Text("\(toPay) · \(overdue)")
            }
            guard bills.hasLoaded else { return nil }
            let total = bills.bills.reduce(0) { $0 + ($1.status == "partial" ? $1.amountDue : $1.total) }
            return countLine(bills.bills.count, more: bills.hasMore, noun: "bill", total: total)
        case .expenses:
            if expenses.filter == "all" {
                guard expenses.counts != nil else { return nil }
                let reimburse = Text("\(Money.short(expenses.toReimburse, currency: currency)) to repay")
                guard expenses.awaitingApprovalCount > 0 else { return reimburse }
                let approve = Text("\(Money.short(expenses.awaitingApproval, currency: currency)) to approve")
                    .foregroundStyle(DTheme.warning).fontWeight(.semibold)
                return Text("\(approve) · \(reimburse)")
            }
            guard expenses.hasLoaded else { return nil }
            let total = expenses.claims.reduce(0) { $0 + $1.totalAmount }
            return countLine(expenses.claims.count, more: expenses.hasMore, noun: "claim", total: total)
        }
    }

    private func countLine(_ count: Int, more: Bool, noun: String, total: Int) -> Text {
        Text("\(count)\(more ? "+" : "") \(count == 1 ? noun : noun + "s") · \(Money.short(total, currency: currency))")
    }

    // MARK: Bills

    @ViewBuilder
    private var billsList: some View {
        if bills.bills.isEmpty {
            Group {
                if let message = bills.errorMessage {
                    ErrorStateView(message: message) { await bills.load(env.api) }
                } else if bills.hasLoaded, !bills.isLoading {
                    EmptyStateView(
                        symbol: bills.filter == "overdue" ? "checkmark.seal" : "doc.text",
                        title: bills.filter == "all" ? "No bills yet" : bills.filter == "overdue" ? "Nothing overdue" : "Nothing here",
                        message: bills.filter == "all" ? "Bills from your suppliers show up here." : "Bills in this state will show up here."
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: bills.hasLoaded ? .center : .top)
        } else {
            List {
                if !searching, bills.filter == "all" || bills.filter == "overdue" {
                    billTotals
                        .padding(.vertical, 14)
                        .ledgerRow()
                }
                ForEach(Array(billRows.enumerated()), id: \.element.id) { index, bill in
                    NavigationLink(value: PurchasesRoute.bill(bill.id)) {
                        PurchasesBillRow(bill: bill)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        if PurchasesKit.isOpen(bill) {
                            Button { paying = bill } label: { Label("Record payment", systemImage: "banknote") }
                                .tint(DTheme.positive)
                        }
                    }
                    .contextMenu {
                        if PurchasesKit.isOpen(bill) {
                            Button { paying = bill } label: { Label("Record payment", systemImage: "banknote") }
                        }
                        Button {
                            env.router.askTilly("Tell me about bill \(bill.billNumber) from \(bill.contact?.name ?? "this supplier").", page: "purchases")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    }
                }
                if bills.hasMore, !searching {
                    PurchasesLoadMoreRow { await bills.loadMore(env.api) }
                } else if !searching {
                    LedgerEndMarker(text: "\(billRows.count) \(billRows.count == 1 ? "bill" : "bills")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await bills.load(env.api) }
        }
    }

    private var billTotals: some View {
        let loaded = bills.counts != nil
        return LedgerTotals(items: [
            .init(
                label: "To pay",
                value: loaded ? Money.compact(bills.toPay, currency: currency) : nil,
                detail: loaded ? plural(bills.toPayCount, "bill") : nil,
                tint: DTheme.accent,
                action: { bills.filter = "received" }
            ),
            .init(
                label: "Overdue",
                value: loaded ? Money.compact(bills.overdue, currency: currency) : nil,
                detail: loaded ? plural(bills.overdueCount, "bill") : nil,
                tint: bills.overdue > 0 ? DTheme.negative : DTheme.positive,
                action: { bills.filter = "overdue" }
            ),
        ])
    }

    // MARK: Expenses

    @ViewBuilder
    private var expensesList: some View {
        if expenses.claims.isEmpty {
            Group {
                if let message = expenses.errorMessage {
                    ErrorStateView(message: message) { await expenses.load(env.api) }
                } else if expenses.hasLoaded, !expenses.isLoading {
                    EmptyStateView(
                        symbol: "receipt",
                        title: expenses.filter == "all" ? "No expenses yet" : "Nothing here",
                        message: expenses.filter == "all" ? "Snap a receipt to claim back what you spent." : "Claims in this state will show up here.",
                        actionTitle: expenses.filter == "all" ? "New expense" : nil,
                        action: { showNewExpense = true }
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: expenses.hasLoaded ? .center : .top)
        } else {
            List {
                if !searching, expenses.filter == "all" {
                    expenseTotals
                        .padding(.vertical, 14)
                        .ledgerRow()
                }
                ForEach(Array(claimRows.enumerated()), id: \.element.id) { index, claim in
                    NavigationLink(value: PurchasesRoute.expense(claim.id)) {
                        PurchasesExpenseRow(claim: claim)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .contextMenu {
                        Button { path.append(PurchasesRoute.expense(claim.id)) } label: { Label("Open", systemImage: "arrow.up.right") }
                        Button {
                            env.router.askTilly("Tell me about the expense claim \"\(claim.title)\".", page: "purchases")
                        } label: {
                            Label("Ask Tilly", systemImage: "sparkle")
                        }
                    }
                }
                if expenses.hasMore, !searching {
                    PurchasesLoadMoreRow { await expenses.loadMore(env.api) }
                } else if !searching {
                    LedgerEndMarker(text: "\(claimRows.count) \(claimRows.count == 1 ? "claim" : "claims")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await expenses.load(env.api) }
        }
    }

    private var expenseTotals: some View {
        let loaded = expenses.counts != nil
        return LedgerTotals(items: [
            .init(
                label: "To approve",
                value: loaded ? Money.compact(expenses.awaitingApproval, currency: currency) : nil,
                detail: loaded ? plural(expenses.awaitingApprovalCount, "claim") : nil,
                tint: expenses.awaitingApprovalCount > 0 ? DTheme.warning : DTheme.positive,
                action: { expenses.filter = "submitted" }
            ),
            .init(
                label: "To reimburse",
                value: loaded ? Money.compact(expenses.toReimburse, currency: currency) : nil,
                detail: loaded ? plural(expenses.toReimburseCount, "claim") : nil,
                tint: DTheme.accent,
                action: { expenses.filter = "approved" }
            ),
        ])
    }

    private func plural(_ count: Int, _ noun: String) -> String {
        "\(count) \(count == 1 ? noun : noun + "s")"
    }

    // MARK: Drawer

    private var drawer: some View {
        DrawerScaffold {
            DrawerSection(title: "Bills", trailing: bills.counts == nil ? nil : "\(Money.short(bills.toPay, currency: currency)) to pay") {
                ForEach(Array(PurchasesBillsStore.filters.enumerated()), id: \.element.value) { index, option in
                    DrawerRow(
                        symbol: PurchasesScope.billSymbol(option.value),
                        title: option.value == "all" ? "All bills" : PurchasesScope.billTitle(option.value),
                        count: bills.count(option.value),
                        accent: option.value == "overdue" && bills.overdueCount > 0 ? DTheme.negative : nil,
                        selected: segment == .bills && bills.filter == option.value,
                        namespace: drawerNS,
                        index: index,
                        revealed: drawerOpen
                    ) { select(.bills, option.value) }
                }
            }
            DrawerSection(title: "Expenses") {
                ForEach(Array(PurchasesExpensesStore.filters.enumerated()), id: \.element.value) { index, option in
                    DrawerRow(
                        symbol: PurchasesScope.expenseSymbol(option.value),
                        title: option.value == "all" ? "All expenses" : option.label,
                        count: expenses.count(option.value),
                        accent: option.value == "submitted" && expenses.awaitingApprovalCount > 0 ? DTheme.warning : nil,
                        selected: segment == .expenses && expenses.filter == option.value,
                        namespace: drawerNS,
                        index: 8 + index,
                        revealed: drawerOpen
                    ) { select(.expenses, option.value) }
                }
            }
            DrawerSection(title: "More in Purchases") {
                ForEach(Array(Self.morePages.enumerated()), id: \.element.path) { offset, page in
                    DrawerRow(symbol: page.symbol, title: page.title, selected: false, namespace: drawerNS, index: 14 + offset, revealed: drawerOpen) {
                        closeDrawer()
                        path.append(RecordPageRoute(path: page.path))
                    }
                }
            }
            DrawerSection(title: "Create") {
                DrawerRow(symbol: "doc.viewfinder", title: "Snap a receipt", selected: false, namespace: drawerNS, index: 18, revealed: drawerOpen) {
                    closeDrawer()
                    showNewExpense = true
                }
                DrawerRow(tilly: true, title: "Ask Tilly about spending", selected: false, namespace: drawerNS, index: 19, revealed: drawerOpen) {
                    closeDrawer()
                    env.router.askTilly("What do I owe suppliers, and what should I pay first?", page: "purchases")
                }
            }
        }
    }

    /// The rest of Purchases, opened inside this tab.
    private static let morePages: [(title: String, symbol: String, path: String)] = [
        ("Purchase orders", "shippingbox", "/purchases/orders"),
        ("Supplier credits", "arrow.uturn.backward.circle", "/purchases/debit-notes"),
        ("Recurring bills", "repeat", "/purchases/bills/recurring"),
        ("Requisitions", "list.clipboard", "/purchases/requisitions"),
    ]

    private func openDrawer() {
        searchFocused = false
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = true }
    }

    private func closeDrawer() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = false }
    }

    private func select(_ next: Segment, _ filter: String) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.8)) {
            segment = next
            switch next {
            case .bills: bills.filter = filter
            case .expenses: expenses.filter = filter
            }
        }
        // Let the tile slide to the tapped row before closing.
        Task {
            try? await Task.sleep(for: .milliseconds(260))
            closeDrawer()
        }
    }

    // MARK: Actions

    /// Rows step in again once a new scope has loaded.
    private func reload(_ load: @escaping () async -> Void) {
        rowsShown = false
        Task {
            await load()
            rowsShown = true
        }
    }

    /// Another tab asked for a list ("Overdue bills" on the overview...).
    private func consumePending() {
        guard let pending = env.router.pendingPurchases else { return }
        env.router.pendingPurchases = nil
        path = NavigationPath()
        if pending.segment == "expenses" {
            segment = .expenses
            let known = PurchasesExpensesStore.filters.map(\.value)
            expenses.filter = pending.filter.flatMap { known.contains($0) ? $0 : nil } ?? "all"
        } else {
            segment = .bills
            let known = PurchasesBillsStore.filters.map(\.value)
            bills.filter = pending.filter.flatMap { known.contains($0) ? $0 : nil } ?? "all"
        }
    }

    #if DEBUG
    /// DUBBL_DEMO_OPEN=bill|expense|expenses|new-expense|drawer|search|overdue ... for screenshots.
    private func openDemoScreen() {
        guard DemoData.isEnabled, !demoOpened, let open = PurchasesKit.demoOpen else { return }
        demoOpened = true
        switch open {
        case "bill":
            if let first = bills.bills.first(where: { PurchasesKit.isOpen($0) }) ?? bills.bills.first {
                path.append(PurchasesRoute.bill(first.id))
            }
        case "bill-approval":
            if let first = bills.bills.first(where: { $0.status == "pending_approval" }) { path.append(PurchasesRoute.bill(first.id)) }
        case "expenses":
            segment = .expenses
        case "expense":
            segment = .expenses
            if let first = expenses.claims.first { path.append(PurchasesRoute.expense(first.id)) }
        case "new-expense", "new-expense-filled", "receipt":
            segment = .expenses
            showNewExpense = true
        case "drawer":
            openDrawer()
        case "search":
            query = "de"
        default:
            if PurchasesBillsStore.filters.contains(where: { $0.value == open }) { bills.filter = open }
        }
    }
    #endif
}

/// Header titles and drawer symbols for each status scope.
enum PurchasesScope {
    static func billTitle(_ filter: String) -> String {
        switch filter {
        case "all": "Bills"
        case "draft": "Draft bills"
        case "pending_approval": "To approve"
        case "received": "To pay"
        case "partial": "Part paid"
        case "overdue": "Overdue bills"
        case "paid": "Paid bills"
        case "void": "Void bills"
        default: filter.humanized
        }
    }

    static func billSymbol(_ filter: String) -> String {
        switch filter {
        case "all": "doc.text"
        case "draft": "pencil.line"
        case "pending_approval": "hand.raised"
        case "received": "clock"
        case "partial": "circle.lefthalf.filled"
        case "overdue": "exclamationmark.circle"
        case "paid": "checkmark.circle"
        default: "xmark.circle"
        }
    }

    static func expenseTitle(_ filter: String) -> String {
        switch filter {
        case "all": "Expenses"
        case "draft": "Draft claims"
        case "submitted": "To approve"
        case "approved": "To reimburse"
        case "paid": "Reimbursed"
        case "rejected": "Rejected"
        default: filter.humanized
        }
    }

    static func expenseSymbol(_ filter: String) -> String {
        switch filter {
        case "all": "receipt"
        case "draft": "pencil.line"
        case "submitted": "paperplane"
        case "approved": "checkmark.seal"
        case "paid": "checkmark.circle"
        default: "xmark.circle"
        }
    }
}
