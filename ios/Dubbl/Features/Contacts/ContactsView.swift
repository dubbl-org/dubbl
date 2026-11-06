import SwiftUI

struct ContactsRoute: Hashable {
    let id: String
}

/// The scopes the Contacts drawer offers. All, Customers and Suppliers are
/// named lists paged from the server; the balance scopes are everyone with
/// an open balance, loaded in one go and filtered here.
enum ContactsScope: String, CaseIterable, Hashable {
    case all, customers, suppliers
    case owesYou = "owes-you", youOwe = "you-owe", overdue

    static let lists: [ContactsScope] = [.all, .customers, .suppliers]
    static let balances: [ContactsScope] = [.owesYou, .youOwe, .overdue]

    var isBalance: Bool { Self.balances.contains(self) }

    /// Customers and suppliers come from the balances endpoint, which counts
    /// "both" contacts on each side and pages by name.
    var side: ContactsSide? {
        switch self {
        case .customers: .customer
        case .suppliers: .supplier
        default: nil
        }
    }

    /// The header title while this scope is showing.
    var title: String {
        switch self {
        case .all: "Contacts"
        case .customers: "Customers"
        case .suppliers: "Suppliers"
        case .owesYou: "Owe you"
        case .youOwe: "You owe"
        case .overdue: "Overdue"
        }
    }

    /// The drawer row's label.
    var drawerTitle: String { self == .all ? "All contacts" : title }

    var symbol: String {
        switch self {
        case .all: "person.2"
        case .customers: "person.crop.circle"
        case .suppliers: "shippingbox"
        case .owesYou: "arrow.down.left.circle"
        case .youOwe: "arrow.up.right.circle"
        case .overdue: "exclamationmark.circle"
        }
    }

    /// "3 customers" for the end of the ledger.
    func count(_ n: Int) -> String {
        let noun = switch self {
        case .customers: n == 1 ? "customer" : "customers"
        case .suppliers: n == 1 ? "supplier" : "suppliers"
        default: n == 1 ? "contact" : "contacts"
        }
        return "\(n) \(noun)"
    }

    var emptyTitle: String {
        switch self {
        case .all: "No contacts yet"
        case .customers: "No customers yet"
        case .suppliers: "No suppliers yet"
        case .owesYou: "Nobody owes you"
        case .youOwe: "You don't owe anyone"
        case .overdue: "Nothing overdue"
        }
    }

    var emptyMessage: String {
        switch self {
        case .all: "Add the people and businesses you invoice and buy from."
        case .customers: "Customers you invoice show up here."
        case .suppliers: "Suppliers you get bills from show up here."
        case .owesYou: "Customers with unpaid invoices show up here."
        case .youOwe: "Suppliers with unpaid bills show up here."
        case .overdue: "Everyone is paid up on time."
        }
    }

    var emptySymbol: String {
        switch self {
        case .owesYou, .youOwe: "banknote"
        case .overdue: "checkmark.seal"
        default: symbol
        }
    }
}

// MARK: - Store

@MainActor @Observable
final class ContactsStore {
    struct RequestKey: Hashable {
        var scope: ContactsScope
        var query: String
    }

    var scope: ContactsScope = .all
    var query = ""

    /// The named list (All, Customers or Suppliers), a page at a time.
    private(set) var contacts: [Contact] = []
    private(set) var hasMore = false
    private(set) var hasLoaded = false
    private(set) var error: String?
    private(set) var loadedKey = RequestKey(scope: .all, query: "")
    /// How many contacts each named list holds, from its last unsearched load.
    private(set) var counts: [ContactsScope: Int] = [:]
    private(set) var balances: ContactsOpenBalances?
    private(set) var balancesError: String?
    private var page = 1
    private var isLoadingMore = false
    private var generation = 0
    private var balancesGeneration = 0

    init() {
        #if DEBUG
        if DemoData.isEnabled, DemoData.open == "search" { query = "ac" }
        #endif
    }

    /// What the named list should hold; nil while a balance scope is showing.
    var listKey: RequestKey? { scope.isBalance ? nil : RequestKey(scope: scope, query: trimmedQuery) }
    var isSearching: Bool { !trimmedQuery.isEmpty }
    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    /// The rows for the current scope. Balance scopes search what's loaded.
    var rows: [Contact] {
        guard scope.isBalance else { return contacts }
        guard let balances else { return [] }
        let rows = switch scope {
        case .owesYou: balances.owingYou
        case .youOwe: balances.owedByYou
        default: balances.late
        }
        let term = trimmedQuery
        guard !term.isEmpty else { return rows }
        return rows.filter { $0.name.localizedCaseInsensitiveContains(term) || ($0.email ?? "").localizedCaseInsensitiveContains(term) }
    }

    /// The current scope has an answer, rows or not.
    var isReady: Bool { scope.isBalance ? balances != nil || balancesError != nil : hasLoaded }

    var errorMessage: String? { scope.isBalance ? (balances == nil ? balancesError : nil) : error }

    /// Everything: the current list and the open balances, side by side.
    func load(_ api: APIClient) async {
        async let list: Void = loadList(api, force: true)
        async let open: Void = loadBalances(api)
        _ = await (list, open)
    }

    /// Reloads the first page of the named list. Rows stay on screen until
    /// the answer lands; a balance scope has nothing to fetch here.
    func loadList(_ api: APIClient, force: Bool = false) async {
        guard let key = listKey, force || key != loadedKey || !hasLoaded else { return }
        generation += 1
        let gen = generation
        do {
            let result = try await fetch(api, key: key, page: 1)
            guard gen == generation else { return }
            withAnimation(.snappy) {
                contacts = result.rows
                hasMore = result.hasMore
                page = 1
                loadedKey = key
                if key.query.isEmpty { counts[key.scope] = result.total }
                hasLoaded = true
                error = nil
            }
        } catch {
            guard gen == generation, !(error is CancellationError) else { return }
            if contacts.isEmpty || !hasLoaded || loadedKey.scope != key.scope {
                contacts = []
                self.error = error.localizedDescription
            }
            hasLoaded = true
        }
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let gen = generation
        let key = loadedKey
        do {
            let result = try await fetch(api, key: key, page: page + 1)
            guard gen == generation else { return }
            let known = Set(contacts.map(\.id))
            withAnimation(.snappy) {
                contacts += result.rows.filter { !known.contains($0.id) }
                hasMore = result.hasMore
                page += 1
            }
        } catch {
            hasMore = false
        }
    }

    func loadBalances(_ api: APIClient) async {
        balancesGeneration += 1
        let gen = balancesGeneration
        do {
            async let customers = fetchOpen(api, side: .customer)
            async let suppliers = fetchOpen(api, side: .supplier)
            let next = try await ContactsOpenBalances(customers: customers, suppliers: suppliers)
            guard gen == balancesGeneration else { return }
            withAnimation(.snappy) {
                balances = next
                balancesError = nil
            }
        } catch {
            guard gen == balancesGeneration, !(error is CancellationError) else { return }
            if balances == nil { balancesError = error.localizedDescription }
        }
    }

    func insert(_ contact: Contact) {
        guard !contacts.contains(where: { $0.id == contact.id }) else { return }
        withAnimation(.snappy) {
            contacts.append(contact)
            contacts.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
        for scope in ContactsScope.lists where scope == .all || contact.type == "both" || scope.side?.rawValue == contact.type {
            counts[scope] = counts[scope].map { $0 + 1 }
        }
    }

    private func fetch(_ api: APIClient, key: RequestKey, page: Int) async throws -> (rows: [Contact], hasMore: Bool, total: Int) {
        let search: String? = key.query.isEmpty ? nil : key.query
        var rows: [Contact]
        let more: Bool
        var total: Int?
        if let side = key.scope.side {
            let result: Page<ContactsBalance> = try await api.get("contacts/balances", query: [
                "side": side.rawValue, "search": search, "page": "\(page)", "limit": "50",
            ])
            rows = result.data.filter { side.types.contains($0.type ?? "") }.map { $0.asContact(side: side) }
            more = result.hasMore
            total = result.pagination?.total
        } else {
            let result: Page<Contact> = try await api.get("contacts", query: [
                "sortBy": "name", "sortOrder": "asc", "search": search, "page": "\(page)", "limit": "50",
            ])
            rows = result.data
            more = result.hasMore
            total = result.pagination?.total
        }
        #if DEBUG
        // Fixtures ignore query strings, so search and count here.
        if DemoData.isEnabled {
            if let search {
                rows = rows.filter { $0.name.localizedCaseInsensitiveContains(search) || ($0.email ?? "").localizedCaseInsensitiveContains(search) }
            }
            total = rows.count
        }
        #endif
        rows.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return (rows, more, total ?? rows.count)
    }

    /// One side's open balances, every page (capped, 100 a page).
    private func fetchOpen(_ api: APIClient, side: ContactsSide) async throws -> [ContactsBalance] {
        var rows: [ContactsBalance] = []
        var page = 1
        var more = true
        while more, page <= 10 {
            let result: Page<ContactsBalance> = try await api.get("contacts/balances", query: [
                "side": side.rawValue, "open": "1", "page": "\(page)", "limit": "100",
            ])
            rows += result.data
            more = result.hasMore
            page += 1
        }
        // "Open" is any unpaid document; only money still owed makes a row.
        return rows.filter { side.types.contains($0.type ?? "") && $0.outstanding > 0 }
    }
}

// MARK: - View

/// The Contacts tab, a browser of customers and suppliers: the scope in a
/// glass header with what's owed under it, a drawer of lists and balances,
/// and a ledger of contacts with their own actions (call, email, ask Tilly).
struct ContactsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var store = ContactsStore()
    @State private var path: [ContactsRoute] = []
    @State private var showNew = false
    @State private var drawerOpen = false
    @State private var rowsShown = false
    @FocusState private var searchFocused: Bool
    @Namespace private var drawerNS
    #if DEBUG
    @State private var showDemoSettings = false
    #endif

    private var currency: String { env.session.currency }
    private var scope: ContactsScope { store.scope }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                header
                if store.isSearching, store.isReady {
                    SearchResultsLine(count: store.rows.count)
                }
                list
                    .tabBarClearance()
            }
            .background(DTheme.canvas)
            .toolbar(.hidden, for: .navigationBar)
            .browserDrawer(isOpen: $drawerOpen) { drawer }
            .tabBarPushed(!path.isEmpty, tab: .contacts)
            .navigationDestination(for: ContactsRoute.self) { route in
                ContactDetailView(id: route.id)
            }
        }
        .task {
            await store.load(env.api)
            // The scope or search may have moved while the first page loaded.
            await store.loadList(env.api)
            #if DEBUG
            openDemoScreen()
            #endif
        }
        // Named lists load here when the scope changes, and search on the
        // server a beat after typing stops.
        .task(id: store.listKey) {
            guard store.hasLoaded, let key = store.listKey else { return }
            if key != store.loadedKey {
                if key.scope == store.loadedKey.scope {
                    try? await Task.sleep(for: .milliseconds(300))
                    if Task.isCancelled { return }
                }
                await store.loadList(env.api)
            }
            rowsShown = true
        }
        .onChange(of: store.scope) { _, next in
            rowsShown = false
            guard next.isBalance else { return }
            // Balance scopes are already loaded: one beat, then rise in.
            Task {
                try? await Task.sleep(for: .milliseconds(60))
                rowsShown = true
            }
        }
        .sheet(isPresented: $showNew) {
            ContactsNewContactSheet { created in
                store.insert(created)
                path.append(ContactsRoute(id: created.id))
            }
        }
        #if DEBUG
        .sheet(isPresented: $showDemoSettings) { SettingsView() }
        #endif
    }

    // MARK: Header

    private var header: some View {
        @Bindable var store = store
        return BrowserHeader(
            title: scope.title,
            subtitle: subtitle,
            query: $store.query,
            searchPrompt: "Name or email",
            searchFocused: $searchFocused,
            menuLabel: "Contact lists",
            onMenu: openDrawer
        ) {
            HeaderPrimaryButton(symbol: "plus", label: "New contact") { showNew = true }
        }
    }

    /// "14 contacts · $57.8K owed to you", or the overdue part of it in red.
    private var subtitle: Text? {
        guard let balances = store.balances else { return nil }
        let money = { (amount: Int) in Money.short(amount, currency: currency) }
        let late = { (amount: Int) in
            Text("\(money(amount)) overdue").foregroundStyle(DTheme.negative).fontWeight(.semibold)
        }
        switch scope {
        case .all, .customers, .suppliers:
            guard let count = store.counts[scope] else { return nil }
            let lead = Text(scope.count(count))
            if scope == .suppliers {
                guard balances.youOweOverdue == 0 else { return Text("\(lead)  ·  \(late(balances.youOweOverdue))") }
                return Text("\(lead)  ·  \(money(balances.youOwe)) to pay")
            }
            // Late money owed to you is the thing to act on; otherwise what's owed.
            guard balances.owedToYouOverdue == 0 else { return Text("\(lead)  ·  \(late(balances.owedToYouOverdue))") }
            return Text("\(lead)  ·  \(money(balances.owedToYou)) owed to you")
        case .owesYou:
            let open = Text("\(money(balances.owedToYou)) open")
            guard balances.owedToYouOverdue > 0 else { return open }
            return Text("\(open)  ·  \(late(balances.owedToYouOverdue))")
        case .youOwe:
            let open = Text("\(money(balances.youOwe)) to pay")
            guard balances.youOweOverdue > 0 else { return open }
            return Text("\(open)  ·  \(late(balances.youOweOverdue))")
        case .overdue:
            let lead = Text(scope.count(balances.overdueCount))
            let total = balances.owedToYouOverdue + balances.youOweOverdue
            guard total > 0 else { return lead }
            return Text("\(lead)  ·  \(late(total))")
        }
    }

    // MARK: List

    @ViewBuilder
    private var list: some View {
        let rows = store.rows
        if rows.isEmpty {
            Group {
                if let message = store.errorMessage {
                    ErrorStateView(message: message) { await store.load(env.api) }
                } else if store.isReady {
                    emptyState
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: store.isReady ? .center : .top)
        } else {
            List {
                if !store.isSearching, [.all, .owesYou, .youOwe].contains(scope) {
                    totals
                        .padding(.vertical, 14)
                        .ledgerRow()
                }
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, contact in
                    NavigationLink(value: ContactsRoute(id: contact.id)) {
                        ContactsRow(contact: contact, scope: scope, currency: contact.currencyCode ?? currency)
                    }
                    .navigationLinkIndicatorVisibility(.hidden)
                    .ledgerRow()
                    .reveal(rowsShown, min(index, 8))
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if let url = contact.mailURL {
                            Button { openURL(url) } label: { Label("Email", systemImage: "envelope") }
                                .tint(DTheme.info)
                        }
                        if let url = contact.telURL {
                            Button { openURL(url) } label: { Label("Call", systemImage: "phone") }
                                .tint(DTheme.positive)
                        }
                    }
                    .contextMenu { menuActions(for: contact) }
                }
                if store.hasMore, !scope.isBalance {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                    .frame(height: 44)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
                    .task { await store.loadMore(env.api) }
                } else if !store.isSearching {
                    LedgerEndMarker(text: scope.count(rows.count))
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
        let balances = store.balances
        let contacts = { (n: Int) in n == 1 ? "1 contact" : "\(n) contacts" }
        return LedgerTotals(items: [
            .init(
                label: "Owed to you",
                value: balances.map { Money.compact($0.owedToYou, currency: currency) },
                detail: balances.map { contacts($0.customers.count) },
                tint: DTheme.accent,
                action: { select(.owesYou) }
            ),
            .init(
                label: "You owe",
                value: balances.map { Money.compact($0.youOwe, currency: currency) },
                detail: balances.map { contacts($0.suppliers.count) },
                tint: DTheme.inkTertiary,
                action: { select(.youOwe) }
            ),
        ])
    }

    @ViewBuilder
    private var emptyState: some View {
        if store.isSearching {
            EmptyStateView(
                symbol: "magnifyingglass",
                title: "No matches",
                message: "Nothing matches \u{201C}\(store.query.trimmingCharacters(in: .whitespaces))\u{201D}."
            )
        } else {
            EmptyStateView(
                symbol: scope.emptySymbol,
                title: scope.emptyTitle,
                message: scope.emptyMessage,
                actionTitle: scope.isBalance ? nil : "Add contact",
                action: { showNew = true }
            )
        }
    }

    // MARK: Drawer

    private var drawer: some View {
        DrawerScaffold {
            DrawerSection(title: "Contacts") {
                ForEach(Array(ContactsScope.lists.enumerated()), id: \.element) { index, option in
                    drawerRow(option, count: store.counts[option], index: index)
                }
            }
            DrawerSection(title: "Balances") {
                ForEach(Array(ContactsScope.balances.enumerated()), id: \.element) { index, option in
                    drawerRow(option, count: balanceCount(option), index: index + 3)
                }
            }
            DrawerSection(title: "Create") {
                DrawerRow(symbol: "plus.circle", title: "New contact", selected: false, namespace: drawerNS, index: 6, revealed: drawerOpen) {
                    closeDrawer()
                    showNew = true
                }
                DrawerRow(tilly: true, title: "Ask Tilly about contacts", selected: false, namespace: drawerNS, index: 7, revealed: drawerOpen) {
                    closeDrawer()
                    env.router.askTilly("Who owes me the most, and who should I chase first?", page: "contacts")
                }
            }
        }
    }

    private func drawerRow(_ option: ContactsScope, count: Int?, index: Int) -> some View {
        DrawerRow(
            symbol: option.symbol,
            title: option.drawerTitle,
            count: count,
            accent: option == .overdue ? DTheme.negative : nil,
            selected: scope == option,
            namespace: drawerNS,
            index: index,
            revealed: drawerOpen
        ) { select(option) }
    }

    private func balanceCount(_ option: ContactsScope) -> Int? {
        guard let balances = store.balances else { return nil }
        return switch option {
        case .owesYou: balances.customers.count
        case .youOwe: balances.suppliers.count
        default: balances.overdueCount
        }
    }

    private func openDrawer() {
        searchFocused = false
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = true }
    }

    private func closeDrawer() {
        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) { drawerOpen = false }
    }

    private func select(_ option: ContactsScope) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.8)) { store.scope = option }
        guard drawerOpen else { return }
        // Let the tile slide to the tapped row before closing.
        Task {
            try? await Task.sleep(for: .milliseconds(260))
            closeDrawer()
        }
    }

    // MARK: Row actions

    @ViewBuilder
    private func menuActions(for contact: Contact) -> some View {
        if let url = contact.telURL {
            Button { openURL(url) } label: { Label("Call", systemImage: "phone") }
        }
        if let url = contact.mailURL {
            Button { openURL(url) } label: { Label("Email", systemImage: "envelope") }
        }
        if let email = contact.email, !email.isEmpty {
            Button { UIPasteboard.general.string = email } label: { Label("Copy email", systemImage: "doc.on.doc") }
        }
        Button {
            env.router.askTilly("Tell me about \(contact.name): what they owe me, what I owe them and how they pay.", page: "contacts")
        } label: {
            Label("Ask Tilly about \(contact.name)", systemImage: "sparkle")
        }
    }

    #if DEBUG
    /// DUBBL_DEMO_OPEN: contact | settings | new-contact | drawer | search | customers | owes-you | overdue ...
    private func openDemoScreen() {
        guard DemoData.isEnabled, let open = DemoData.open, path.isEmpty else { return }
        if open.hasPrefix("contact") {
            path = [ContactsRoute(id: "demo-contact-acme")]
        } else if open.hasPrefix("settings") {
            showDemoSettings = true
        } else if open == "new-contact" {
            showNew = true
        } else if open == "drawer" {
            openDrawer()
        } else if let preset = ContactsScope(rawValue: open) {
            store.scope = preset
        }
    }
    #endif
}

// MARK: - Row

/// One contact as a ledger line: avatar, name and email, with the balance
/// that matters on the right and whether any of it is late.
struct ContactsRow: View {
    let contact: Contact
    let scope: ContactsScope
    let currency: String

    var body: some View {
        HStack(spacing: 12) {
            Avatar(name: contact.name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(contact.name)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            if let balance {
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.format(balance.amount, currency: currency))
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                        .fixedSize()
                    LedgerStatus(text: balance.caption, tone: balance.tone)
                }
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        if let email = contact.email, !email.isEmpty { return email }
        return contact.typeLabel
    }

    private var balance: (amount: Int, caption: String, tone: Tone)? {
        let owesYou = contact.owesYou ?? 0
        let youOwe = contact.youOwe ?? 0
        let (amount, caption, tone): (Int, String, Tone) = switch scope {
        case .customers, .owesYou: (owesYou, "Owes you", .info)
        case .suppliers, .youOwe: (youOwe, "You owe", .neutral)
        default: owesYou > 0 ? (owesYou, "Owes you", .info) : (youOwe, "You owe", .neutral)
        }
        guard amount > 0 else { return nil }
        let overdue = min(contact.overdue ?? 0, amount)
        if overdue > 0 {
            let text = overdue >= amount ? "All overdue" : "\(Money.short(overdue, currency: currency)) overdue"
            return (amount, text, .negative)
        }
        return (amount, caption, tone)
    }
}
