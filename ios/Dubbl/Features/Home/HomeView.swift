import SwiftUI

enum HomeRoute: Hashable {
    case notifications
    case account(BankAccount, filter: HomeTransactionFilter)
}

/// The Overview tab: the website's painting with the greeting and cash on
/// hand, what needs attention as glass pills, Tilly one tap away, then a sheet
/// sliding over the painting with the month's numbers and their trends, the
/// revenue chart, bank accounts and the cash expected over the next weeks.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.colorScheme) private var colorScheme
    @State private var store = HomeStore()
    @State private var path: [HomeRoute] = []
    @State private var showSettings = false
    @State private var appeared = false
    @State private var scrolled = false
    @State private var position = ScrollPosition()
    #if DEBUG
    @State private var didAutoOpen = false
    #endif

    private var currency: String { env.session.currency }

    /// Counts animate up once data has arrived and the page is on screen.
    private var shown: Bool { appeared && store.hasLoaded }

    var body: some View {
        NavigationStack(path: $path) {
            GeometryReader { outer in
                let topInset = outer.safeAreaInsets.top
                ScrollViewReader { proxy in
                    ScrollView(showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 0) {
                            hero(topInset: topInset)
                            sections
                                .padding(.horizontal, 20)
                                .padding(.top, 26)
                                .padding(.bottom, 36)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background {
                                    UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                                        .fill(DTheme.canvas)
                                        .shadow(color: .black.opacity(0.07), radius: 18, y: -6)
                                }
                                .padding(.top, -30)
                        }
                    }
                    .ignoresSafeArea(edges: .top)
                    .scrollPosition($position)
                    .tabBarClearance()
                    .onScrollGeometryChange(for: Bool.self) { geo in
                        geo.contentOffset.y + geo.contentInsets.top > 420
                    } action: { _, past in
                        withAnimation(.easeOut(duration: 0.2)) { scrolled = past }
                    }
                    .background(DTheme.canvas)
                    .overlay(alignment: .top) {
                        // Keeps the status bar legible once the sheet covers the painting.
                        LinearGradient(colors: [DTheme.canvas, DTheme.canvas.opacity(0)], startPoint: .top, endPoint: .bottom)
                            .frame(height: topInset + 18)
                            .ignoresSafeArea(edges: .top)
                            .opacity(scrolled ? 1 : 0)
                            .allowsHitTesting(false)
                    }
                    .refreshable { await store.load(env.api) }
                    .task {
                        guard !store.hasLoaded else { return }
                        await store.load(env.api)
                        #if DEBUG
                        autoOpen(proxy)
                        #endif
                    }
                }
            }
            .toolbarVisibility(.hidden, for: .navigationBar)
            .tabBarPushed(!path.isEmpty, tab: .home)
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .notifications:
                    NotificationsView()
                case let .account(account, filter):
                    HomeBankAccountView(account: account, filter: filter)
                }
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .onAppear { appeared = true }
        .onChange(of: path) { old, new in
            if new.isEmpty, old.contains(.notifications) {
                Task { await store.refreshUnread(env.api) }
            }
        }
    }

    // MARK: Hero

    private func hero(topInset: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            topBar
            greeting.padding(.top, 34)
            headline.padding(.top, 24)
            insights.padding(.top, 20)
            askBar.padding(.top, 16)
        }
        .padding(.horizontal, 20)
        .padding(.top, topInset + 4)
        .padding(.bottom, 58)
        .background { stretchyPainting }
    }

    /// The painting with a veil behind the text so it reads on the trees.
    private var painting: some View {
        Painting(name: "MistValley")
            .overlay {
                let veil: [Double] = colorScheme == .dark ? [0.35, 0.12, 0] : [0.7, 0.35, 0.05]
                LinearGradient(
                    colors: [DTheme.canvas.opacity(veil[0]), DTheme.canvas.opacity(veil[1]), DTheme.canvas.opacity(veil[2])],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
    }

    /// Grows with a pull, drifts slower than the page on scroll.
    private var stretchyPainting: some View {
        GeometryReader { proxy in
            let y = proxy.frame(in: .scrollView).minY
            let pull = max(0, y)
            painting
                .frame(width: proxy.size.width, height: proxy.size.height + pull)
                .clipped()
                .offset(y: y > 0 ? -pull : -y * 0.35)
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 10) {
            orgMenu
            Spacer()
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    GlassCircleButton(
                        symbol: "bell",
                        label: store.unreadCount > 0 ? "Notifications, \(store.unreadCount) unread" : "Notifications",
                        badge: store.unreadCount > 0
                    ) {
                        path.append(.notifications)
                    }
                    Button {
                        showSettings = true
                    } label: {
                        Avatar(name: env.session.user?.displayName ?? "?", imageURL: env.session.user?.image, size: 36)
                            .frame(width: 44, height: 44)
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: Circle())
                    .accessibilityLabel("Account and settings")
                }
            }
        }
        .frame(height: 44)
    }

    private var orgMenu: some View {
        Menu {
            Section("Organizations") {
                ForEach(env.session.organizations) { org in
                    Button {
                        guard org.id != env.session.currentOrg?.id else { return }
                        Task { await env.session.select(org) }
                    } label: {
                        if org.id == env.session.currentOrg?.id {
                            Label(org.name, systemImage: "checkmark")
                        } else {
                            Text(org.name)
                        }
                        Text(org.defaultCurrency)
                    }
                }
            }
        } label: {
            HStack(spacing: 9) {
                Avatar(name: env.session.currentOrg?.name ?? "D", imageURL: env.session.currentOrg?.logo, size: 30)
                Text(env.session.currentOrg?.name ?? "Organization")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(DTheme.ink.opacity(0.45))
            }
            .padding(.leading, 4)
            .padding(.trailing, 12)
            .frame(height: 38)
            .glassEffect(.regular.interactive(), in: Capsule())
        }
        .menuOrder(.fixed)
        .accessibilityLabel("Switch organization, \(env.session.currentOrg?.name ?? "")")
    }

    // MARK: Greeting and headline

    private var greeting: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.onPaintSecondary)
            TwoToneTitle(lead: salutation + ",", title: firstName, size: 40, leadColor: DTheme.onPaintSecondary)
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 10)
        .animation(.spring(response: 0.7, dampingFraction: 0.86), value: appeared)
        .accessibilityElement(children: .combine)
    }

    private var salutation: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5 ..< 12: "Good morning"
        case 12 ..< 18: "Good afternoon"
        default: "Good evening"
        }
    }

    private var firstName: String {
        if let first = env.session.user?.name?.split(separator: " ").first, !first.isEmpty { return "\(first)." }
        return "welcome back."
    }

    /// Cash on hand in one number, with what's owed either way beside it.
    private var headline: some View {
        let cash = store.cash(in: currency)
        let accounts = store.activeAccounts?.count ?? 0
        return HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                CountUpText(value: shown ? Double(cash ?? 0) : 0) { HomeStyle.compact(Int($0.rounded()), currency: currency) }
                    .font(.system(size: 56, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(cash == nil && store.hasLoaded ? DTheme.inkTertiary : DTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .animation(.easeOut(duration: 1.1), value: shown)
                Text(accounts == 1 ? "cash in 1 account" : "cash across \(accounts) accounts")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.onPaintSecondary)
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 12) {
                heroStat(store.receivables?.grandTotal, label: "owed to you")
                heroStat(store.payables?.grandTotal, label: "you owe")
            }
            .padding(.bottom, 4)
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .animation(.spring(response: 0.7, dampingFraction: 0.86).delay(0.05), value: appeared)
    }

    private func heroStat(_ value: Int?, label: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            CountUpText(value: shown ? Double(value ?? 0) : 0) { HomeStyle.compact(Int($0.rounded()), currency: currency) }
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
                .animation(.easeOut(duration: 1.1).delay(0.1), value: shown)
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(DTheme.onPaintSecondary)
        }
    }

    // MARK: Insights

    /// What needs attention, each a tap away from where it's handled.
    private var insights: some View {
        let bold: (String) -> Text = { Text($0).fontWeight(.semibold) }
        let alerts = store.alerts
        let accounts = store.activeAccounts ?? []
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let alerts {
                    if alerts.overdueInvoices.count > 0 {
                        InsightPill(
                            symbol: "exclamationmark.circle.fill",
                            text: Text("\(bold(HomeStyle.compact(alerts.overdueInvoices.total, currency: currency))) overdue"),
                            tint: DTheme.negative
                        ) { env.router.showInvoices(filter: "overdue") }
                    }
                    if alerts.overdueBills.count > 0 {
                        InsightPill(
                            symbol: "tray.full.fill",
                            text: Text("\(bold("\(alerts.overdueBills.count)")) \(alerts.overdueBills.count == 1 ? "bill" : "bills") to pay"),
                            tint: DTheme.warning
                        ) { env.router.showBills(filter: "overdue") }
                    }
                    if alerts.uncategorizedTransactions > 0 {
                        InsightPill(
                            symbol: "tag.fill",
                            text: Text("\(bold("\(alerts.uncategorizedTransactions)")) to categorize"),
                            tint: DTheme.accent
                        ) {
                            if accounts.count == 1 { path.append(.account(accounts[0], filter: .review)) }
                            else if let first = accounts.first { path.append(.account(first, filter: .review)) }
                        }
                    }
                    if let recon = alerts.accountsNeedingReconciliation.first {
                        InsightPill(
                            symbol: "checkmark.seal.fill",
                            text: alerts.accountsNeedingReconciliation.count == 1
                                ? Text("Reconcile \(bold(recon.bankAccountName))")
                                : Text("\(bold("\(alerts.accountsNeedingReconciliation.count)")) to reconcile"),
                            tint: DTheme.special
                        ) {
                            if let account = store.accounts?.first(where: { $0.id == recon.bankAccountId }) {
                                path.append(.account(account, filter: .review))
                            }
                        }
                    }
                    if alerts.isClear {
                        InsightPill(symbol: "checkmark.circle.fill", text: Text("All caught up"), tint: DTheme.positive) {}
                    }
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollClipDisabled()
        .padding(.horizontal, -20)
        .frame(height: 36)
        .opacity(shown ? 1 : 0)
        .offset(y: shown ? 0 : 10)
        .animation(.spring(response: 0.6, dampingFraction: 0.86).delay(0.15), value: shown)
    }

    // MARK: Tilly

    private var askBar: some View {
        Button {
            env.router.askTilly(page: "home")
        } label: {
            HStack(spacing: 12) {
                TillyMark(size: 24)
                Text("Ask Tilly anything")
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.onPaintSecondary)
                Spacer(minLength: 8)
                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DTheme.inkInverse)
                    .frame(width: 36, height: 36)
                    .background(DTheme.ink, in: Circle())
            }
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .frame(height: 54)
            .contentShape(Capsule())
        }
        .buttonStyle(TapScaleStyle())
        .glassEffect(.regular.interactive(), in: Capsule())
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 14)
        .animation(.spring(response: 0.7, dampingFraction: 0.86).delay(0.1), value: appeared)
    }

    private static let starters: [(title: String, symbol: String, prompt: String)] = [
        ("How's business?", "chart.line.uptrend.xyaxis", "How is the business doing this month?"),
        ("Who to chase", "hand.raised", "Who owes me money, and who should I chase first?"),
        ("Cash runway", "hourglass", "How long will my cash last?"),
        ("Explain my P&L", "book", "Explain my profit and loss like I'm new to accounting"),
    ]

    private var starterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Self.starters, id: \.prompt) { starter in
                    Button {
                        env.router.askTilly(starter.prompt, page: "home")
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: starter.symbol)
                                .font(.system(size: 12.5, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                            Text(starter.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 14)
                        .frame(height: 36)
                        .background(DTheme.surface, in: Capsule())
                    }
                    .buttonStyle(TapScaleStyle())
                }
            }
            .padding(.horizontal, 20)
        }
        .scrollClipDisabled()
        .padding(.horizontal, -20)
    }

    // MARK: Sections

    private var sections: some View {
        VStack(alignment: .leading, spacing: 34) {
            starterChips.reveal(shown, 0)
            if store.hasLoaded {
                kpiGrid.reveal(shown, 1)
                trendSection.id("trend").reveal(shown, 2)
                accountsSection.id("accounts").reveal(shown, 3)
                forecastSection.id("forecast").reveal(shown, 4)
            } else {
                loadingCards
            }
        }
    }

    private var loadingCards: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(0 ..< 4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(DTheme.field)
                    .frame(height: 74)
            }
        }
        .skeletonShimmer()
        .accessibilityLabel("Loading")
    }

    // MARK: KPIs

    private struct KPI {
        let label: String
        let value: Int?
        let delta: Double?
        var lowerIsBetter = false
        let series: [Double]
        let tint: Color
    }

    private var kpis: [KPI] {
        let points = store.trend ?? []
        let now = points.last, before = points.dropLast().last
        let net = points.map { Double($0.net) }
        var running = 0.0
        let cumulative = net.map { running += $0; return running }
        return [
            KPI(label: "Revenue", value: now?.revenue,
                delta: now.flatMap { n in before.flatMap { DeltaLabel.percent(n.revenue, $0.revenue) } },
                series: points.map { Double($0.revenue) }, tint: DTheme.accent),
            KPI(label: "Expenses", value: now?.expenses,
                delta: now.flatMap { n in before.flatMap { DeltaLabel.percent(n.expenses, $0.expenses) } },
                lowerIsBetter: true, series: points.map { Double($0.expenses) }, tint: DTheme.orange),
            KPI(label: "Profit", value: now?.net,
                delta: now.flatMap { n in before.flatMap { DeltaLabel.percent(n.net, $0.net) } },
                series: net, tint: DTheme.positive),
            KPI(label: "Profit this year", value: store.profit?.netIncome, delta: nil,
                series: cumulative, tint: DTheme.special),
        ]
    }

    /// Four open numbers with their six-month line, no tiles: rules between them.
    private var kpiGrid: some View {
        let items = kpis
        return VStack(alignment: .leading, spacing: 14) {
            AirSectionHeader(title: "This month")
            VStack(spacing: 0) {
                ForEach(0 ..< 2, id: \.self) { row in
                    HStack(spacing: 0) {
                        kpiCell(items[row * 2], index: row * 2)
                            .padding(.trailing, 16)
                        Rectangle().fill(DTheme.hairline).frame(width: 1)
                        kpiCell(items[row * 2 + 1], index: row * 2 + 1)
                            .padding(.leading, 16)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    if row == 0 { Hairline() }
                }
            }
            factsLine
                .padding(.top, 2)
        }
    }

    private func kpiCell(_ kpi: KPI, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(kpi.tint).frame(width: 6, height: 6)
                Text(kpi.label)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer(minLength: 4)
                DeltaLabel(change: kpi.delta, lowerIsBetter: kpi.lowerIsBetter)
            }
            CountUpText(value: shown ? Double(kpi.value ?? 0) : 0) { HomeStyle.compact(Int($0.rounded()), currency: currency) }
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(kpi.value == nil ? DTheme.inkTertiary : DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .animation(.easeOut(duration: 1).delay(Double(index) * 0.05), value: shown)
            TrendSparkline(values: kpi.series, color: kpi.tint, delay: 0.25 + Double(index) * 0.08)
                .frame(height: 30)
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The rest of the picture in one readable line.
    private var factsLine: some View {
        var parts: [Text] = []
        let bold: (String) -> Text = { Text($0).foregroundStyle(DTheme.ink).fontWeight(.semibold) }
        if let receivables = store.receivables, receivables.overdue > 0 {
            parts.append(Text("\(bold(HomeStyle.compact(receivables.overdue, currency: currency))) overdue to collect"))
        }
        if let payables = store.payables, payables.overdue > 0 {
            parts.append(Text("\(bold(HomeStyle.compact(payables.overdue, currency: currency))) overdue to pay"))
        }
        if let profit = store.profit {
            parts.append(Text("\(bold(HomeStyle.compact(profit.totalRevenue, currency: currency))) revenue this year"))
        }
        let line = parts.enumerated().reduce(Text("")) { acc, item in
            item.offset == 0 ? item.element : Text("\(acc)  ·  \(item.element)")
        }
        return line
            .font(.system(size: 13.5))
            .foregroundStyle(DTheme.inkSecondary)
            .lineSpacing(3)
    }

    // MARK: Trend

    private var trendSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            AirSectionHeader(title: "Revenue and expenses")
            if let trend = store.trend, !trend.isEmpty {
                TrendChart(points: trend, currency: currency)
            } else {
                emptyLine("No trend to show yet")
            }
        }
    }

    // MARK: Bank accounts

    private var accountsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            AirSectionHeader(title: "Bank accounts")
            if let accounts = store.activeAccounts {
                if accounts.isEmpty {
                    emptyLine("No bank accounts yet")
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(accounts.enumerated()), id: \.element.id) { index, account in
                            NavigationLink(value: HomeRoute.account(account, filter: .all)) {
                                HomeAccountRow(account: account)
                            }
                            .buttonStyle(TapScaleStyle())
                            if index < accounts.count - 1 {
                                Hairline().padding(.leading, 50)
                            }
                        }
                    }
                }
            } else {
                emptyLine("Couldn't load bank accounts")
            }
        }
    }

    // MARK: Forecast

    private var forecastSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            AirSectionHeader(title: "Next 4 weeks")
            if let forecast = store.forecast {
                HomeForecast(forecast: forecast, currency: currency, shown: shown)
            } else {
                emptyLine("Couldn't load the forecast")
            }
        }
    }

    private func emptyLine(_ text: String) -> some View {
        HStack(spacing: 10) {
            Text("–").font(DFont.figure(17, weight: .semibold)).foregroundStyle(DTheme.inkTertiary)
            Text(text).font(.system(size: 15)).foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.vertical, 6)
    }

    #if DEBUG
    /// Screenshot helpers: DUBBL_DEMO_OPEN=notifications | bank-account | home-trend | home-accounts | home-bottom
    private func autoOpen(_ proxy: ScrollViewProxy) {
        guard !didAutoOpen else { return }
        didAutoOpen = true
        let scroll: (String, UnitPoint) -> Void = { id, anchor in
            Task {
                try? await Task.sleep(for: .milliseconds(900))
                proxy.scrollTo(id, anchor: anchor)
            }
        }
        switch DemoData.open {
        case "notifications": path = [.notifications]
        case "bank-account": if let account = store.activeAccounts?.first { path = [.account(account, filter: .all)] }
        case "home-trend": scroll("trend", .top)
        case "home-accounts": scroll("accounts", .top)
        case "home-bottom":
            Task {
                try? await Task.sleep(for: .milliseconds(1200))
                withAnimation { position.scrollTo(edge: .bottom) }
            }
        default: break
        }
    }
    #endif
}

// MARK: - Pieces

/// Shared formatting for the overview and the bank account screen.
enum HomeStyle {
    /// "$48,210" for headline figures where cents are noise.
    static func whole(_ minor: Int, currency: String) -> String {
        Money.major(minor, currency: currency).formatted(.currency(code: currency).precision(.fractionLength(0)))
    }

    /// "$8,550" below ten thousand, "$28.6K" above.
    static func compact(_ minor: Int, currency: String) -> String {
        let major = NSDecimalNumber(decimal: Money.major(minor, currency: currency)).doubleValue
        return abs(major) >= 10_000 ? Money.compact(minor, currency: currency) : whole(minor, currency: currency)
    }

    /// "+$1,200.00" for money in, "-$45.00" for money out.
    static func signed(_ minor: Int, currency: String) -> String {
        minor > 0 ? "+" + Money.format(minor, currency: currency) : Money.format(minor, currency: currency)
    }

    static func accountColor(_ hex: String?) -> Color {
        guard let hex, hex.hasPrefix("#"), hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) else {
            return DTheme.inkTertiary
        }
        return Color(hex: value)
    }

    static func accountSymbol(_ type: String?) -> String {
        switch type {
        case "savings": "banknote"
        case "credit_card": "creditcard"
        case "cash": "dollarsign"
        case "loan": "percent"
        case "investment": "chart.line.uptrend.xyaxis"
        default: "building.columns"
        }
    }

    static func accountTypeLabel(_ type: String?) -> String? {
        switch type {
        case "checking": "Checking"
        case "savings": "Savings"
        case "credit_card": "Credit card"
        case "cash": "Cash"
        case "loan": "Loan"
        case "investment": "Investment"
        default: nil
        }
    }
}

/// A neutral tile with the account type, marked with the account's colour.
struct HomeAccountTile: View {
    let account: BankAccount
    var size: CGFloat = 34

    var body: some View {
        IconTile(symbol: HomeStyle.accountSymbol(account.accountType), size: size)
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .fill(HomeStyle.accountColor(account.color))
                    .frame(width: size * 0.28, height: size * 0.28)
                    .overlay(Circle().strokeBorder(DTheme.card, lineWidth: size * 0.06))
                    .offset(x: size * 0.08, y: size * 0.08)
            }
    }
}


/// A bank account on the overview: tile, name, last four, balance.
struct HomeAccountRow: View {
    let account: BankAccount

    var body: some View {
        HStack(spacing: 14) {
            HomeAccountTile(account: account, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(account.accountName)
                    .font(.system(size: 15.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([account.bankName, account.maskedNumber].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            MoneyText(minor: account.balance, currency: account.currencyCode, size: 15.5, weight: .semibold)
                .foregroundStyle(account.balance < 0 ? DTheme.negative : DTheme.ink)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Coming in against going out over the next weeks, with the net between.
private struct HomeForecast: View {
    let forecast: HomeCashForecast
    let currency: String
    let shown: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                CountUpText(value: shown ? Double(forecast.netForecast) : 0) { HomeStyle.signed(Int($0.rounded()), currency: currency) }
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                    .animation(.easeOut(duration: 1).delay(0.2), value: shown)
                Text("expected net")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            GeometryReader { proxy in
                let total = max(forecast.totalInflows + forecast.totalOutflows, 1)
                let share = CGFloat(forecast.totalInflows) / CGFloat(total)
                HStack(spacing: 4) {
                    Capsule().fill(DTheme.positive)
                        .frame(width: shown ? max((proxy.size.width - 4) * share, 8) : 8)
                    Capsule().fill(DTheme.orange.opacity(0.85))
                }
                .animation(.spring(response: 0.9, dampingFraction: 0.9).delay(0.3), value: shown)
            }
            .frame(height: 8)
            HStack(spacing: 16) {
                legend("coming in", value: forecast.totalInflows, color: DTheme.positive)
                legend("going out", value: forecast.totalOutflows, color: DTheme.orange)
            }
        }
    }

    private func legend(_ label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text("\(Text(HomeStyle.compact(value, currency: currency)).foregroundStyle(DTheme.ink).fontWeight(.semibold)) \(label)")
                .font(.system(size: 13.5))
                .foregroundStyle(DTheme.inkSecondary)
        }
    }
}
