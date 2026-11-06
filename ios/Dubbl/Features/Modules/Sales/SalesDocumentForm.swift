import SwiftUI

// A create form for line-item documents (quotes, cash sales, credit notes,
// purchase orders, requisitions). Each kind is described by a
// `SalesDocumentKind`; the form draws the party, dates, lines and details and
// posts them. Lines go up as decimals with prices in MAJOR units, which is what
// every one of these routes expects.

/// Who the document is with.
enum SalesPartyRole {
    case customer, supplier

    var title: String { self == .customer ? "Customer" : "Supplier" }
    var prompt: String { self == .customer ? "Choose a customer" : "Choose a supplier" }
}

/// One kind of document the form can create.
struct SalesDocumentKind {
    /// "New quote"
    let title: String
    /// "Quote", used in toasts.
    let singular: String
    var party: SalesPartyRole = .customer
    var partyOptional = false
    /// POST route and the key of the created record in its answer.
    let endpoint: String
    let responseKey: String
    /// Number field on the created record, for the toast.
    var numberKey: String?
    /// First date: label and body key.
    var dateLabel = "Issue date"
    var dateKey = "issueDate"
    /// Optional second date (expiry, delivery, needed by).
    var secondDate: SecondDate?
    /// Sends `currencyCode` (routes that default to USD otherwise).
    var sendsCurrency = true
    /// Asks which bank account the money landed in (cash sales).
    var asksBankAccount = false
    var referencePlaceholder = "PO number or project"
    var notesPlaceholder = "Shown on the document"
    /// Second button: saves, then POSTs `{endpoint}/{id}/{path}`.
    var finish: Finish?
    /// Recurring templates: a name and how often it repeats.
    var asksName = false
    var asksFrequency = false
    /// Fields sent as they are, e.g. `type: "invoice"`.
    var fixed: [String: JSONValue] = [:]
    /// RecordSpec key whose list reloads afterwards.
    let specKey: String

    struct SecondDate {
        let label: String
        let key: String
        var days = 30
        var optional = false
    }

    struct Finish {
        let title: String
        let path: String
        /// "Quote QUO-0032 sent"
        let done: String
    }
}

/// The create sheet: the form in its own navigation stack.
struct SalesDocumentSheet: View {
    let kind: SalesDocumentKind
    var onCreated: () -> Void = {}

    var body: some View {
        NavigationStack {
            SalesDocumentFormView(kind: kind, onCreated: onCreated)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
    }
}

/// The form itself, without a navigation stack (so a debug page can push it).
struct SalesDocumentFormView: View {
    let kind: SalesDocumentKind
    var onCreated: () -> Void = {}

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var contact: Contact?
    @State private var date = Calendar.current.startOfDay(for: .now)
    @State private var secondDate = Calendar.current.date(byAdding: .day, value: 30, to: Calendar.current.startOfDay(for: .now)) ?? .now
    @State private var hasSecondDate = true
    @State private var lines: [SalesDraftLine] = [SalesDraftLine()]
    @State private var reference = ""
    @State private var notes = ""
    @State private var name = ""
    @State private var frequency = "monthly"
    @State private var bankAccounts: [BankAccount] = []
    @State private var bankAccountID: String?
    @State private var saving: SaveMode?
    @State private var showErrors = false
    @State private var error: String?
    @State private var pickingParty = false
    @FocusState private var focusedLine: UUID?

    private enum SaveMode { case draft, finish }

    private var currency: String { contact?.currencyCode ?? env.session.currency }
    private var filledLines: [SalesDraftLine] {
        lines.filter { !$0.description.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    private var subtotal: Int { filledLines.reduce(0) { $0 + $1.total(currency: currency) } }

    private var problem: String? {
        if kind.asksName, name.trimmingCharacters(in: .whitespaces).isEmpty { return "Give it a name." }
        if contact == nil, !kind.partyOptional { return "\(kind.party.prompt)." }
        if filledLines.isEmpty { return "Add at least one item with a description." }
        if lines.contains(where: { !$0.isBlank && $0.description.trimmingCharacters(in: .whitespaces).isEmpty }) {
            return "Every item needs a description."
        }
        if filledLines.contains(where: { ($0.quantityValue ?? 0) <= 0 }) { return "Quantities need to be more than zero." }
        if filledLines.contains(where: { !$0.unitPrice.isEmpty && $0.priceValue == nil }) { return "One of the prices isn't a number." }
        if let second = kind.secondDate, hasSecondDate || !second.optional, secondDate < date {
            return "\(second.label) is before \(kind.dateLabel.lowercased())."
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if kind.asksName {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("Monthly retainer", text: $name)
                        }
                    }
                }
                partySection
                datesSection
                itemsSection
                detailsSection
                if showErrors, let message = error ?? problem {
                    Label(message, systemImage: "exclamationmark.circle")
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.negative)
                        .padding(.horizontal, 4)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
            .animation(.snappy(duration: 0.25), value: lines)
            .animation(.snappy(duration: 0.22), value: showErrors ? (error ?? problem) : nil)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(DTheme.shell)
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel", role: .cancel) { dismiss() }
                    .disabled(saving != nil)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedLine = nil }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
        .navigationDestination(isPresented: $pickingParty) {
            SalesPartyPicker(role: kind.party, selection: $contact)
        }
        .interactiveDismissDisabled(saving != nil || contact != nil || !filledLines.isEmpty)
        .onAppear {
            if let second = kind.secondDate {
                secondDate = Calendar.current.date(byAdding: .day, value: second.days, to: date) ?? date
                hasSecondDate = !second.optional
            }
            #if DEBUG
            fillDemo()
            #endif
        }
        .task {
            guard kind.asksBankAccount, bankAccounts.isEmpty else { return }
            if let response: BankAccountsResponse = try? await env.api.get("bank-accounts") {
                bankAccounts = response.bankAccounts.filter(\.isActive)
                if bankAccountID == nil { bankAccountID = bankAccounts.first?.id }
            }
        }
    }

    // MARK: Sections

    private var partySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(kind.partyOptional ? "\(kind.party.title), optional" : kind.party.title)
            Button {
                pickingParty = true
            } label: {
                HStack(spacing: 12) {
                    if let contact {
                        Avatar(name: contact.name, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(contact.name)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            if let email = contact.email {
                                Text(email)
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                    } else {
                        IconTile(symbol: kind.party == .customer ? "person" : "building.2", size: 36)
                        Text(kind.party.prompt)
                            .font(.system(size: 16))
                            .foregroundStyle(showErrors && !kind.partyOptional ? DTheme.negative : DTheme.inkSecondary)
                    }
                    Spacer()
                    if contact != nil, kind.partyOptional {
                        Button {
                            contact = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 18))
                                .symbolRenderingMode(.hierarchical)
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear \(kind.party.title.lowercased())")
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 64)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            }
            .buttonStyle(TapScaleStyle())
        }
    }

    private var datesSection: some View {
        CardStack {
            if kind.asksFrequency {
                SalesInlineRow(label: "Repeats") {
                    Picker("Repeats", selection: $frequency) {
                        ForEach(SalesRecurring.frequencies, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                    .labelsHidden()
                    .tint(DTheme.ink)
                }
            }
            SalesInlineRow(label: kind.dateLabel) {
                DatePicker(kind.dateLabel, selection: $date, displayedComponents: .date)
                    .labelsHidden()
            }
            if let second = kind.secondDate {
                if second.optional {
                    SalesInlineRow(label: second.label) {
                        Toggle(second.label, isOn: $hasSecondDate.animation(.snappy))
                            .labelsHidden()
                    }
                }
                if hasSecondDate {
                    SalesInlineRow(label: second.optional ? "Date" : second.label) {
                        HStack(spacing: 8) {
                            if let days = Calendar.current.dateComponents([.day], from: date, to: secondDate).day, days >= 0 {
                                Text(days == 0 ? "Same day" : "\(days) days")
                                    .font(.system(size: 13))
                                    .fixedSize()
                                    .foregroundStyle(DTheme.inkTertiary)
                                    .contentTransition(.numericText())
                            }
                            DatePicker(second.label, selection: $secondDate, in: date..., displayedComponents: .date)
                                .labelsHidden()
                        }
                    }
                }
            }
            if kind.asksBankAccount, !bankAccounts.isEmpty {
                SalesInlineRow(label: "Paid into") {
                    SalesBankAccountMenu(accounts: bankAccounts, selection: $bankAccountID)
                }
            }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Items")
            VStack(spacing: 10) {
                ForEach($lines) { $line in
                    SalesDocumentLineEditor(
                        line: $line,
                        currency: currency,
                        canRemove: lines.count > 1,
                        flagged: showErrors && !line.isBlank && line.description.trimmingCharacters(in: .whitespaces).isEmpty,
                        focus: $focusedLine
                    ) {
                        lines.removeAll { $0.id == line.id }
                    }
                    .transition(.asymmetric(insertion: .opacity.combined(with: .move(edge: .top)), removal: .opacity))
                }

                Button {
                    let line = SalesDraftLine()
                    lines.append(line)
                    focusedLine = line.id
                } label: {
                    Label("Add item", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(SoftButtonStyle(size: .regular, fullWidth: true))
            }

            VStack(spacing: 0) {
                HStack {
                    Text("Subtotal")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                    Spacer()
                    MoneyText(minor: subtotal, currency: currency, size: 17, weight: .semibold)
                        .foregroundStyle(DTheme.ink)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                Hairline().padding(.leading, 16)
                Text("Tax is worked out by the server when you save.")
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
            }
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            .padding(.top, 4)
        }
    }

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                FieldRow(label: "Reference") {
                    TextField(kind.referencePlaceholder, text: $reference)
                        .autocorrectionDisabled()
                }
                FieldRow(label: "Notes") {
                    TextField(kind.notesPlaceholder, text: $notes, axis: .vertical)
                        .lineLimit(2 ... 6)
                }
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            if let finish = kind.finish {
                Button {
                    Task { await save(.draft) }
                } label: {
                    if saving == .draft { ProgressView().tint(DTheme.ink) } else { Text("Save draft") }
                }
                .buttonStyle(SoftButtonStyle(size: .large))

                Button {
                    Task { await save(.finish) }
                } label: {
                    if saving == .finish { ProgressView().tint(DTheme.inkInverse) } else { Text(finish.title) }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            } else {
                Button {
                    Task { await save(.draft) }
                } label: {
                    if saving == .draft { ProgressView().tint(DTheme.inkInverse) } else { Text("Save \(kind.singular.lowercased())") }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            }
        }
        .disabled(saving != nil)
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background { SalesBottomFade() }
    }

    // MARK: Saving

    private func requestBody() -> [String: JSONValue] {
        func text(_ value: String) -> JSONValue {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? .null : .string(trimmed)
        }
        var body: [String: JSONValue] = [
            kind.dateKey: .string(DubblDate.string(date)),
            "reference": text(reference),
            "notes": text(notes),
            "lines": .array(filledLines.map { line in
                .object([
                    "description": .string(line.description.trimmingCharacters(in: .whitespaces)),
                    "quantity": .number(SalesDecimal.double(line.quantityValue ?? 1)),
                    "unitPrice": .number(SalesDecimal.double(line.priceValue ?? 0)),
                ])
            }),
        ]
        if let contact { body["contactId"] = .string(contact.id) }
        if kind.asksName { body["name"] = .string(name.trimmingCharacters(in: .whitespaces)) }
        if kind.asksFrequency { body["frequency"] = .string(frequency) }
        body.merge(kind.fixed) { $1 }
        if let second = kind.secondDate {
            body[second.key] = hasSecondDate ? .string(DubblDate.string(secondDate)) : .null
        }
        if kind.sendsCurrency { body["currencyCode"] = .string(currency) }
        if kind.asksBankAccount, let bankAccountID { body["bankAccountId"] = .string(bankAccountID) }
        return body
    }

    private func save(_ mode: SaveMode) async {
        error = nil
        guard problem == nil else {
            withAnimation(.snappy) { showErrors = true }
            return
        }
        saving = mode
        defer { saving = nil }

        let created: JSONValue
        do {
            let response: JSONValue = try await env.api.post(kind.endpoint, body: requestBody())
            created = response[kind.responseKey] ?? response
        } catch {
            withAnimation(.snappy) {
                self.error = error.localizedDescription
                showErrors = true
            }
            return
        }

        let number = kind.numberKey.flatMap { created[$0]?.stringValue }.map { kind.asksName ? "“\($0)”" : $0 }
        let name = [kind.singular, number].compactMap { $0 }.joined(separator: " ")
        if mode == .finish, let finish = kind.finish, let id = created.recordID {
            do {
                let _: JSONValue = try await env.api.post("\(kind.endpoint)/\(id)/\(finish.path)", body: [String: JSONValue]())
                env.toast.show("\(name) \(finish.done)")
            } catch {
                env.toast.show("Saved as a draft. \(error.localizedDescription)", isError: true)
            }
        } else {
            env.toast.show("\(name) saved")
        }
        NotificationCenter.default.post(name: .recordsChanged, object: kind.specKey)
        onCreated()
        dismiss()
    }

    #if DEBUG
    /// Prefills the form in demo mode when opened from a debug page.
    private func fillDemo() {
        guard DemoData.isEnabled, DemoData.open?.hasSuffix("/new") == true, contact == nil else { return }
        if kind.asksName { name = kind.party == .customer ? "Hooli monthly retainer" : "Studio supplies" }
        if kind.party == .customer {
            contact = Contact(id: "demo-contact-hooli", name: "Hooli", email: "payables@hooli.xyz", type: "customer", paymentTermsDays: 30, currencyCode: "USD")
            lines = [
                SalesDraftLine(description: "Brand strategy workshop", quantity: "1", unitPrice: "4200"),
                SalesDraftLine(description: "Launch assets", quantity: "6", unitPrice: "300"),
            ]
            reference = "Brand refresh"
        } else {
            contact = Contact(id: "demo-contact-staples", name: "Staples", email: "orders@staples.com", type: "supplier", paymentTermsDays: 30, currencyCode: "USD")
            lines = [
                SalesDraftLine(description: "Standing desks", quantity: "4", unitPrice: "489"),
                SalesDraftLine(description: "Monitor arms", quantity: "8", unitPrice: "79.50"),
            ]
            reference = "Studio fit-out"
        }
    }
    #endif
}

// MARK: - Line editor

/// One line: description on top, quantity and price below with the line total.
struct SalesDocumentLineEditor: View {
    @Binding var line: SalesDraftLine
    let currency: String
    let canRemove: Bool
    let flagged: Bool
    var focus: FocusState<UUID?>.Binding
    let remove: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
                TextField("Description", text: $line.description, axis: .vertical)
                    .font(.system(size: 16))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1 ... 4)
                    .focused(focus, equals: line.id)
                if canRemove {
                    Button(role: .destructive, action: remove) {
                        Image(systemName: "minus.circle.fill")
                            .font(.system(size: 18))
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove item")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Hairline().padding(.leading, 16)

            HStack(spacing: 10) {
                field(label: "Qty", width: 82) {
                    TextField("1", text: $line.quantity)
                        .keyboardType(.decimalPad)
                }
                Text("x")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                field(label: Money.symbol(currency), width: 116) {
                    TextField("0.00", text: $line.unitPrice)
                        .keyboardType(.decimalPad)
                }
                Spacer(minLength: 6)
                MoneyText(minor: line.total(currency: currency), currency: currency, size: 15.5)
                    .foregroundStyle(line.total(currency: currency) == 0 ? DTheme.inkTertiary : DTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(flagged ? DTheme.negative.opacity(0.6) : DTheme.hairlineSoft, lineWidth: flagged ? 1 : 0.5)
        )
    }

    private func field<F: View>(label: String, width: CGFloat, @ViewBuilder content: () -> F) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(DTheme.inkSecondary)
                .fixedSize()
            content()
                .font(DFont.figure(15, weight: .regular))
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 10)
        .frame(width: width, height: 36)
        .background(DTheme.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - Party picker

/// Searchable contacts with the role's own kind first (customers or suppliers).
struct SalesPartyPicker: View {
    let role: SalesPartyRole
    @Binding var selection: Contact?

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Contact] = []
    @State private var loaded = false
    @State private var failed: String?

    private var preferred: String { role == .customer ? "customer" : "supplier" }
    private var matches: [Contact] { results.filter { $0.type == preferred || $0.type == "both" || $0.type == nil } }
    private var others: [Contact] { results.filter { !matches.contains($0) } }

    var body: some View {
        List {
            if !loaded {
                SkeletonRows(rows: 6)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(DTheme.card)
            } else if results.isEmpty {
                Group {
                    if let failed {
                        ErrorStateView(message: failed) { await search() }
                    } else {
                        EmptyStateView(
                            symbol: "person.crop.circle.badge.questionmark",
                            title: query.isEmpty ? "No contacts yet" : "No matches",
                            message: query.isEmpty ? "Add contacts on the Contacts tab." : "Try another name or email."
                        )
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } else {
                if !matches.isEmpty {
                    Section(role == .customer ? "Customers" : "Suppliers") {
                        ForEach(matches) { row($0) }
                    }
                }
                if !others.isEmpty {
                    Section("Other contacts") {
                        ForEach(others) { row($0) }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(DTheme.shell)
        .navigationTitle(role.title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search contacts")
        .task(id: query) {
            if loaded { try? await Task.sleep(for: .milliseconds(280)) }
            guard !Task.isCancelled else { return }
            await search()
        }
    }

    private func row(_ contact: Contact) -> some View {
        Button {
            selection = contact
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Avatar(name: contact.name, size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(contact.name)
                        .font(.system(size: 15.5, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                    if let email = contact.email, !email.isEmpty {
                        Text(email)
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if selection?.id == contact.id {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                }
            }
            .contentShape(Rectangle())
            .alignmentGuide(.listRowSeparatorLeading) { dimensions in dimensions[.leading] + 46 }
        }
        .buttonStyle(.plain)
        .listRowBackground(DTheme.card)
        .listRowSeparatorTint(DTheme.hairline)
    }

    private func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        do {
            let page: Page<Contact> = try await env.api.get("contacts", query: [
                "search": trimmed.isEmpty ? nil : trimmed,
                "limit": "40",
                "sortBy": "name",
                "sortOrder": "asc",
            ])
            guard !Task.isCancelled else { return }
            var found = page.data
            #if DEBUG
            // Fixtures ignore the search query.
            if DemoData.isEnabled, !trimmed.isEmpty { found = found.filter { $0.name.localizedCaseInsensitiveContains(trimmed) } }
            #endif
            withAnimation(.snappy) {
                results = found
                failed = nil
                loaded = true
            }
        } catch {
            guard !Task.isCancelled, !(error is CancellationError) else { return }
            withAnimation(.snappy) {
                failed = error.localizedDescription
                loaded = true
            }
        }
    }
}

// MARK: - Bank account menu

/// Picks a bank account; the chosen name stays on one line.
struct SalesBankAccountMenu: View {
    let accounts: [BankAccount]
    @Binding var selection: String?

    var body: some View {
        Menu {
            Picker("Bank account", selection: $selection) {
                ForEach(accounts) { account in
                    Text(account.accountName).tag(Optional(account.id))
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(accounts.first { $0.id == selection }?.accountName ?? "Choose")
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .font(.system(size: 15))
            .foregroundStyle(DTheme.ink)
        }
    }
}
