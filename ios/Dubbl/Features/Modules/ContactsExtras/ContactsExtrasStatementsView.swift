import SwiftUI

/// Who to send a statement to: customers with money owing (or suppliers we
/// owe), biggest first, from `contacts/balances`. Tap one for the statement.
struct ContactsExtrasStatementsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var remote = ContactsExtrasRemote()
    @State private var side = "customer"
    @State private var openOnly = true
    @State private var search = ""

    private var currency: String { env.session.currency }

    private var rows: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        return (remote.value?["data"]?.arrayValue ?? [])
            .filter { row in
                guard ContactsExtrasDemo.isOn else { return true }
                let kind = row["type"]?.stringValue ?? ""
                return (kind == side || kind == "both")
                    && (!openOnly || (row["outstanding"]?.intValue ?? 0) != 0)
                    && (term.isEmpty || (row["name"]?.stringValue ?? "").localizedCaseInsensitiveContains(term))
            }
            .sorted { ($0["outstanding"]?.intValue ?? 0) > ($1["outstanding"]?.intValue ?? 0) }
    }

    var body: some View {
        VStack(spacing: 0) {
            ContactsExtrasSideSegment(selection: $side)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            ContactsExtrasLoadState(value: remote.value, error: remote.error, retry: load) { _ in
                List {
                    if search.isEmpty {
                        let outstanding = rows.reduce(0) { $0 + ($1["outstanding"]?.intValue ?? 0) }
                        let overdue = rows.reduce(0) { $0 + ($1["overdue"]?.intValue ?? 0) }
                        LedgerTotals(items: [
                            .init(label: side == "customer" ? "To collect" : "To pay", value: Money.short(outstanding, currency: currency), detail: "\(rows.count) \(side == "customer" ? "customers" : "suppliers")", tint: DTheme.accent),
                            .init(label: "Overdue", value: Money.short(overdue, currency: currency), detail: "\(rows.filter { ($0["overdue"]?.intValue ?? 0) > 0 }.count) late", tint: DTheme.negative),
                        ])
                        .padding(.vertical, 14)
                        .ledgerRow()
                    }
                    ForEach(rows, id: \.self) { row in
                        NavigationLink {
                            ContactsExtrasStatementView(
                                contactID: row.recordID ?? "",
                                name: row["name"]?.stringValue ?? "Contact",
                                email: row["email"]?.stringValue,
                                supplier: side == "supplier",
                                currency: row["currencyCode"]?.stringValue ?? currency
                            )
                        } label: {
                            ContactsExtrasBalanceRow(row: row, currency: currency)
                        }
                        .navigationLinkIndicatorVisibility(.hidden)
                        .ledgerRow()
                    }
                    LedgerEndMarker(text: "\(rows.count) \(rows.count == 1 ? "statement" : "statements")")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .scrollDismissesKeyboard(.immediately)
                .refreshable { await load() }
                .overlay {
                    if rows.isEmpty {
                        EmptyStateView(symbol: "doc.richtext", title: "All square", message: side == "customer" ? "No customer owes you anything right now." : "You don't owe any supplier right now.")
                    }
                }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Statements")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: side == "customer" ? "Search customers" : "Search suppliers")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Toggle("Only with a balance", isOn: $openOnly)
                } label: {
                    Image(systemName: openOnly ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease")
                }
                .accessibilityLabel("Filter")
            }
        }
        .task(id: "\(side)|\(openOnly)|\(search)") {
            if !search.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
            if Task.isCancelled { return }
            await load()
        }
    }

    private func load() async {
        var query: [String: String?] = ["side": side, "limit": "100"]
        if openOnly { query["open"] = "1" }
        let term = search.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { query["search"] = term }
        await remote.load(env.api, "contacts/balances", query: query)
    }
}

/// Customers or suppliers, as a grey-tinted segment.
struct ContactsExtrasSideSegment: View {
    @Binding var selection: String
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 3) {
            ForEach([("customer", "Customers"), ("supplier", "Suppliers")], id: \.0) { value, label in
                let selected = selection == value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { selection = value }
                } label: {
                    Text(label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background {
                            if selected {
                                Capsule().fill(DTheme.tintStrong).matchedGeometryEffect(id: "side", in: namespace)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(3)
        .background(DTheme.tint.opacity(0.6), in: Capsule())
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// "Acme Corp · ap@acme.com      $8,450.00 / $3,200.00 overdue"
struct ContactsExtrasBalanceRow: View {
    let row: JSONValue
    let currency: String

    var body: some View {
        let name = row["name"]?.stringValue ?? "Contact"
        let overdue = row["overdue"]?.intValue ?? 0
        let rowCurrency = row["currencyCode"]?.stringValue ?? currency
        HStack(spacing: 12) {
            Avatar(name: name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(row["email"]?.stringValue ?? "No email, share the PDF")
                    .font(.system(size: 13))
                    .foregroundStyle(row["email"]?.stringValue == nil ? DTheme.inkTertiary : DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(row["outstanding"]?.intValue ?? 0, currency: rowCurrency))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                    .fixedSize()
                if overdue > 0 {
                    LedgerStatus(text: "\(Money.short(overdue, currency: rowCurrency)) overdue", tone: .negative)
                } else if (row["outstanding"]?.intValue ?? 0) > 0 {
                    LedgerStatus(text: "Not yet due", tone: .info)
                } else {
                    LedgerStatus(text: "Settled", tone: .neutral)
                }
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Statement

/// One contact's statement for a period: opening balance, every document
/// and payment with the running balance, and the closing figure. Customers'
/// statements can be emailed or shared as a PDF.
struct ContactsExtrasStatementView: View {
    let contactID: String
    let name: String
    let email: String?
    let supplier: Bool
    let currency: String

    @Environment(AppEnvironment.self) private var env
    @State private var remote = ContactsExtrasRemote()
    @State private var period = ContactsExtrasPeriod.twelveMonths
    @State private var working = false
    @State private var confirmingEmail = false
    @State private var shared: ContactsExtrasSharedFile?
    @State private var openingContact = false

    private var statement: JSONValue? { remote.value }

    var body: some View {
        ContactsExtrasLoadState(value: statement, error: remote.error, retry: load) { statement in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    hero(statement)
                    figures(statement)
                    ledger(statement)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, supplier ? 28 : 110)
            }
            .refreshable { await load() }
        }
        .background(DTheme.shell)
        .navigationTitle("Statement")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Period", selection: $period) {
                        ForEach(ContactsExtrasPeriod.allCases) { period in
                            Text(period.label).tag(period)
                        }
                    }
                    Divider()
                    Button {
                        openingContact = true
                    } label: {
                        Label("Open \(name)", systemImage: "person.crop.circle")
                    }
                    Button {
                        env.router.askTilly("Summarise \(name)'s account: what's owed, what's late and how they usually pay.", page: "contacts")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                } label: {
                    Image(systemName: "calendar")
                }
                .accessibilityLabel("Statement period")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if statement != nil, !supplier {
                HStack(spacing: 10) {
                    Button {
                        Task { await sharePDF() }
                    } label: {
                        Label("PDF", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                    Button {
                        confirmingEmail = true
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "envelope") }
                            Text("Email")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(email == nil)
                }
                .disabled(working)
                .padding(10)
                .glassEffect(.regular, in: .rect(cornerRadius: 32))
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
            }
        }
        .confirmationDialog("Email this statement to \(email ?? name)?", isPresented: $confirmingEmail, titleVisibility: .visible) {
            Button("Send statement") { Task { await sendEmail() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(period.label), as a PDF from your workspace's email settings.")
        }
        .sheet(item: $shared) { file in
            ContactsExtrasShareSheet(items: [file.url])
                .presentationDetents([.medium, .large])
        }
        .navigationDestination(isPresented: $openingContact) {
            ContactDetailView(id: contactID)
        }
        .task(id: period) { await load() }
    }

    private func hero(_ statement: JSONValue) -> some View {
        let closing = statement["closingBalance"]?.intValue ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            Text(name)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(closing, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText(value: Double(closing)))
            Text("\(supplier ? "You owe them" : "They owe you") at \(DubblDate.display(statement["endDate"]?.stringValue)) · \(DubblDate.short(statement["startDate"]?.stringValue)) to \(DubblDate.short(statement["endDate"]?.stringValue))")
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    /// Opening, what was added and what came off in the period.
    private func figures(_ statement: JSONValue) -> some View {
        let lines = statement["transactions"]?.arrayValue ?? []
        // Customers: debit adds to what they owe. Suppliers: credit adds to what we owe.
        let added = lines.reduce(0) { $0 + (($1[supplier ? "credit" : "debit"]?.intValue) ?? 0) }
        let removed = lines.reduce(0) { $0 + (($1[supplier ? "debit" : "credit"]?.intValue) ?? 0) }
        return LedgerTotals(items: [
            .init(label: "Opening", value: Money.short(statement["openingBalance"]?.intValue ?? 0, currency: currency)),
            .init(label: supplier ? "Billed" : "Invoiced", value: Money.short(added, currency: currency), tint: DTheme.accent),
            .init(label: "Paid", value: Money.short(removed, currency: currency), tint: DTheme.positive),
        ])
        .padding(16)
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
    }

    private func ledger(_ statement: JSONValue) -> some View {
        let lines = statement["transactions"]?.arrayValue ?? []
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Activity · \(lines.count)")
            CardStack {
                balanceRow("Opening balance", date: statement["startDate"]?.stringValue, amount: statement["openingBalance"]?.intValue ?? 0)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    transactionRow(line)
                }
                balanceRow("Closing balance", date: statement["endDate"]?.stringValue, amount: statement["closingBalance"]?.intValue ?? 0)
            }
            if lines.isEmpty {
                Text("Nothing happened on this account in the period.")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.horizontal, 4)
            }
        }
    }

    private func balanceRow(_ title: String, date: String?, amount: Int) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                Text(DubblDate.display(date))
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            Spacer()
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background(DTheme.tint.opacity(0.5))
    }

    private func transactionRow(_ line: JSONValue) -> some View {
        let added = line[supplier ? "credit" : "debit"]?.intValue ?? 0
        let removed = line[supplier ? "debit" : "credit"]?.intValue ?? 0
        let type = line["type"]?.stringValue ?? ""
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(Self.typeLabel(type))
                        .font(.system(size: 14.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                    if let number = line["documentNumber"]?.stringValue, !number.isEmpty {
                        Text(number)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                Text([DubblDate.short(line["date"]?.stringValue), line["description"]?.stringValue].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(removed > 0 ? "−\(Money.format(removed, currency: currency))" : Money.format(added, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(removed > 0 ? DTheme.positive : DTheme.ink)
                Text(Money.format(line["balance"]?.intValue ?? 0, currency: currency))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
    }

    static func typeLabel(_ type: String) -> String {
        ["invoice": "Invoice", "credit_note": "Credit note", "payment": "Payment", "bill": "Bill", "debit_note": "Debit note"][type] ?? type.humanized
    }

    private func load() async {
        let range = period.range
        await remote.load(env.api, supplier ? "contacts/\(contactID)/supplier-statement" : "contacts/\(contactID)/statement", query: ["startDate": range.start, "endDate": range.end])
    }

    private func sendEmail() async {
        working = true
        defer { working = false }
        let range = period.range
        do {
            let response: JSONValue = try await env.api.post("contacts/\(contactID)/statement/email", body: ["startDate": range.start, "endDate": range.end])
            env.toast.show("Statement sent to \(response["sentTo"]?.stringValue ?? email ?? name)")
        } catch {
            env.toast.error(error)
        }
    }

    private func sharePDF() async {
        working = true
        defer { working = false }
        let range = period.range
        do {
            let data = try await env.api.download("contacts/\(contactID)/statement/pdf", query: ["download": "1", "startDate": range.start, "endDate": range.end])
            guard !data.isEmpty else {
                env.toast.show("No PDF in demo mode", symbol: "doc")
                return
            }
            let slug = name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
            let url = FileManager.default.temporaryDirectory.appending(path: "statement-\(String(slug))-\(range.end).pdf")
            try data.write(to: url, options: .atomic)
            shared = ContactsExtrasSharedFile(url: url)
        } catch {
            env.toast.error(error)
        }
    }
}
