import SwiftUI

/// One tax period: its window and state, the figures as filed (or a live
/// preview while it's open), and filing, settling up and deleting.
/// `GET tax-periods/{id}` -> `{ taxPeriod }` with `lines`; `POST tax-periods/{id}/file`.
struct TaxPeriodDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var period: JSONValue?
    @State private var preview: JSONValue?
    @State private var error: String?
    @State private var working = false
    @State private var askingReference = false
    @State private var reference = ""
    @State private var confirmingDelete = false

    private var currency: String { env.session.currency }
    private var status: String { period?["status"]?.stringValue ?? "open" }
    private var range: TaxDateRange? { period.flatMap(TaxDateRange.init(period:)) }

    var body: some View {
        ScrollView {
            if let period {
                VStack(alignment: .leading, spacing: 24) {
                    hero(period)
                    figures(period)
                    details(period)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, status == "open" ? 110 : 28)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 7, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Tax period")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Is \(period?["name"]?.stringValue ?? "this tax period") ready to file? Anything to check first?", page: "tax-periods")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    NavigationLink(value: RecordPageRoute(path: "/tax/vat-return")) {
                        Label("VAT return", systemImage: "doc.text.magnifyingglass")
                    }
                    if status == "open" {
                        Button(role: .destructive) { confirmingDelete = true } label: { Label("Delete", systemImage: "trash") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if period != nil, status == "open" {
                PayrollActionTray(actions: [
                    PayrollTrayAction(title: working ? "Filing…" : "Mark as filed", symbol: "checkmark.seal") {
                        reference = ""
                        askingReference = true
                    },
                ])
                .disabled(working)
            }
        }
        .alert("Mark as filed", isPresented: $askingReference) {
            TextField("Reference (optional)", text: $reference)
            Button("Cancel", role: .cancel) {}
            Button("File") { Task { await file() } }
        } message: {
            Text("Locks this period and freezes its figures. Posts the entry that clears output and input tax.")
        }
        .confirmationDialog("Delete this tax period?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ period: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                Text((period["type"]?.stringValue ?? "").humanized)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            Text(period["name"]?.stringValue ?? "Tax period")
                .font(.system(size: 28, weight: .semibold))
                .tracking(-0.6)
                .foregroundStyle(DTheme.ink)
            if let range {
                Text(range.span)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    @ViewBuilder
    private func figures(_ period: JSONValue) -> some View {
        let lines = (period["lines"]?.arrayValue ?? []).sorted { ($0["sortOrder"]?.intValue ?? 0) < ($1["sortOrder"]?.intValue ?? 0) }
        let rows: [(number: String, label: String, amount: Int)] = !lines.isEmpty
            ? lines.map { ($0["boxNumber"]?.stringValue ?? "", $0["label"]?.stringValue ?? "", $0["amount"]?.intValue ?? 0) }
            : (preview?["boxes"]?.arrayValue ?? []).map { ($0["box"]?.stringValue ?? "", $0["label"]?.stringValue ?? "", $0["amount"]?.intValue ?? 0) }
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(lines.isEmpty ? "VAT so far" : "As filed")
                CardStack {
                    ForEach(rows, id: \.number) { row in
                        TaxBoxRow(number: row.number, label: row.label, amount: row.amount, currency: currency, emphasized: ["3", "5"].contains(row.number))
                    }
                }
                if lines.isEmpty {
                    Text("Live figures. They're frozen when you file.")
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkTertiary)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    private func details(_ period: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                DetailRow("Starts", DubblDate.display(period["startDate"]?.stringValue))
                DetailRow("Ends", DubblDate.display(period["endDate"]?.stringValue))
                if let filed = period["filedAt"]?.stringValue {
                    DetailRow("Filed", DubblDate.display(filed))
                }
                if let ref = period["filedReference"]?.stringValue, !ref.isEmpty {
                    DetailRow(label: "Reference") {
                        Text(ref).font(.system(size: 15, design: .monospaced))
                    }
                }
                if let notes = period["notes"]?.stringValue, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notes")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(notes)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("tax-periods/\(id)")
            let found = response["taxPeriod"] ?? response
            withAnimation(.snappy) {
                period = found
                error = nil
            }
            if (found["lines"]?.arrayValue ?? []).isEmpty, let range = TaxDateRange(period: found) {
                preview = try? await env.api.get("reports/vat-return", query: range.query)
            }
        } catch {
            if period == nil { self.error = error.localizedDescription }
        }
    }

    private func file() async {
        working = true
        defer { working = false }
        var body: [String: JSONValue] = ["mode": .string("file")]
        let trimmed = reference.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty { body["filedReference"] = .string(trimmed) }
        do {
            let _: JSONValue = try await env.api.post("tax-periods/\(id)/file", body: body)
            env.toast.show("Period filed")
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-periods")
            await load()
        } catch {
            env.toast.error(error)
        }
    }

    private func delete() async {
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.delete("tax-periods/\(id)")
            env.toast.show("Tax period deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-periods")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

/// Add a tax period: monthly, quarterly or annual, with its dates filled in.
struct TaxPeriodSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var type = "quarterly"
    @State private var name = ""
    @State private var start = Date()
    @State private var end = Date()
    @State private var notes = ""
    @State private var saving = false
    @State private var error: String?
    /// Stops the name following the dates once it's been typed over.
    @State private var nameEdited = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    TaxSegment(options: [("monthly", "Monthly"), ("quarterly", "Quarterly"), ("annual", "Annual")], selection: $type)
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("Q4 2026", text: Binding(get: { name }, set: { name = $0; nameEdited = true }))
                        }
                        DatePicker("Starts", selection: $start, displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        DatePicker("Ends", selection: $end, in: start..., displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        FieldRow(label: "Notes") {
                            TextField("Optional", text: $notes, axis: .vertical)
                        }
                    }
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("New tax period")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Add") }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                }
            }
            .onAppear { suggest() }
            .onChange(of: type) { _, _ in suggest() }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    /// The current month, quarter or year, named the usual way.
    private func suggest() {
        let calendar = Calendar(identifier: .gregorian)
        let today = Date()
        let year = calendar.component(.year, from: today)
        let month = calendar.component(.month, from: today)
        let (first, length, label): (Int, Int, String) = switch type {
        case "monthly": (month, 1, today.formatted(.dateTime.month(.wide).year()))
        case "annual": (1, 12, "FY \(year)")
        default: (((month - 1) / 3) * 3 + 1, 3, "Q\((month - 1) / 3 + 1) \(year)")
        }
        guard let from = calendar.date(from: DateComponents(year: year, month: first, day: 1)),
              let next = calendar.date(byAdding: .month, value: length, to: from),
              let to = calendar.date(byAdding: .day, value: -1, to: next) else { return }
        start = from
        end = to
        if !nameEdited { name = label }
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        var body: [String: JSONValue] = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "type": .string(type),
            "startDate": .string(DubblDate.string(start)),
            "endDate": .string(DubblDate.string(end)),
        ]
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { body["notes"] = .string(trimmed) }
        do {
            let _: JSONValue = try await env.api.post("tax-periods", body: body)
            env.toast.show("Tax period added")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
