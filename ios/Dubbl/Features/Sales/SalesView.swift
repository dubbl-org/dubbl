import SwiftUI

/// Pushes an invoice inside the Sales stack.
struct SalesInvoiceRoute: Hashable {
    let id: String
}

/// The status filters the invoices list offers. The list route takes one status.
enum SalesFilter: String, CaseIterable, Hashable {
    case all, draft, sent, partial, overdue, paid, void

    var label: String {
        switch self {
        case .all: "All"
        case .partial: "Part paid"
        default: rawValue.humanized
        }
    }

    var status: String? { self == .all ? nil : rawValue }

    /// The header title while this scope is showing.
    var title: String {
        switch self {
        case .all: "Invoices"
        case .draft: "Drafts"
        case .sent: "Awaiting payment"
        case .partial: "Part paid"
        case .overdue: "Overdue"
        case .paid: "Paid"
        case .void: "Void"
        }
    }

    /// The drawer row's label.
    var drawerTitle: String { self == .all ? "All invoices" : title }

    var symbol: String {
        switch self {
        case .all: "doc.text"
        case .draft: "pencil.line"
        case .sent: "paperplane"
        case .partial: "circle.lefthalf.filled"
        case .overdue: "exclamationmark.circle"
        case .paid: "checkmark.circle"
        case .void: "xmark.circle"
        }
    }

    /// Open filters read best by urgency, the rest by recency.
    var sort: (by: String, order: String) {
        switch self {
        case .sent, .partial, .overdue: ("due", "asc")
        default: ("created", "desc")
        }
    }

    var emptyTitle: String {
        switch self {
        case .all: "No invoices yet"
        case .draft: "No drafts"
        case .sent: "Nothing awaiting payment"
        case .partial: "No part paid invoices"
        case .overdue: "Nothing overdue"
        case .paid: "No paid invoices"
        case .void: "No voided invoices"
        }
    }

    var emptyMessage: String {
        switch self {
        case .all: "Create your first invoice and it will show up here."
        case .overdue: "Every customer is paying on time."
        default: "Invoices in this state will show up here."
        }
    }

    var emptySymbol: String {
        switch self {
        case .overdue: "checkmark.seal"
        case .paid: "banknote"
        default: "doc.text"
        }
    }
}

// MARK: - Store

/// Invoices list for one status filter plus the outstanding/overdue summary.
@MainActor @Observable
final class SalesStore {
    enum Phase { case idle, loading, loaded, failed(String) }

    private(set) var invoices: [Invoice] = []
    private(set) var summary: InvoiceSummary?
    private(set) var phase: Phase = .idle
    private(set) var hasMore = false
    private(set) var isLoadingMore = false
    private(set) var filter: SalesFilter = .all

    private var page = 1
    private var generation = 0
    private var loadedFilter: SalesFilter?
    private static let pageSize = 30

    var hasLoaded: Bool {
        if case .loaded = phase { return true }
        return false
    }

    var errorMessage: String? {
        if case let .failed(message) = phase { return message }
        return nil
    }

    /// Customers seen on loaded invoices, newest first, for the picker's "recent" list.
    var recentContacts: [Contact] {
        var seen = Set<String>()
        return invoices.compactMap(\.contact).filter { seen.insert($0.id).inserted }
    }

    func setFilter(_ next: SalesFilter, api: APIClient) async {
        guard next != filter else { return }
        filter = next
        await load(api)
    }

    /// First page plus the summary. Stale rows stay visible while it reloads.
    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        if invoices.isEmpty { phase = .loading }
        let filter = filter

        async let pageResult: Page<Invoice> = api.get("invoices", query: query(page: 1, filter: filter))
        async let summaryResult: InvoiceSummary = api.get("invoices/summary")

        do {
            var result = try await pageResult
            let summary = try? await summaryResult
            #if DEBUG
            // Fixtures ignore query strings, so filter here to keep demo screens honest.
            if DemoData.isEnabled, let status = filter.status {
                result.data = result.data.filter { $0.status == status }
                result.pagination = nil
            }
            #endif
            guard current == generation else { return }
            withAnimation(.snappy) {
                invoices = result.data
                hasMore = result.hasMore
                page = 1
                loadedFilter = filter
                if let summary { self.summary = summary }
                phase = .loaded
            }
        } catch {
            guard current == generation, !(error is CancellationError) else { return }
            if invoices.isEmpty || loadedFilter != filter {
                invoices = []
                phase = .failed(error.localizedDescription)
            }
        }
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let current = generation
        do {
            let result: Page<Invoice> = try await api.get("invoices", query: query(page: page + 1, filter: filter))
            guard current == generation else { return }
            let known = Set(invoices.map(\.id))
            invoices += result.data.filter { !known.contains($0.id) }
            hasMore = result.hasMore
            page += 1
        } catch {
            hasMore = false
        }
    }

    func refreshSummary(_ api: APIClient) async {
        if let fresh: InvoiceSummary = try? await api.get("invoices/summary") {
            withAnimation(.snappy) { summary = fresh }
        }
    }

    /// Draft to sent. Optimistic: the row flips straight away.
    func markSent(_ invoice: Invoice, api: APIClient) async throws {
        let before = invoices
        replace(invoice.id) { $0.status = "sent" }
        do {
            let response: InvoiceResponse = try await api.post("invoices/\(invoice.id)/send")
            replace(invoice.id) { row in
                row.status = response.invoice.status
                row.sentAt = response.invoice.sentAt
            }
            if filter == .draft { remove(invoice.id) }
            await refreshSummary(api)
        } catch {
            withAnimation(.snappy) { invoices = before }
            throw error
        }
    }

    /// Applies a recorded payment to the row, then refreshes the totals.
    func applyPayment(_ updated: Invoice, api: APIClient) async {
        replace(updated.id) { row in
            row.status = updated.status
            row.amountPaid = updated.amountPaid
            row.amountDue = updated.amountDue
            row.paidAt = updated.paidAt
        }
        if let status = filter.status, status != updated.status { remove(updated.id) }
        await refreshSummary(api)
    }

    private func replace(_ id: String, _ change: (inout Invoice) -> Void) {
        guard let index = invoices.firstIndex(where: { $0.id == id }) else { return }
        withAnimation(.snappy) { change(&invoices[index]) }
    }

    private func remove(_ id: String) {
        withAnimation(.snappy) { invoices.removeAll { $0.id == id } }
    }

    private func query(page: Int, filter: SalesFilter) -> [String: String?] {
        [
            "page": String(page),
            "limit": String(Self.pageSize),
            "status": filter.status,
            "sortBy": filter.sort.by,
            "sortOrder": filter.sort.order,
        ]
    }
}

// MARK: - View

/// The Sales tab, a browser of invoices: the scope in a glass header with
/// what's outstanding under it, a drawer of statuses, and a ledger of rows
/// with their own actions (record payment, mark as sent, share).
struct SalesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var store = SalesStore()
    @State private var path = NavigationPath()
    @State private var filter: SalesFilter = .all
    @State private var paying: Invoice?
    @State private var creating = false
    @State private var sharing: SalesSharedFile?
    @State private var busyID: String?
    @State private var drawerOpen = false
    @State private var query = ""
    @State private var rowsShown = false
    @FocusState private var searchFocused: Bool
    @Namespace private var drawerNS

    private var currency: String { env.session.currency }

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }

    /// Search narrows what's loaded: number, customer or reference.
    private var rows: [Invoice] {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return store.invoices }
        return store.invoices.filter { invoice in
            [invoice.invoiceNumber, invoice.salesContactName, invoice.reference ?? ""]
                .contains { $0.localizedCaseInsensitiveContains(term) }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                if searching, store.hasLoaded {
                    SearchResultsLine(count: rows.count)
                }
                list
                    .tabBarClearance()
            }
            .background(DTheme.canvas)
            .toolbar(.hidden, for: .navigationBar)
            .browserDrawer(isOpen: $drawerOpen) { drawer }
            .tabBarPushed(!path.isEmpty, tab: .sales)
            .navigationDestination(for: SalesInvoiceRoute.self) { route in
                InvoiceDetailView(id: route.id)
            }
            .navigationDestination(for: RecordPageRoute.self) { route in
                RecordCatalog.page(route.path)
            }
            .navigationDestination(for: RecordRoute.self) { route in
                RecordCatalog.detail(route)
            }
        }
        .task {
            consumePendingFilter()
            await store.load(env.api)
            #if DEBUG
            openDemoScreen()
            #endif
        }
        .onChange(of: env.router.pendingInvoiceFilter) { _, _ in consumePendingFilter() }
        .onChange(of: filter) { _, next in
            rowsShown = false
            Task {
                await store.setFilter(next, api: env.api)
                rowsShown = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .salesInvoicesChanged)) { _ in
            Task { await store.load(env.api) }
        }
        .sheet(item: $paying) { invoice in
            SalesRecordPaymentSheet(invoice: invoice) { updated in
                Task { await store.applyPayment(updated, api: env.api) }
            }
        }
        .sheet(isPresented: $creating) {
            NewInvoiceSheet(recentContacts: store.recentContacts) { created in
                Task { await store.load(env.api) }
                path.append(SalesInvoiceRoute(id: created.id))
            }
        }
        .sheet(item: $sharing) { file in
            SalesShareSheet(url: file.url)
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
    }

    // MARK: Header

    private var header: some View {
        BrowserHeader(
            title: filter.title,
            subtitle: subtitle,
            query: $query,
            searchPrompt: "Number, customer or reference",
            searchFocused: $searchFocused,
            menuLabel: "Invoice filters",
            onMenu: openDrawer
        ) {
            HeaderPrimaryButton(symbol: "plus", label: "New invoice") { creating = true }
        }
    }

    /// "$27.6K open · $14.8K overdue", the overdue part in red.
    private var subtitle: Text? {
        if filter == .all {
            guard let summary = store.summary else { return nil }
            let outstanding = Text("\(Money.short(summary.outstanding, currency: currency)) open")
            guard summary.overdue > 0 else { return outstanding }
            let overdue = Text("\(Money.short(summary.overdue, currency: currency)) overdue")
                .foregroundStyle(DTheme.negative).fontWeight(.semibold)
            return Text("\(outstanding) · \(overdue)")
        }
        guard store.hasLoaded else { return nil }
        let count = store.invoices.count
        let total = store.invoices.reduce(0) { $0 + $1.salesHeadlineAmount }
        return Text("\(count)\(store.hasMore ? "+" : "") \(count == 1 ? "invoice" : "invoices") · \(Money.short(total, currency: currency))")
    }

    // MARK: List

    @ViewBuilder
    private var list: some View {
        if store.invoices.isEmpty {
            Group {
                if let message = store.errorMessage {
                    ErrorStateView(message: message) { await store.load(env.api) }
                } else if store.hasLoaded {
                    EmptyStateView(
                        symbol: filter.emptySymbol,
                        title: filter.emptyTitle,
                        message: filter.emptyMessage,
                        actionTitle: filter == .all || filter == .draft ? "New invoice" : nil,
                        action: { creating = true }
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: store.hasLoaded ? .center : .top)
        } else {
            List {
                if !searching, filter == .all || filter == .overdue {
                    totals
                        .padding(.vertical, 14)
                        .ledgerRow()
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, invoice in
                    NavigationLink(value: SalesInvoiceRoute(id: invoice.id)) {
                        SalesInvoiceRow(invoice: invoice, busy: busyID == invoice.id)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .swipeActions(edge: .leading, allowsFullSwipe: true) { leadingSwipe(for: invoice) }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button { share(invoice) } label: { Label("Share PDF", systemImage: "square.and.arrow.up") }
                            .tint(DTheme.accent)
                    }
                    .contextMenu { menuActions(for: invoice) }
                }
                if store.hasMore, !searching {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                    .frame(height: 44)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
                    .task { await store.loadMore(env.api) }
                } else if !searching {
                    LedgerEndMarker(text: "\(rows.count) \(rows.count == 1 ? "invoice" : "invoices")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await store.load(env.api) }
            .onAppear { rowsShown = true }
        }
    }

    private var totals: some View {
        let summary = store.summary
        return LedgerTotals(items: [
            .init(
                label: "Outstanding",
                value: summary.map { Money.compact($0.outstanding, currency: currency) },
                detail: summary.map { $0.outstandingCount == 1 ? "1 invoice" : "\($0.outstandingCount) invoices" },
                tint: DTheme.accent,
                action: { filter = .all }
            ),
            .init(
                label: "Overdue",
                value: summary.map { Money.compact($0.overdue, currency: currency) },
                detail: summary.map { $0.overdueCount == 1 ? "1 invoice" : "\($0.overdueCount) invoices" },
                tint: (summary?.overdue ?? 0) > 0 ? DTheme.negative : DTheme.positive,
                action: { filter = .overdue }
            ),
        ])
    }

    // MARK: Drawer

    private var drawer: some View {
        DrawerScaffold {
            DrawerSection(title: "Status") {
                ForEach(Array(SalesFilter.allCases.enumerated()), id: \.element) { index, option in
                    DrawerRow(
                        symbol: option.symbol,
                        title: option.drawerTitle,
                        count: drawerCount(option),
                        accent: option == .overdue ? DTheme.negative : nil,
                        selected: filter == option,
                        namespace: drawerNS,
                        index: index,
                        revealed: drawerOpen
                    ) { select(option) }
                }
            }
            DrawerSection(title: "More in Sales") {
                ForEach(Array(Self.morePages.enumerated()), id: \.element.path) { offset, page in
                    DrawerRow(symbol: page.symbol, title: page.title, selected: false, namespace: drawerNS, index: 8 + offset, revealed: drawerOpen) {
                        open(page.path)
                    }
                }
            }
            DrawerSection(title: "Create") {
                DrawerRow(symbol: "plus.circle", title: "New invoice", selected: false, namespace: drawerNS, index: 12, revealed: drawerOpen) {
                    closeDrawer()
                    creating = true
                }
                DrawerRow(tilly: true, title: "Ask Tilly about sales", selected: false, namespace: drawerNS, index: 13, revealed: drawerOpen) {
                    closeDrawer()
                    env.router.askTilly("Who owes me money, and who should I chase first?", page: "sales")
                }
            }
        }
    }

    /// The rest of Sales, opened inside this tab.
    private static let morePages: [(title: String, symbol: String, path: String)] = [
        ("Quotes", "doc.plaintext", "/sales/quotes"),
        ("Credit notes", "arrow.uturn.backward.circle", "/sales/credit-notes"),
        ("Payments", "creditcard", "/sales/payments"),
        ("Recurring invoices", "repeat", "/sales/recurring"),
    ]

    private func open(_ webPath: String) {
        closeDrawer()
        path.append(RecordPageRoute(path: webPath))
    }

    private func drawerCount(_ option: SalesFilter) -> Int? {
        switch option {
        case .all: store.summary?.totalCount
        case .overdue: store.summary?.overdueCount
        default: nil
        }
    }

    private func openDrawer() {
        searchFocused = false
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = true }
    }

    private func closeDrawer() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = false }
    }

    private func select(_ option: SalesFilter) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.8)) { filter = option }
        // Let the tile slide to the tapped row before closing.
        Task {
            try? await Task.sleep(for: .milliseconds(260))
            closeDrawer()
        }
    }

    // MARK: Row actions

    @ViewBuilder
    private func leadingSwipe(for invoice: Invoice) -> some View {
        if invoice.salesIsOpen {
            Button {
                paying = invoice
            } label: {
                Label("Record payment", systemImage: "banknote")
            }
            .tint(DTheme.positive)
        } else if invoice.status == "draft" {
            Button {
                markSent(invoice)
            } label: {
                Label("Mark as sent", systemImage: "paperplane")
            }
            .tint(DTheme.accent)
        }
    }

    @ViewBuilder
    private func menuActions(for invoice: Invoice) -> some View {
        if invoice.salesIsOpen {
            Button { paying = invoice } label: { Label("Record payment", systemImage: "banknote") }
        } else if invoice.status == "draft" {
            Button { markSent(invoice) } label: { Label("Mark as sent", systemImage: "paperplane") }
        }
        Button { share(invoice) } label: { Label("Share PDF", systemImage: "square.and.arrow.up") }
        Button {
            env.router.askTilly("Tell me about invoice \(invoice.invoiceNumber) for \(invoice.salesContactName).", page: "sales")
        } label: {
            Label("Ask Tilly", systemImage: "sparkle")
        }
    }

    private func markSent(_ invoice: Invoice) {
        Task {
            do {
                try await store.markSent(invoice, api: env.api)
                env.toast.show("Marked as sent")
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func share(_ invoice: Invoice) {
        guard busyID == nil else { return }
        busyID = invoice.id
        Task {
            defer { busyID = nil }
            do {
                sharing = SalesSharedFile(url: try await SalesPDF.file(for: invoice, api: env.api))
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func consumePendingFilter() {
        guard let pending = env.router.pendingInvoiceFilter else { return }
        env.router.pendingInvoiceFilter = nil
        let next = SalesFilter(rawValue: pending) ?? .all
        if !path.isEmpty { path = NavigationPath() }
        filter = next
    }

    #if DEBUG
    /// DUBBL_DEMO_OPEN: invoice | payment | new | drawer | overdue | draft | paid ...
    private func openDemoScreen() {
        guard DemoData.isEnabled, let open = DemoData.open else { return }
        switch open {
        case "invoice", "invoice-bottom":
            if let first = store.invoices.first(where: { $0.status == "partial" }) ?? store.invoices.first {
                path.append(SalesInvoiceRoute(id: first.id))
            }
        case "draft-invoice":
            if let draft = store.invoices.first(where: { $0.status == "draft" }) {
                path.append(SalesInvoiceRoute(id: draft.id))
            }
        case "payment":
            paying = store.invoices.first(where: \.salesIsOpen)
        case "new", "new-filled", "new-picker":
            creating = true
        case "drawer":
            openDrawer()
        case "search":
            query = "glo"
        default:
            if let preset = SalesFilter(rawValue: open) { filter = preset }
        }
    }
    #endif
}

// MARK: - Pieces

/// One invoice as a ledger line: customer, then the number and when it's
/// due; the amount still owed and its status on the right.
struct SalesInvoiceRow: View {
    let invoice: Invoice
    var busy = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(invoice.salesContactName)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(invoice.invoiceNumber)
                        .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                    Text(invoice.salesDueText)
                        .font(.system(size: 13))
                        .foregroundStyle(invoice.salesIsLate ? DTheme.negative : DTheme.inkSecondary)
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                if busy {
                    ProgressView().controlSize(.small)
                } else {
                    Text(Money.format(invoice.salesHeadlineAmount, currency: invoice.currencyCode))
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(invoice.status == "void" ? DTheme.inkTertiary : DTheme.ink)
                        .strikethrough(invoice.status == "void", color: DTheme.inkTertiary)
                        .fixedSize()
                }
                LedgerStatus(text: InvoiceStatus.label(invoice.status), tone: InvoiceStatus.tone(invoice.status))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
