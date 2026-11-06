import SwiftUI

/// One customer or supplier: who they are, how to reach them, what's owed
/// either way and their latest invoices. Pushed from any tab's stack.
struct ContactDetailView: View {
    let id: String
    @Environment(AppEnvironment.self) private var env
    @Environment(\.openURL) private var openURL
    @State private var store = ContactsDetailStore()
    @State private var showTitle = false

    var body: some View {
        Group {
            if let contact = store.contact {
                content(contact)
            } else if let error = store.error {
                ErrorStateView(message: error) { await store.load(env.api, id: id) }
                    .frame(maxHeight: .infinity)
            } else {
                loading
            }
        }
        .background(DTheme.shell)
        .navigationTitle(store.contact?.name ?? "Contact")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(store.contact?.name ?? "")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .opacity(showTitle ? 1 : 0)
                    .animation(.easeOut(duration: 0.18), value: showTitle)
            }
            if let contact = store.contact {
                ToolbarItem(placement: .primaryAction) { menu(contact) }
            }
        }
        .task { if store.contact == nil { await store.load(env.api, id: id) } }
        .refreshable { await store.load(env.api, id: id) }
    }

    // MARK: Layout

    private func content(_ contact: Contact) -> some View {
        ScrollView {
            VStack(spacing: 26) {
                hero(contact)
                if contact.isCustomer {
                    balances(contact, side: .customer)
                }
                if contact.isSupplier {
                    balances(contact, side: .supplier)
                }
                if contact.isCustomer {
                    recentInvoices(contact)
                }
                details(contact)
                if let people = contact.people, !people.isEmpty {
                    peopleCard(people)
                }
                if let notes = contact.notes, !notes.isEmpty {
                    section("Notes") {
                        Text(notes)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollContentBackground(.hidden)
        .defaultScrollAnchor(debugAnchor)
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y + geometry.contentInsets.top > 150
        } action: { _, past in
            showTitle = past
        }
    }

    private var loading: some View {
        VStack(spacing: 16) {
            Circle().fill(DTheme.tintStrong).frame(width: 84, height: 84)
            RoundedRectangle(cornerRadius: 6).fill(DTheme.tintStrong).frame(width: 180, height: 20)
            RoundedRectangle(cornerRadius: 5).fill(DTheme.tint).frame(width: 110, height: 13)
            SkeletonRows(rows: 4, avatar: false)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .padding(.top, 24)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .skeletonShimmer()
    }

    /// Screenshots of the lower cards: DUBBL_DEMO_OPEN=contact-end.
    private var debugAnchor: UnitPoint? {
        #if DEBUG
        if DemoData.open == "contact-end" { return .bottom }
        #endif
        return nil
    }

    // MARK: Hero

    private func hero(_ contact: Contact) -> some View {
        VStack(spacing: 0) {
            Avatar(name: contact.name, size: 84)
                .padding(.bottom, 14)
            Text(contact.name)
                .displayFont(26)
                .foregroundStyle(DTheme.ink)
                .multilineTextAlignment(.center)
            HStack(spacing: 6) {
                Text(contact.typeLabel)
                if let terms = contact.paymentTermsLabel {
                    Text("·").foregroundStyle(DTheme.inkTertiary)
                    Text(terms)
                }
            }
            .font(.system(size: 15))
            .foregroundStyle(DTheme.inkSecondary)
            .padding(.top, 4)

            HStack(spacing: 22) {
                ContactsQuickAction(symbol: "phone.fill", title: "Call", url: contact.telURL)
                ContactsQuickAction(symbol: "message.fill", title: "Message", url: contact.smsURL)
                ContactsQuickAction(symbol: "envelope.fill", title: "Email", url: contact.mailURL)
                ContactsQuickAction(symbol: "safari.fill", title: "Web", url: AppConfig.webURL("/contacts/\(contact.id)"))
            }
            .padding(.top, 22)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    // MARK: Balances

    @ViewBuilder
    private func balances(_ contact: Contact, side: ContactsSide) -> some View {
        let balance = side == .customer ? store.customerBalance : store.supplierBalance
        let currency = contact.currencyCode ?? env.session.currency
        let title = contact.type == "both" ? (side == .customer ? "As a customer" : "As a supplier") : "Balance"
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                if let balance {
                    ForEach(tiles(balance, side: side, currency: currency), id: \.label) { tile in
                        ContactsStatTile(tile: tile)
                    }
                } else if store.balancesLoaded {
                    ForEach(tiles(nil, side: side, currency: currency), id: \.label) { tile in
                        ContactsStatTile(tile: tile)
                    }
                } else {
                    ForEach(0 ..< 4, id: \.self) { _ in ContactsStatTile(tile: nil) }
                }
            }
        }
    }

    private func tiles(_ balance: ContactsBalance?, side: ContactsSide, currency: String) -> [ContactsStatTile.Tile] {
        let outstanding = balance?.outstanding ?? 0
        let overdue = balance?.overdue ?? 0
        let openCount = balance?.openCount ?? 0
        let overdueCount = balance?.overdueCount ?? 0
        let docs = side == .customer ? "invoice" : "bill"
        func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

        var first = ContactsStatTile.Tile(
            label: side == .customer ? "Owes you" : "You owe",
            minor: outstanding, currency: currency,
            footnote: openCount > 0 ? "\(plural(openCount, "open \(docs)"))" : "All settled"
        )
        first.tone = .neutral
        var second = ContactsStatTile.Tile(
            label: "Overdue", minor: overdue, currency: currency,
            footnote: overdueCount > 0
                ? (balance?.oldestOverdueDate.map { "Since \(DubblDate.short($0))" } ?? plural(overdueCount, docs))
                : "Nothing late"
        )
        second.tone = overdue > 0 ? .negative : .neutral

        let lastYear = balance?.totalLastYear ?? 0
        let third = ContactsStatTile.Tile(
            label: side == .customer ? "Invoiced this year" : "Billed this year",
            minor: balance?.totalThisYear ?? 0, currency: currency,
            footnote: lastYear > 0 ? "\(Money.compact(lastYear, currency: currency)) last year" : "None last year"
        )

        let fourth: ContactsStatTile.Tile
        if side == .customer {
            let days = balance?.avgDaysToPay.map { Int($0.rounded()) }
            fourth = ContactsStatTile.Tile(
                label: "Pays in", text: days.map { $0 == 1 ? "1 day" : "\($0) days" } ?? "None yet",
                footnote: (balance?.paidCount ?? 0) > 0 ? "Average of \(plural(balance?.paidCount ?? 0, "invoice"))" : "No paid invoices"
            )
        } else {
            fourth = ContactsStatTile.Tile(
                label: "Last paid",
                text: balance?.lastPaymentDate.map { DubblDate.short($0) } ?? "Never",
                footnote: balance?.lastPaymentDate.map { DubblDate.relative($0) } ?? "No payments yet"
            )
        }
        return [first, second, third, fourth]
    }

    // MARK: Invoices

    @ViewBuilder
    private func recentInvoices(_ contact: Contact) -> some View {
        if store.invoicesLoaded {
            section("Recent invoices") {
                if store.invoices.isEmpty {
                    Text("No invoices for \(contact.name) yet.")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                } else {
                    ForEach(store.invoices) { invoice in
                        NavigationLink {
                            InvoiceDetailView(id: invoice.id)
                        } label: {
                            ContactsInvoiceRow(invoice: invoice)
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
            .transition(.opacity)
        }
    }

    // MARK: Details

    private func details(_ contact: Contact) -> some View {
        section("Details") {
            if let email = contact.email, !email.isEmpty {
                linkRow("Email", email, url: contact.mailURL)
            }
            if let phone = contact.phone, !phone.isEmpty {
                linkRow("Phone", phone, url: contact.telURL)
            }
            if let tax = contact.taxNumber, !tax.isEmpty {
                DetailRow("Tax number", tax)
            }
            if let terms = contact.paymentTermsLabel {
                DetailRow("Payment terms", terms)
            }
            DetailRow("Currency", contact.currencyCode ?? env.session.currency)
            if let limit = contact.creditLimit, limit > 0 {
                DetailRow(label: "Credit limit") {
                    MoneyText(minor: limit, currency: contact.currencyCode ?? env.session.currency, weight: .regular)
                }
            }
            if let address = contact.addresses?.billing?.formatted, !address.isEmpty {
                DetailRow("Billing address", address)
                    .padding(.vertical, 12)
            }
            if let created = contact.createdAt {
                DetailRow("Added", DubblDate.display(created))
            }
        }
    }

    private func linkRow(_ label: String, _ value: String, url: URL?) -> some View {
        Button {
            if let url { openURL(url) }
        } label: {
            DetailRow(label: label) {
                Text(value).lineLimit(1).truncationMode(.middle)
            }
        }
        .buttonStyle(RowPressStyle())
        .contextMenu {
            Button { UIPasteboard.general.string = value } label: { Label("Copy", systemImage: "doc.on.doc") }
        }
    }

    // MARK: People

    private func peopleCard(_ people: [ContactPerson]) -> some View {
        section("People", dividerInset: 60) {
            ForEach(sortedPeople(people)) { person in
                ContactsPersonRow(person: person)
            }
        }
    }

    private func sortedPeople(_ people: [ContactPerson]) -> [ContactPerson] {
        people.sorted { ($0.isPrimary == true ? 0 : 1, $0.name) < ($1.isPrimary == true ? 0 : 1, $1.name) }
    }

    // MARK: Helpers

    private func section<Content: View>(_ title: String, dividerInset: CGFloat = 16, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title)
            CardStack(dividerInset: dividerInset) { content() }
        }
    }

    private func menu(_ contact: Contact) -> some View {
        Menu {
            if let url = AppConfig.webURL("/contacts/\(contact.id)") {
                Button { openURL(url) } label: { Label("Open on the web", systemImage: "safari") }
            }
            if let email = contact.email, !email.isEmpty {
                Button { UIPasteboard.general.string = email; env.toast.show("Email copied") } label: {
                    Label("Copy email", systemImage: "envelope")
                }
            }
            if let phone = contact.phone, !phone.isEmpty {
                Button { UIPasteboard.general.string = phone; env.toast.show("Phone copied") } label: {
                    Label("Copy phone", systemImage: "phone")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("More")
    }
}

// MARK: - Pieces

/// A round shortcut under the hero. Greyed out when there's nothing to open.
private struct ContactsQuickAction: View {
    let symbol: String
    let title: String
    let url: URL?
    @Environment(\.openURL) private var openURL
    @State private var taps = 0

    var body: some View {
        Button {
            guard let url else { return }
            taps += 1
            openURL(url)
        } label: {
            VStack(spacing: 7) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .frame(width: 54, height: 54)
                    .background(DTheme.card, in: Circle())
                    .overlay(Circle().strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
                Text(title)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .buttonStyle(TapScaleStyle())
        .disabled(url == nil)
        .opacity(url == nil ? 0.4 : 1)
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
        .accessibilityLabel(title)
    }
}

/// A small figure card in the balance grid.
private struct ContactsStatTile: View {
    struct Tile {
        var label: String
        var minor: Int?
        var currency: String?
        var text: String?
        var footnote: String
        var tone: Tone = .neutral

        init(label: String, minor: Int, currency: String, footnote: String) {
            self.label = label
            self.minor = minor
            self.currency = currency
            self.footnote = footnote
        }

        init(label: String, text: String, footnote: String) {
            self.label = label
            self.text = text
            self.footnote = footnote
        }
    }

    let tile: Tile?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let tile {
                Text(tile.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Group {
                    if let minor = tile.minor, let currency = tile.currency {
                        MoneyText(minor: minor, currency: currency, size: 20, weight: .semibold)
                    } else {
                        Text(tile.text ?? "").font(DFont.figure(20, weight: .semibold))
                    }
                }
                .foregroundStyle(tile.tone == .neutral ? DTheme.ink : tile.tone.color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                Text(tile.footnote)
                    .font(.system(size: 12))
                    .foregroundStyle(DTheme.inkTertiary)
                    .lineLimit(1)
            } else {
                RoundedRectangle(cornerRadius: 4).fill(DTheme.tint).frame(width: 70, height: 11)
                RoundedRectangle(cornerRadius: 5).fill(DTheme.tintStrong).frame(width: 110, height: 20)
                RoundedRectangle(cornerRadius: 4).fill(DTheme.tint).frame(width: 80, height: 10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dubblCard(padding: 14, radius: 18)
    }
}

private struct ContactsInvoiceRow: View {
    let invoice: Invoice

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(invoice.invoiceNumber)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Text(dueText)
                    .font(.system(size: 13))
                    .foregroundStyle(invoice.status == "overdue" ? DTheme.negative : DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                MoneyText(minor: invoice.total, currency: invoice.currencyCode, size: 15)
                    .foregroundStyle(DTheme.ink)
                StatusPill(text: InvoiceStatus.label(invoice.status), tone: InvoiceStatus.tone(invoice.status))
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var dueText: String {
        switch invoice.status {
        case "paid": "Paid \(DubblDate.short(invoice.paidAt ?? invoice.dueDate))"
        case "draft": "Draft · \(DubblDate.short(invoice.issueDate))"
        default: "Due \(DubblDate.short(invoice.dueDate))"
        }
    }
}

private struct ContactsPersonRow: View {
    let person: ContactPerson
    @Environment(\.openURL) private var openURL

    var body: some View {
        Menu {
            if let phone = person.phone, !phone.isEmpty, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                Button { openURL(url) } label: { Label("Call", systemImage: "phone") }
            }
            if let email = person.email, !email.isEmpty, let url = URL(string: "mailto:\(email)") {
                Button { openURL(url) } label: { Label("Email", systemImage: "envelope") }
                Button { UIPasteboard.general.string = email } label: { Label("Copy email", systemImage: "doc.on.doc") }
            }
        } label: {
            HStack(spacing: 12) {
                Avatar(name: person.name, size: 32)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(person.name)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                        if person.isPrimary == true {
                            StatusPill(text: "Primary")
                        }
                    }
                    if let line = subtitle {
                        Text(line)
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    private var subtitle: String? {
        let parts = [person.jobTitle, person.email, person.phone].compactMap { $0?.isEmpty == false ? $0 : nil }
        return parts.isEmpty ? nil : parts.prefix(2).joined(separator: " · ")
    }
}

// MARK: - Store

@MainActor @Observable
final class ContactsDetailStore {
    private(set) var contact: Contact?
    private(set) var customerBalance: ContactsBalance?
    private(set) var supplierBalance: ContactsBalance?
    private(set) var balancesLoaded = false
    private(set) var invoices: [Invoice] = []
    private(set) var invoicesLoaded = false
    private(set) var error: String?
    private var generation = 0

    func load(_ api: APIClient, id: String) async {
        generation += 1
        let gen = generation
        do {
            let response: ContactResponse = try await api.get("contacts/\(id)")
            guard gen == generation else { return }
            withAnimation(.snappy) {
                contact = response.contact
                error = nil
            }
            await loadExtras(api, contact: response.contact, gen: gen)
        } catch {
            guard gen == generation, !(error is CancellationError) else { return }
            if contact == nil { self.error = error.localizedDescription }
        }
    }

    private func loadExtras(_ api: APIClient, contact: Contact, gen: Int) async {
        async let customer = contact.isCustomer ? Self.balance(api, contact: contact, side: .customer) : nil
        async let supplier = contact.isSupplier ? Self.balance(api, contact: contact, side: .supplier) : nil
        async let invoices = contact.isCustomer ? Self.invoices(api, contact: contact) : nil
        let (customerResult, supplierResult, invoiceResult) = await (customer, supplier, invoices)
        guard gen == generation else { return }
        withAnimation(.snappy) {
            customerBalance = customerResult
            supplierBalance = supplierResult
            balancesLoaded = true
            if let invoiceResult {
                self.invoices = invoiceResult
                invoicesLoaded = true
            }
        }
    }

    /// The balances list is searched by name, then matched on id.
    private nonisolated static func balance(_ api: APIClient, contact: Contact, side: ContactsSide) async -> ContactsBalance? {
        let page: Page<ContactsBalance>? = try? await api.get("contacts/balances", query: [
            "side": side.rawValue, "search": contact.name, "limit": "20",
        ])
        return page?.data.first { $0.id == contact.id }
    }

    private nonisolated static func invoices(_ api: APIClient, contact: Contact) async -> [Invoice]? {
        guard let page: Page<Invoice> = try? await api.get("invoices", query: ["contactId": contact.id, "limit": "5"]) else {
            return nil
        }
        var rows = page.data
        #if DEBUG
        if DemoData.isEnabled {
            rows = rows.filter { $0.contactId == contact.id || $0.contact?.name == contact.name }
        }
        #endif
        return Array(rows.prefix(5))
    }
}
