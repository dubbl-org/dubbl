import SwiftUI

/// Pushed inside the More stack.
enum MoreRoute: Hashable {
    case module(String)
    case notifications
    case bankAccounts
    case account(BankAccount)
    case organizations
}

/// Live figures for the tiles. Each call is optional: a tile without its
/// figure still opens.
@MainActor @Observable
final class MoreStore {
    private(set) var invoices: InvoiceSummary?
    private(set) var bills: StatusCounts?
    private(set) var contactsTotal: Int?
    private(set) var accounts: [BankAccount]?
    private(set) var unread = 0

    var activeAccounts: [BankAccount] { accounts?.filter(\.isActive) ?? [] }

    var billsToPay: Int { ["received", "partial", "overdue"].reduce(0) { $0 + (bills?.amount($1) ?? 0) } }

    func cash(in currency: String) -> Int {
        activeAccounts.filter { $0.currencyCode == currency }.reduce(0) { $0 + $1.balance }
    }

    func load(_ api: APIClient) async {
        async let invoices: InvoiceSummary? = try? api.get("invoices/summary")
        async let bills: StatusCounts? = try? api.get("bills/counts")
        async let contacts: Page<Contact>? = try? api.get("contacts", query: ["limit": "1"])
        async let accounts: BankAccountsResponse? = try? api.get("bank-accounts")
        async let notifications: NotificationsPage? = try? api.get("notifications", query: ["limit": "1"])
        let results = await (invoices, bills, contacts, accounts, notifications)
        withAnimation(.snappy) {
            self.invoices = results.0 ?? self.invoices
            self.bills = results.1 ?? self.bills
            if let page = results.2 { contactsTotal = page.pagination?.total ?? page.data.count }
            self.accounts = results.3?.bankAccounts ?? self.accounts
            if let page = results.4 { unread = page.unreadCount }
        }
    }
}

/// The fifth tab: you and your organization at the top, then every area of
/// dubbl with the pages inside it, and one field that searches both pages and
/// records.
struct MoreView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var store = MoreStore()
    @State private var search = SearchStore()
    @State private var path = NavigationPath()
    @State private var query = ""
    @State private var showSettings = false
    @State private var appeared = false
    @FocusState private var fieldFocused: Bool

    private var currency: String { env.session.currency }
    private var term: String { query.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 14) {
                        titleRow
                        searchField
                    }
                    if term.isEmpty {
                        profileCard
                            .reveal(appeared, 0)
                        dailyTiles
                        businessList
                            .reveal(appeared, 5)
                        settingsList
                            .reveal(appeared, 6)
                        footer
                    } else {
                        MoreSearchResults(term: term, store: search, open: open)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .animation(.snappy(duration: 0.22), value: term.isEmpty)
            }
            .scrollDismissesKeyboard(.immediately)
            .defaultScrollAnchor(demoAnchor)
            .background(DTheme.shell)
            .refreshable { await store.load(env.api) }
            .tabBarClearance()
            .toolbarVisibility(.hidden, for: .navigationBar)
            .tabBarPushed(!path.isEmpty, tab: .more)
            .navigationDestination(for: MoreRoute.self) { route in
                destination(route)
            }
            .navigationDestination(for: SearchRoute.self) { route in
                SearchDestination(route: route)
            }
            .navigationDestination(for: RecordPageRoute.self) { route in
                RecordCatalog.page(route.path)
            }
            .navigationDestination(for: RecordRoute.self) { route in
                RecordCatalog.detail(route)
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .task(id: env.session.orgGeneration) { await store.load(env.api) }
        .task(id: query) {
            guard search.isActive(term) else {
                search.clear()
                return
            }
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
            await search.search(env.api, term: term)
        }
        .onAppear { appeared = true }
        .onChange(of: path.count) { old, new in
            if new == 0, old > 0 { Task { await store.load(env.api) } }
        }
        #if DEBUG
        .onAppear(perform: openDemoScreen)
        #endif
    }

    /// Screenshots of the lower half: DUBBL_DEMO_OPEN=more-bottom.
    private var demoAnchor: UnitPoint? {
        #if DEBUG
        if DemoData.isEnabled, DemoData.open == "more-bottom" { return .bottom }
        #endif
        return nil
    }

    // MARK: Header

    private var titleRow: some View {
        HStack(alignment: .center) {
            Text("More")
                .font(.system(size: 32, weight: .semibold))
                .tracking(-0.9)
                .foregroundStyle(DTheme.ink)
            Spacer()
            GlassCircleButton(
                symbol: "bell",
                label: store.unread > 0 ? "Notifications, \(store.unread) unread" : "Notifications",
                badge: store.unread > 0
            ) {
                path.append(MoreRoute.notifications)
            }
        }
        .padding(.leading, 4)
    }

    private var searchField: some View {
        HStack(spacing: 9) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            TextField(text: $query) {
                Text("Pages, invoices, bills, contacts").foregroundStyle(DTheme.inkTertiary)
            }
            .font(.system(size: 17))
            .foregroundStyle(DTheme.ink)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .focused($fieldFocused)
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 17))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 50)
        .glassEffect(.regular.interactive(), in: Capsule())
        .contentShape(Capsule())
        .onTapGesture { fieldFocused = true }
    }

    // MARK: You and your organization

    private var profileCard: some View {
        let user = env.session.user
        let org = env.session.currentOrg
        return VStack(spacing: 0) {
            Button {
                showSettings = true
            } label: {
                HStack(spacing: 14) {
                    Avatar(name: user?.displayName ?? "?", imageURL: user?.image, size: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(user?.displayName ?? "Your profile")
                            .font(.system(size: 20, weight: .semibold))
                            .tracking(-0.3)
                            .foregroundStyle(DTheme.ink)
                            .lineLimit(1)
                        Text(user?.email ?? "")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer(minLength: 8)
                    Text("Profile")
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .padding(.horizontal, 12)
                        .frame(height: 30)
                        .background(DTheme.tint, in: Capsule())
                }
                .padding(16)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .accessibilityLabel("Profile and app settings")

            Hairline()

            HStack(spacing: 0) {
                Button {
                    path.append(MoreRoute.module(MoreDirectory.organization.key))
                } label: {
                    cell("Organization", org?.name ?? "Choose") {
                        Avatar(name: org?.name ?? "?", imageURL: org?.logo, size: 18)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(RowPressStyle())
                .accessibilityLabel("Organization settings")

                Rectangle().fill(DTheme.hairline).frame(width: 0.5).padding(.vertical, 12)

                if env.session.organizations.count > 1 {
                    Button {
                        path.append(MoreRoute.organizations)
                    } label: {
                        cell("Switch", "\(env.session.organizations.count) orgs") {
                            Image(systemName: "arrow.left.arrow.right")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    .buttonStyle(RowPressStyle())
                } else {
                    cell("Role", org?.role?.rawValue.humanized ?? "Member") { EmptyView() }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func cell(_ caption: String, _ value: String, @ViewBuilder leading: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(caption)
                .font(.system(size: 12))
                .foregroundStyle(DTheme.inkSecondary)
            HStack(spacing: 6) {
                leading()
                Text(value)
                    .font(.system(size: 14.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    // MARK: Areas

    private var dailyTiles: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Your books")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Array(MoreDirectory.daily.enumerated()), id: \.element.id) { index, module in
                    Button {
                        path.append(MoreRoute.module(module.key))
                    } label: {
                        MoreTile(module: module, figure: figure(for: module))
                    }
                    .buttonStyle(TapScaleStyle())
                    .reveal(appeared, index + 1)
                }
            }
        }
    }

    /// The headline under each tile: what's open, owed or held.
    private func figure(for module: MoreModule) -> MoreTile.Figure? {
        switch module.key {
        case "sales":
            guard let summary = store.invoices else { return nil }
            return .init(
                value: Money.short(summary.outstanding, currency: currency),
                caption: summary.overdue > 0 ? "\(Money.short(summary.overdue, currency: currency)) overdue" : "outstanding",
                alert: summary.overdue > 0
            )
        case "purchases":
            guard let counts = store.bills else { return nil }
            let overdue = counts.amount("overdue")
            return .init(
                value: Money.short(store.billsToPay, currency: currency),
                caption: overdue > 0 ? "\(Money.short(overdue, currency: currency)) overdue" : "to pay",
                alert: overdue > 0
            )
        case "contacts":
            guard let total = store.contactsTotal else { return nil }
            return .init(value: "\(total)", caption: total == 1 ? "contact" : "contacts")
        case "accounting":
            guard store.accounts != nil else { return nil }
            let count = store.activeAccounts.count
            return .init(value: Money.short(store.cash(in: currency), currency: currency), caption: "in \(count) \(count == 1 ? "account" : "accounts")")
        default:
            return nil
        }
    }

    private var businessList: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Running the business")
            CardStack(dividerInset: 62) {
                ForEach(MoreDirectory.business) { module in
                    Button {
                        path.append(MoreRoute.module(module.key))
                    } label: {
                        MoreModuleRow(module: module)
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
        }
    }

    private var settingsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Settings")
            CardStack(dividerInset: 62) {
                Button {
                    path.append(MoreRoute.module(MoreDirectory.organization.key))
                } label: {
                    MoreModuleRow(module: MoreDirectory.organization)
                }
                .buttonStyle(RowPressStyle())
                Button {
                    showSettings = true
                } label: {
                    MoreRow(icon: MoreIcon(symbol: "person.crop.circle.fill", color: DTheme.accent), title: "Profile and app", subtitle: "Name, appearance, Face ID, sign out")
                }
                .buttonStyle(RowPressStyle())
                Button {
                    env.router.askTilly(page: "more")
                } label: {
                    MoreRow(icon: TillyMark(size: 30).frame(width: 36, height: 36), title: "Ask Tilly", subtitle: "Anything about your books")
                }
                .buttonStyle(RowPressStyle())
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 21, weight: .semibold))
            .tracking(-0.4)
            .foregroundStyle(DTheme.ink)
            .padding(.leading, 4)
    }

    private var footer: some View {
        VStack(spacing: 6) {
            DubblLogo(height: 16).opacity(0.7)
            Text(versionText)
                .font(.system(size: 12))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .frame(maxWidth: .infinity)
    }

    private var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "Version \(version) (\(build)) · \(AppConfig.serverHost)"
    }

    // MARK: Navigation

    @ViewBuilder
    private func destination(_ route: MoreRoute) -> some View {
        switch route {
        case let .module(key):
            if let module = MoreDirectory.all.first(where: { $0.key == key }) {
                MoreModuleView(module: module, open: open)
            }
        case .notifications:
            NotificationsView()
        case .bankAccounts:
            MoreBankAccountsView(store: store)
        case let .account(account):
            HomeBankAccountView(account: account)
        case .organizations:
            MoreOrganizationsView { path = NavigationPath() }
        }
    }

    /// Opens a page: our own screen when the app has one, else the web.
    private func open(_ target: MoreTarget) {
        switch target {
        case let .invoices(filter): env.router.showInvoices(filter: filter)
        case let .bills(filter): env.router.showBills(filter: filter)
        case let .expenses(filter): env.router.showExpenses(filter: filter)
        case .contacts: env.router.tab = .contacts
        case .bankAccounts: path.append(MoreRoute.bankAccounts)
        case .notifications: path.append(MoreRoute.notifications)
        case .organizations: path.append(MoreRoute.organizations)
        case let .page(webPath):
            if RecordCatalog.hasPage(webPath) {
                path.append(RecordPageRoute(path: webPath))
            } else if let url = AppConfig.webURL(webPath) {
                openURL(url)
            }
        }
    }

    #if DEBUG
    /// DUBBL_DEMO_OPEN=module:sales | page:/sales/quotes | record:quotes:demo-quote-31 | search:quo | accounts | organization | more-bottom
    private func openDemoScreen() {
        guard DemoData.isEnabled, path.isEmpty, let open = DemoData.open else { return }
        if open.hasPrefix("module:") {
            path.append(MoreRoute.module(String(open.dropFirst("module:".count))))
        } else if open.hasPrefix("search:"), query.isEmpty {
            query = String(open.dropFirst("search:".count))
        } else if open == "accounts" {
            path.append(MoreRoute.bankAccounts)
        } else if open.hasPrefix("page:") {
            path.append(RecordPageRoute(path: String(open.dropFirst("page:".count))))
        } else if open.hasPrefix("record:") {
            // record:<spec>:<id>
            let parts = open.split(separator: ":").map(String.init)
            if parts.count == 3 {
                path.append(RecordPageRoute(path: RecordCatalog.spec(parts[1])?.webPath ?? ""))
                path.append(RecordRoute(spec: parts[1], id: parts[2]))
            }
        } else if open == "organization" {
            path.append(MoreRoute.module(MoreDirectory.organization.key))
        }
    }
    #endif
}

// MARK: - Pieces

/// A module's mark: its symbol in white on a rounded square of its colour.
struct MoreIcon: View {
    let symbol: String
    let color: Color
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.44, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(
                LinearGradient(colors: [color.mix(with: .white, by: 0.12), color], startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            )
    }
}

extension MoreModule {
    /// Neutral modules draw in graphite rather than the secondary ink.
    var iconColor: Color { tone == .neutral ? Color(hex: 0x55555C) : color }
}

/// An area of dubbl with its live figure, two to a row.
struct MoreTile: View {
    struct Figure {
        var value: String
        var caption: String
        var alert = false
    }

    let module: MoreModule
    let figure: Figure?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                MoreIcon(symbol: module.symbol, color: module.iconColor, size: 34)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.top, 4)
            }
            Spacer(minLength: 14)
            Text(figure?.value ?? " ")
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-0.6)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
                .redacted(reason: figure == nil ? .placeholder : [])
            Text(module.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(DTheme.ink)
                .padding(.top, 1)
            Text(figure?.caption ?? module.blurb)
                .font(.system(size: 12.5, weight: figure?.alert == true ? .medium : .regular))
                .foregroundStyle(figure?.alert == true ? DTheme.negative : DTheme.inkSecondary)
                .lineLimit(1)
                .padding(.top, 2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .animation(.snappy, value: figure?.value)
    }
}

/// Icon, title and a line under it, with a chevron.
struct MoreRow<Icon: View>: View {
    let icon: Icon
    let title: String
    var subtitle: String?
    var trailing: String?
    var external = false

    var body: some View {
        HStack(spacing: 14) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(.system(size: 14).monospacedDigit())
                    .foregroundStyle(DTheme.inkTertiary)
            }
            Image(systemName: external ? "arrow.up.right" : "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 62)
        .contentShape(Rectangle())
    }
}

struct MoreModuleRow: View {
    let module: MoreModule

    var body: some View {
        MoreRow(
            icon: MoreIcon(symbol: module.symbol, color: module.iconColor),
            title: module.title,
            subtitle: module.blurb
        )
    }
}

// MARK: - Module

/// One area of dubbl: its pages in the same groups as the web's side panel.
/// Pages with their own screen in the app open here; the rest open on the web.
struct MoreModuleView: View {
    let module: MoreModule
    let open: (MoreTarget) -> Void

    @Environment(AppEnvironment.self) private var env
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                header
                tilly
                    .reveal(appeared, 0)
                ForEach(Array(module.groups.enumerated()), id: \.element.id) { index, group in
                    VStack(alignment: .leading, spacing: 8) {
                        if let title = group.title {
                            SectionLabel(title)
                        }
                        CardStack(dividerInset: 58) {
                            ForEach(group.pages) { page in
                                Button {
                                    open(page.target)
                                } label: {
                                    MoreRow(
                                        icon: IconTile(symbol: page.symbol, size: 32),
                                        title: page.title,
                                        external: page.target.opensOnWeb
                                    )
                                }
                                .buttonStyle(RowPressStyle())
                            }
                        }
                    }
                    .reveal(appeared, min(index + 1, 8))
                }
                if module.groups.flatMap(\.pages).contains(where: { $0.target.opensOnWeb }) {
                    Label("Pages marked \u{2197} open on the web.", systemImage: "safari")
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                        .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 28)
        }
        .background(DTheme.shell)
        .navigationTitle(module.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { appeared = true }
    }

    @ViewBuilder
    private var header: some View {
        if module.key == MoreDirectory.organization.key, let org = env.session.currentOrg {
            organizationHeader(org)
        } else {
            moduleHeader
        }
    }

    /// The organization page leads with the organization itself.
    private func organizationHeader(_ org: Organization) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                Avatar(name: org.name, imageURL: org.logo, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(org.name)
                        .font(.system(size: 26, weight: .semibold))
                        .tracking(-0.6)
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(organizationFacts(org))
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            if env.session.organizations.count > 1 {
                Button {
                    open(.organizations)
                } label: {
                    Label("Switch organization", systemImage: "arrow.left.arrow.right")
                        .font(.system(size: 14.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .background(DTheme.tint, in: Capsule())
                }
                .buttonStyle(TapScaleStyle())
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func organizationFacts(_ org: Organization) -> String {
        var facts = [org.role?.rawValue.humanized, org.defaultCurrency].compactMap { $0 }
        if let members = org.memberCount { facts.append("\(members) \(members == 1 ? "member" : "members")") }
        return facts.joined(separator: " · ")
    }

    private var moduleHeader: some View {
        HStack(spacing: 14) {
            MoreIcon(symbol: module.symbol, color: module.iconColor, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(module.title)
                    .font(.system(size: 26, weight: .semibold))
                    .tracking(-0.6)
                    .foregroundStyle(DTheme.ink)
                Text(module.blurb)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private var tilly: some View {
        Button {
            env.router.askTilly(module.tillyPrompt, page: module.key)
        } label: {
            HStack(spacing: 12) {
                TillyMark(size: 26)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Ask Tilly")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                    Text("\u{201C}\(module.tillyPrompt)\u{201D}")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(DTheme.canvas)
                    .frame(width: 30, height: 30)
                    .background(DTheme.ink, in: Circle())
            }
            .padding(.leading, 14)
            .padding(.trailing, 10)
            .frame(height: 58)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Bank accounts

struct MoreBankAccountsView: View {
    let store: MoreStore

    @Environment(AppEnvironment.self) private var env

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                if let accounts = store.accounts {
                    if accounts.isEmpty {
                        EmptyStateView(symbol: "building.columns", title: "No bank accounts", message: "Connect or add one on the web.")
                    } else {
                        SectionLabel("\(Money.short(store.cash(in: env.session.currency), currency: env.session.currency)) across \(store.activeAccounts.count) active")
                        CardStack(dividerInset: 64) {
                            ForEach(accounts) { account in
                                NavigationLink(value: MoreRoute.account(account)) {
                                    HomeAccountRow(account: account)
                                        .padding(.horizontal, 14)
                                }
                                .buttonStyle(RowPressStyle())
                            }
                        }
                    }
                } else {
                    SkeletonRows(rows: 4)
                }
            }
            .padding(16)
        }
        .background(DTheme.shell)
        .navigationTitle("Bank accounts")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load(env.api) }
    }
}

// MARK: - Organizations

struct MoreOrganizationsView: View {
    let onSelect: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                OrganizationList(onSelect: onSelect)
                Text("Everything in the app switches to the organization you pick.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .padding(.horizontal, 4)
            }
            .padding(16)
        }
        .background(DTheme.shell)
        .navigationTitle("Organizations")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Search

/// Typing in More's field: matching pages first, then records from `search`.
struct MoreSearchResults: View {
    let term: String
    let store: SearchStore
    let open: (MoreTarget) -> Void

    @Environment(AppEnvironment.self) private var env

    private var pages: [(module: MoreModule, page: MorePage)] {
        // A page linked from two areas (Aged payables...) shows once.
        var seen = Set<MoreTarget>()
        return MoreDirectory.pages.filter {
            ($0.page.title.localizedCaseInsensitiveContains(term) || $0.module.title.localizedCaseInsensitiveContains(term))
                && seen.insert($0.page.target).inserted
        }
        .prefix(8)
        .map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            if !pages.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Pages")
                    CardStack(dividerInset: 62) {
                        ForEach(pages, id: \.page.id) { hit in
                            Button {
                                open(hit.page.target)
                            } label: {
                                MoreRow(
                                    icon: MoreIcon(symbol: hit.module.symbol, color: hit.module.iconColor),
                                    title: hit.page.title,
                                    subtitle: hit.module.title,
                                    external: hit.page.target.opensOnWeb
                                )
                            }
                            .buttonStyle(RowPressStyle())
                        }
                    }
                }
            }
            records
        }
    }

    @ViewBuilder
    private var records: some View {
        if !store.isActive(term) {
            EmptyView()
        } else if let error = store.error, store.results.isEmpty {
            ErrorStateView(message: error) { await store.search(env.api, term: term) }
        } else if store.results.isEmpty, store.isLoading || store.lastQuery == nil {
            SkeletonRows(rows: 3)
        } else if store.results.isEmpty {
            if pages.isEmpty {
                VStack(spacing: 16) {
                    EmptyStateView(
                        symbol: "magnifyingglass",
                        title: "No results",
                        message: "Nothing matches \u{201C}\(term)\u{201D}. Try a number, a name or an email."
                    )
                    askTilly
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            ForEach(store.groups, id: \.kind) { group in
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(group.kind.title)
                    CardStack(dividerInset: 60) {
                        ForEach(group.hits) { hit in
                            if let route = SearchRoute(hit) {
                                NavigationLink(value: route) {
                                    SearchResultRow(hit: hit).padding(.horizontal, 14)
                                }
                                .buttonStyle(RowPressStyle())
                            } else {
                                SearchResultRow(hit: hit).padding(.horizontal, 14)
                            }
                        }
                    }
                }
            }
        }
    }

    private var askTilly: some View {
        Button {
            env.router.askTilly("Find \(term) in my books.", page: "more")
        } label: {
            HStack(spacing: 8) {
                TillyMark(size: 18)
                Text("Ask Tilly to look")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
            }
            .padding(.horizontal, 16)
            .frame(height: 42)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
