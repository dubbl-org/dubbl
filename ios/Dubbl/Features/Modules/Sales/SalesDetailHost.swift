import SwiftUI

// The generic record detail plus actions that need a form first (apply a
// credit to an invoice, receive goods against an order). RecordAction can only
// fire a request, so these hosts wrap RecordDetailView, keep their own copy of
// the record to know its status, and draw their buttons in the same glass tray.
// Keep host action statuses apart from the spec's primary action statuses so
// only one tray shows at a time.

/// A button on a record that opens a sheet.
struct SalesHostAction {
    let title: String
    let symbol: String
    /// Only while the record's status is one of these.
    let statuses: Set<String>
    /// Extra condition on the record, e.g. something left to apply.
    var when: (JSONValue) -> Bool = { _ in true }
    /// The sheet: the record and a completion that refreshes the screen.
    let sheet: (JSONValue, @escaping () -> Void) -> AnyView
}

struct SalesDetailHost: View {
    let spec: RecordSpec
    let id: String
    let actions: [SalesHostAction]

    @Environment(AppEnvironment.self) private var env
    @State private var record: JSONValue?
    @State private var presented: Int?
    @State private var generation = 0

    private var detailPath: String { (spec.detailEndpoint ?? "\(spec.endpoint)/{id}").replacingOccurrences(of: "{id}", with: id) }

    private var available: [Int] {
        guard let record, let status = spec.row.status.flatMap({ record[$0]?.stringValue }) else { return [] }
        return actions.indices.filter { actions[$0].statuses.contains(status) && actions[$0].when(record) }
    }

    var body: some View {
        RecordDetailView(spec: spec, id: id)
            .id(generation)
            .safeAreaInset(edge: .bottom) {
                if !available.isEmpty {
                    PurchasesActionBar {
                        ForEach(available, id: \.self) { index in
                            let action = actions[index]
                            Button {
                                presented = index
                            } label: {
                                Label(action.title, systemImage: action.symbol)
                            }
                            .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                        }
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .sheet(isPresented: Binding(get: { presented != nil }, set: { if !$0 { presented = nil } })) {
                if let index = presented, let record {
                    actions[index].sheet(record) {
                        NotificationCenter.default.post(name: .recordsChanged, object: spec.key)
                        generation += 1
                    }
                }
            }
            .task(id: generation) { await load() }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == spec.key { Task { await load() } }
            }
    }

    private func load() async {
        guard let response: JSONValue = try? await env.api.get(detailPath) else { return }
        withAnimation(.snappy) { record = RecordDetailView.record(in: response, key: spec.detailKey) }
    }
}

// MARK: - Apply a credit

/// Applies money held on a credit (credit note, prepayment, supplier credit)
/// to one of the contact's open invoices or bills.
struct SalesApplySheet: View {
    enum Target { case invoice, bill }

    let title: String
    let target: Target
    /// Who the credit belongs to; documents are limited to them.
    let contactID: String?
    let currency: String
    /// Minor units left on the credit.
    let available: Int
    /// POST route, e.g. "credit-notes/{id}/apply".
    let path: String
    /// Customer credits take an application date.
    var sendsDate = false
    let done: () -> Void

    /// An invoice or bill with money still owed.
    private struct OpenDocument: Identifiable, Hashable {
        let id: String
        let number: String
        let dueDate: String
        let amountDue: Int
        let currency: String
    }

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var documents: [OpenDocument] = []
    @State private var loaded = false
    @State private var failed: String?
    @State private var selected: OpenDocument?
    @State private var amount = 0
    @State private var date = Calendar.current.startOfDay(for: .now)
    @State private var saving = false

    private var noun: String { target == .invoice ? "invoice" : "bill" }
    private var limit: Int { min(available, selected?.amountDue ?? available) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Available")
                            .font(.system(size: 13.5, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        MoneyText(minor: available, currency: currency, size: 34, weight: .semibold)
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.horizontal, 4)

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Open \(noun)s")
                        documentList
                    }

                    if selected != nil {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Amount")
                            CardStack {
                                SalesInlineRow(label: "Apply") {
                                    AmountField(minor: $amount, currency: currency)
                                        .multilineTextAlignment(.trailing)
                                        .frame(maxWidth: 130)
                                }
                                if sendsDate {
                                    SalesInlineRow(label: "Date") {
                                        DatePicker("Date", selection: $date, displayedComponents: .date)
                                            .labelsHidden()
                                    }
                                }
                            }
                            if amount > limit {
                                Label("That's more than \(Money.format(limit, currency: currency)).", systemImage: "exclamationmark.circle")
                                    .font(.system(size: 13.5))
                                    .foregroundStyle(DTheme.negative)
                                    .padding(.horizontal, 4)
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .background(DTheme.shell)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    Task { await apply() }
                } label: {
                    if saving { ProgressView().tint(DTheme.inkInverse) } else { Text(amount > 0 ? "Apply \(Money.format(amount, currency: currency))" : "Apply") }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(saving || selected == nil || amount <= 0 || amount > limit)
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 6)
                .background { SalesBottomFade() }
            }
            .task { await load() }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
    }

    @ViewBuilder
    private var documentList: some View {
        if !loaded {
            SkeletonRows(rows: 3, avatar: false)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else if let failed {
            ErrorStateView(message: failed) { await load() }
        } else if documents.isEmpty {
            Text("No open \(noun)s for this contact.")
                .font(.system(size: 15))
                .foregroundStyle(DTheme.inkSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            CardStack {
                ForEach(documents) { document in
                    Button {
                        withAnimation(.snappy) {
                            selected = document
                            amount = min(available, document.amountDue)
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: selected == document ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 19))
                                .foregroundStyle(selected == document ? DTheme.ink : DTheme.inkTertiary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(document.number)
                                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                                    .foregroundStyle(DTheme.ink)
                                Text("Due \(DubblDate.short(document.dueDate))")
                                    .font(.system(size: 13))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                            Spacer()
                            MoneyText(minor: document.amountDue, currency: document.currency, size: 15.5, weight: .semibold)
                                .foregroundStyle(DTheme.ink)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 58)
                        .background(selected == document ? DTheme.tint : .clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func load() async {
        do {
            switch target {
            case .invoice:
                let page: Page<Invoice> = try await env.api.get("invoices", query: ["contactId": contactID, "limit": "100"])
                documents = page.data
                    .filter { ["sent", "partial", "overdue"].contains($0.status) && $0.amountDue > 0 && (contactID == nil || $0.contactId == nil || $0.contactId == contactID) }
                    .map { OpenDocument(id: $0.id, number: $0.invoiceNumber, dueDate: $0.dueDate, amountDue: $0.amountDue, currency: $0.currencyCode) }
            case .bill:
                // The bills route can't filter by contact, so match here.
                let page: Page<Bill> = try await env.api.get("bills", query: ["limit": "100"])
                documents = page.data
                    .filter { ["received", "partial", "overdue"].contains($0.status) && $0.amountDue > 0 && (contactID == nil || $0.contactId == contactID || $0.contact?.id == contactID) }
                    .map { OpenDocument(id: $0.id, number: $0.billNumber, dueDate: $0.dueDate, amountDue: $0.amountDue, currency: $0.currencyCode) }
            }
            failed = nil
            // One candidate: choose it straight away.
            if documents.count == 1, let only = documents.first {
                selected = only
                amount = min(available, only.amountDue)
            }
        } catch {
            failed = error.localizedDescription
        }
        withAnimation(.snappy) { loaded = true }
    }

    private func apply() async {
        guard let selected else { return }
        saving = true
        defer { saving = false }
        var body: [String: JSONValue] = [
            target == .invoice ? "invoiceId" : "billId": .string(selected.id),
            "amount": .number(Double(amount)),
        ]
        if sendsDate { body["date"] = .string(DubblDate.string(date)) }
        do {
            let _: JSONValue = try await env.api.post(path, body: body)
            env.toast.show("Applied \(Money.format(amount, currency: currency)) to \(selected.number)")
            done()
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}
