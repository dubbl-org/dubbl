import SwiftUI

/// One editable line. Quantity and price are typed as text and parsed as
/// decimals; the price is in major units like the API expects.
struct SalesDraftLine: Identifiable, Equatable {
    let id = UUID()
    var description = ""
    var quantity = "1"
    var unitPrice = ""

    var quantityValue: Decimal? { SalesDecimal.parse(quantity) }
    var priceValue: Decimal? { SalesDecimal.parse(unitPrice) }

    var isBlank: Bool {
        description.trimmingCharacters(in: .whitespaces).isEmpty && unitPrice.trimmingCharacters(in: .whitespaces).isEmpty
    }

    func total(currency: String) -> Int {
        Money.minor(fromMajor: (quantityValue ?? 0) * (priceValue ?? 0), currency: currency)
    }
}

/// Create an invoice: customer, dates, lines and notes. Saves a draft, or
/// saves and marks it as sent in one go.
struct NewInvoiceSheet: View {
    var recentContacts: [Contact] = []
    var onCreated: (Invoice) -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var contact: Contact?
    @State private var issueDate = Calendar.current.startOfDay(for: .now)
    @State private var dueDate = Calendar.current.date(byAdding: .day, value: 30, to: Calendar.current.startOfDay(for: .now)) ?? .now
    @State private var dueEdited = false
    @State private var lines: [SalesDraftLine] = [SalesDraftLine()]
    @State private var reference = ""
    @State private var notes = ""
    @State private var saving: SaveMode?
    @State private var showErrors = false
    @State private var error: String?
    @State private var pickingCustomer = false
    @FocusState private var focusedLine: UUID?

    private enum SaveMode { case draft, send }

    private var currency: String { contact?.currencyCode ?? env.session.currency }
    private var termsDays: Int { contact?.paymentTermsDays ?? 30 }
    private var filledLines: [SalesDraftLine] {
        lines.filter { !$0.description.trimmingCharacters(in: .whitespaces).isEmpty }
    }
    private var subtotal: Int { filledLines.reduce(0) { $0 + $1.total(currency: currency) } }

    private var problem: String? {
        if contact == nil { return "Choose a customer." }
        if filledLines.isEmpty { return "Add at least one item with a description." }
        if lines.contains(where: { !$0.isBlank && $0.description.trimmingCharacters(in: .whitespaces).isEmpty }) {
            return "Every item needs a description."
        }
        if filledLines.contains(where: { $0.quantityValue == nil || ($0.quantityValue ?? 0) <= 0 }) {
            return "Quantities need to be more than zero."
        }
        if filledLines.contains(where: { !$0.unitPrice.isEmpty && $0.priceValue == nil }) {
            return "One of the prices isn't a number."
        }
        if dueDate < issueDate { return "The due date is before the issue date." }
        return nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    customerSection
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
            .navigationTitle("New invoice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                        .disabled(saving != nil)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedLine = nil; hideKeyboard() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
            .navigationDestination(isPresented: $pickingCustomer) {
                SalesCustomerPicker(selection: $contact, fallback: recentContacts)
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
        .interactiveDismissDisabled(saving != nil || contact != nil || !filledLines.isEmpty)
        .onChange(of: issueDate) { _, _ in applyTerms() }
        .onChange(of: contact) { _, _ in applyTerms() }
        #if DEBUG
        .onAppear { fillDemo() }
        #endif
    }

    // MARK: Sections

    private var customerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Customer")
            Button {
                pickingCustomer = true
            } label: {
                HStack(spacing: 12) {
                    if let contact {
                        Avatar(name: contact.name, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(contact.name)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            Text(contact.email ?? "Net \(termsDays)")
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    } else {
                        IconTile(symbol: "person", size: 36)
                        Text("Choose a customer")
                            .font(.system(size: 16))
                            .foregroundStyle(showErrors ? DTheme.negative : DTheme.inkSecondary)
                    }
                    Spacer()
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
            SalesInlineRow(label: "Issue date") {
                DatePicker("Issue date", selection: $issueDate, displayedComponents: .date)
                    .labelsHidden()
            }
            SalesInlineRow(label: "Due date") {
                HStack(spacing: 8) {
                    if let days = Calendar.current.dateComponents([.day], from: issueDate, to: dueDate).day, days >= 0 {
                        Text(days == 0 ? "On receipt" : "Net \(days)")
                            .font(.system(size: 13))
                            .fixedSize()
                            .foregroundStyle(DTheme.inkTertiary)
                            .contentTransition(.numericText())
                    }
                    DatePicker("Due date", selection: dueBinding, in: issueDate..., displayedComponents: .date)
                        .labelsHidden()
                }
            }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Items")
            VStack(spacing: 10) {
                ForEach($lines) { $line in
                    SalesLineEditor(
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
                    TextField("PO number or project", text: $reference)
                        .autocorrectionDisabled()
                }
                FieldRow(label: "Notes") {
                    TextField("Shown on the invoice", text: $notes, axis: .vertical)
                        .lineLimit(2 ... 6)
                }
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button {
                Task { await save(.draft) }
            } label: {
                if saving == .draft { ProgressView().tint(DTheme.ink) } else { Text("Save draft") }
            }
            .buttonStyle(SoftButtonStyle(size: .large))

            Button {
                Task { await save(.send) }
            } label: {
                if saving == .send { ProgressView().tint(DTheme.inkInverse) } else { Text("Save and mark as sent") }
            }
            .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
        }
        .disabled(saving != nil)
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background { SalesBottomFade() }
    }

    // MARK: Behaviour

    /// Editing the due date by hand stops it following the payment terms.
    private var dueBinding: Binding<Date> {
        Binding(
            get: { dueDate },
            set: { value in
                dueDate = value
                dueEdited = true
            }
        )
    }

    private func applyTerms() {
        if dueEdited, dueDate >= issueDate { return }
        withAnimation(.snappy) {
            dueDate = Calendar.current.date(byAdding: .day, value: termsDays, to: issueDate) ?? issueDate
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    private func save(_ mode: SaveMode) async {
        error = nil
        guard let contact, problem == nil else {
            withAnimation(.snappy) { showErrors = true }
            return
        }
        saving = mode
        defer { saving = nil }

        let trimmedReference = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = SalesNewInvoiceBody(
            contactId: contact.id,
            issueDate: DubblDate.string(issueDate),
            dueDate: DubblDate.string(dueDate),
            reference: trimmedReference.isEmpty ? nil : trimmedReference,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            lines: filledLines.map { line in
                SalesNewInvoiceBody.Line(
                    description: line.description.trimmingCharacters(in: .whitespaces),
                    quantity: SalesDecimal.double(line.quantityValue ?? 1),
                    unitPrice: SalesDecimal.double(line.priceValue ?? 0)
                )
            }
        )

        let created: Invoice
        do {
            let response: InvoiceResponse = try await env.api.post("invoices", body: body)
            created = response.invoice
        } catch {
            withAnimation(.snappy) {
                self.error = error.localizedDescription
                showErrors = true
            }
            return
        }

        if mode == .send {
            do {
                let _: InvoiceResponse = try await env.api.post("invoices/\(created.id)/send")
                env.toast.show("Invoice \(created.invoiceNumber) sent", symbol: "paperplane")
            } catch {
                env.toast.show("Saved as a draft. \(error.localizedDescription)", isError: true)
            }
        } else {
            env.toast.show("Draft \(created.invoiceNumber) saved")
        }
        SalesEvents.invoicesChanged()
        onCreated(created)
        dismiss()
    }

    #if DEBUG
    /// DUBBL_DEMO_OPEN=new-filled prefills the form for screenshots.
    private func fillDemo() {
        guard DemoData.isEnabled, contact == nil else { return }
        if DemoData.open == "new-picker" {
            Task {
                try? await Task.sleep(for: .milliseconds(700))
                pickingCustomer = true
            }
        }
        guard DemoData.open == "new-filled" else { return }
        contact = recentContacts.first
        lines = [
            SalesDraftLine(description: "Brand identity workshop", quantity: "1", unitPrice: "2400"),
            SalesDraftLine(description: "Logo design rounds", quantity: "3", unitPrice: "450"),
        ]
        reference = "PO-2291"
    }
    #endif
}

// MARK: - Line editor

/// A card for one line: description on top, quantity and price below with the
/// running line total.
private struct SalesLineEditor: View {
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

// MARK: - Customer picker

/// Searchable contacts, customers first. Falls back to customers from recent
/// invoices when the contacts list can't be loaded.
struct SalesCustomerPicker: View {
    @Binding var selection: Contact?
    var fallback: [Contact] = []

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Contact] = []
    @State private var loaded = false
    @State private var failed: String?

    private var shown: [Contact] {
        guard failed != nil else { return results }
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return fallback }
        return fallback.filter { $0.name.lowercased().contains(needle) || ($0.email?.lowercased().contains(needle) ?? false) }
    }

    private var customers: [Contact] { shown.filter { $0.type != "supplier" } }
    private var others: [Contact] { shown.filter { $0.type == "supplier" } }

    var body: some View {
        List {
            if !loaded {
                SkeletonRows(rows: 6)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(DTheme.card)
            } else if shown.isEmpty {
                Group {
                    if let failed, fallback.isEmpty {
                        ErrorStateView(message: failed) { await search() }
                    } else {
                        EmptyStateView(
                            symbol: "person.crop.circle.badge.questionmark",
                            title: query.isEmpty ? "No contacts yet" : "No matches",
                            message: query.isEmpty ? "Add customers on the Contacts tab." : "Try another name or email."
                        )
                    }
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } else {
                if !customers.isEmpty {
                    Section(failed != nil ? "Recent customers" : "Customers") {
                        ForEach(customers) { row($0) }
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
        .navigationTitle("Customer")
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
                    Text(subtitle(contact))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
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

    private func subtitle(_ contact: Contact) -> String {
        var parts = [String]()
        if let email = contact.email, !email.isEmpty { parts.append(email) }
        parts.append("Net \(contact.paymentTermsDays ?? 30)")
        return parts.joined(separator: " · ")
    }

    private func search() async {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        do {
            let page: Page<Contact> = try await env.api.get("contacts", query: [
                "search": trimmed.isEmpty ? nil : trimmed,
                "limit": "30",
                "sortBy": "name",
                "sortOrder": "asc",
            ])
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) {
                results = page.data
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
