import SwiftUI

/// One record of any kind: who and how much up top, its lines, every other
/// field in plain words, and the spec's actions in a glass tray.
struct RecordDetailView: View {
    let spec: RecordSpec
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var record: JSONValue?
    @State private var error: String?
    @State private var working: String?
    @State private var confirming: RecordAction?

    private var currency: String { record?["currencyCode"]?.stringValue ?? env.session.currency }
    private var detailPath: String { (spec.detailEndpoint ?? "\(spec.endpoint)/{id}").replacingOccurrences(of: "{id}", with: id) }
    private var status: String? { spec.row.status.flatMap { record?[$0]?.stringValue }.flatMap { $0.isEmpty ? nil : $0 } }

    private var actions: [RecordAction] {
        spec.actions.filter { action in
            guard let statuses = action.statuses else { return true }
            return status.map(statuses.contains) ?? false
        }
    }

    var body: some View {
        ScrollView {
            if let record {
                VStack(alignment: .leading, spacing: 24) {
                    hero(record)
                    ForEach(lineGroups(record), id: \.key) { group in
                        lines(group.key, group.items, record: record)
                    }
                    details(record)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, actions.isEmpty ? 28 : 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle(spec.singular)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Tell me about this \(spec.singular.lowercased()): \(record.map { RecordRowView.title(spec: spec, row: $0) } ?? id).", page: spec.key)
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    ForEach(actions.filter { !$0.primary }) { action in
                        Button(role: action.destructive ? .destructive : nil) { request(action) } label: {
                            Label(action.title, systemImage: action.symbol)
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            let primary = actions.filter(\.primary)
            if record != nil, !primary.isEmpty {
                PurchasesActionBar {
                    ForEach(primary) { action in
                        Button { request(action) } label: {
                            HStack(spacing: 8) {
                                if working == action.id {
                                    ProgressView().controlSize(.small).tint(primary.last?.id == action.id ? DTheme.canvas : DTheme.ink)
                                } else {
                                    Image(systemName: action.symbol)
                                }
                                Text(action.title)
                            }
                        }
                        .buttonStyle(InkButtonStyleChoice(filled: primary.last?.id == action.id))
                        .disabled(working != nil)
                    }
                }
            }
        }
        .confirmationDialog(confirming?.confirm ?? "", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }), titleVisibility: .visible) {
            if let action = confirming {
                Button(action.title, role: action.destructive ? .destructive : nil) { run(action) }
                Button("Cancel", role: .cancel) {}
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Hero

    private func hero(_ record: JSONValue) -> some View {
        let title = RecordRowView.title(spec: spec, row: record)
        let amount = spec.row.amount.flatMap { record[$0]?.intValue }
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let path = spec.row.number, let number = record[path]?.stringValue, !number.isEmpty {
                    Text(number)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                if let status {
                    LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: spec))
                }
            }
            Text(title)
                .font(.system(size: amount == nil ? 28 : 17, weight: amount == nil ? .semibold : .medium))
                .tracking(amount == nil ? -0.6 : 0)
                .foregroundStyle(amount == nil ? DTheme.ink : DTheme.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let amount {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 40, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .tracking(-1.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            let subtitle = spec.row.subtitle.compactMap { path in
                record[path].flatMap { RecordFormat.text($0, key: path, record: record, spec: spec, currency: currency) }
            }
            if !subtitle.isEmpty {
                Text(subtitle.joined(separator: " · "))
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    // MARK: Lines

    /// Arrays of objects become their own sections: lines, items, entries...
    private func lineGroups(_ record: JSONValue) -> [(key: String, items: [JSONValue])] {
        guard case let .object(object) = record else { return [] }
        let preferred = ["lines", "items", "lineItems", "entries", "journalLines", "allocations", "payments", "schedule", "members"]
        return object
            .compactMap { key, value -> (key: String, items: [JSONValue])? in
                guard !RecordFormat.isHidden(key, spec: spec), let items = value.arrayValue, !items.isEmpty, items.allSatisfy({ $0.objectValue != nil }) else { return nil }
                return (key, items)
            }
            .sorted { (preferred.firstIndex(of: $0.key) ?? 99, $0.key) < (preferred.firstIndex(of: $1.key) ?? 99, $1.key) }
    }

    private func lines(_ key: String, _ items: [JSONValue], record: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("\(RecordFormat.label(key)) · \(items.count)")
            CardStack {
                ForEach(Array(items.prefix(50).enumerated()), id: \.offset) { _, item in
                    lineRow(item, record: record)
                }
            }
        }
    }

    private func lineRow(_ item: JSONValue, record: JSONValue) -> some View {
        let title = ["description", "name", "title", "accountName", "account", "item", "employee", "contact", "user", "memo"].lazy
            .compactMap { item[$0].flatMap { RecordFormat.text($0, key: "", record: record, spec: spec, currency: currency) } }
            .first ?? "Line"
        let amountKey = ["amount", "total", "lineTotal", "debit", "credit", "value", "balance", "netPay", "grossPay"].first { item[$0]?.intValue != nil && item[$0]?.intValue != 0 }
        var facts: [String] = []
        if let quantity = item["quantity"]?.intValue, let price = item["unitPrice"]?.intValue {
            // Quantities are stored ×100.
            let qty = Double(quantity) / 100
            facts.append("\(qty.rounded() == qty ? String(Int(qty)) : String(format: "%.2f", qty)) × \(Money.format(price, currency: currency))")
        }
        for key in ["date", "dueDate", "status", "role", "email"] {
            if let value = item[key], let text = RecordFormat.text(value, key: key, record: record, spec: spec, currency: currency) { facts.append(text) }
        }
        if let debit = item["debit"]?.intValue, debit != 0 { facts.append("Debit") } else if let credit = item["credit"]?.intValue, credit != 0 { facts.append("Credit") }
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                if !facts.isEmpty {
                    Text(facts.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let amountKey, let amount = item[amountKey]?.intValue {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: Details

    private func details(_ record: JSONValue) -> some View {
        let shown = Set(spec.row.title + [spec.row.number, spec.row.amount, spec.row.status].compactMap { $0 })
        let lineKeys = Set(lineGroups(record).map(\.key))
        let fields: [(label: String, text: String)] = {
            guard case let .object(object) = record else { return [] }
            return object.keys.sorted(by: fieldOrder).compactMap { key in
                guard !shown.contains(key), !lineKeys.contains(key), !RecordFormat.isHidden(key, spec: spec), let value = object[key],
                      let text = RecordFormat.text(value, key: key, record: record, spec: spec, currency: currency), !text.isEmpty else { return nil }
                return (RecordFormat.label(key), text)
            }
        }()
        return VStack(alignment: .leading, spacing: 8) {
            if !fields.isEmpty {
                SectionLabel("Details")
                CardStack {
                    ForEach(fields, id: \.label) { field in
                        if field.text.count > 34 {
                            // Notes and descriptions read as a paragraph under their label.
                            VStack(alignment: .leading, spacing: 4) {
                                Text(field.label)
                                    .font(.system(size: 13.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                                Text(field.text)
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .textSelection(.enabled)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                        } else {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(field.label)
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.inkSecondary)
                                Spacer(minLength: 12)
                                Text(field.text)
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                    .multilineTextAlignment(.trailing)
                                    .textSelection(.enabled)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 13)
                        }
                    }
                }
            }
        }
    }

    /// Who and when first, notes and timestamps last.
    private func fieldOrder(_ a: String, _ b: String) -> Bool {
        let first = ["contact", "customer", "supplier", "name", "email", "phone", "issueDate", "date", "dueDate", "startDate", "endDate", "validUntil", "reference", "subtotal", "taxTotal", "total", "amountPaid", "amountDue", "currencyCode"]
        let last = ["notes", "description", "createdAt", "sentAt", "paidAt"]
        func rank(_ key: String) -> Int {
            if let index = first.firstIndex(of: key) { return index }
            if let index = last.firstIndex(of: key) { return 1000 + index }
            return 500
        }
        return (rank(a), a) < (rank(b), b)
    }

    // MARK: Loading and actions

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get(detailPath)
            withAnimation(.snappy) {
                record = Self.record(in: response, key: spec.detailKey)
                error = nil
            }
        } catch {
            if record == nil { self.error = error.localizedDescription }
        }
    }

    static func record(in response: JSONValue, key: String?) -> JSONValue {
        if let key, let record = response[key] { return record }
        if response["id"] != nil { return response }
        if case let .object(object) = response, let first = object.values.first(where: { $0.objectValue?["id"] != nil }) { return first }
        return response
    }

    private func request(_ action: RecordAction) {
        if action.confirm != nil { confirming = action } else { run(action) }
    }

    private func run(_ action: RecordAction) {
        working = action.id
        Task {
            defer { working = nil }
            let path = action.path.isEmpty ? detailPath : "\(detailPath)/\(action.path)"
            do {
                switch action.method {
                case .post: _ = try await env.api.post(path, body: action.body ?? [:]) as JSONValue
                case .patch: _ = try await env.api.patch(path, body: action.body ?? [:]) as JSONValue
                case .delete: _ = try await env.api.delete(path) as JSONValue
                }
                env.toast.show("\(action.title) done")
                NotificationCenter.default.post(name: .recordsChanged, object: spec.key)
                if action.popsBack { dismiss() } else { await load() }
            } catch {
                env.toast.error(error)
            }
        }
    }
}

/// The last primary action is filled ink; any before it are soft.
private struct InkButtonStyleChoice: ButtonStyle {
    let filled: Bool

    func makeBody(configuration: Configuration) -> some View {
        if filled {
            InkButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        } else {
            SoftButtonStyle(size: .large, fullWidth: true).makeBody(configuration: configuration)
        }
    }
}
