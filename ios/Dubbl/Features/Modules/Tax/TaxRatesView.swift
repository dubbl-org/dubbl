import SwiftUI

/// Every tax rate as a ledger: name and what it applies to, the rate on the right.
/// `GET tax-rates` -> `{ taxRates }` (seeds the country's rates on first read).
struct TaxRatesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rates: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var creating = false
    @State private var search = ""

    private var visible: [JSONValue] {
        let term = search.trimmingCharacters(in: .whitespaces)
        let sorted = rates.sorted {
            let a = ($0["isDefault"]?.boolValue == true ? 0 : 1, $0["name"]?.stringValue ?? "")
            let b = ($1["isDefault"]?.boolValue == true ? 0 : 1, $1["name"]?.stringValue ?? "")
            return a < b
        }
        guard !term.isEmpty else { return sorted }
        return sorted.filter { ($0["name"]?.stringValue ?? "").localizedCaseInsensitiveContains(term) }
    }

    var body: some View {
        Group {
            if loaded, !rates.isEmpty {
                List {
                    ForEach(Array(visible.enumerated()), id: \.offset) { _, rate in
                        if let id = rate.recordID {
                            NavigationLink(value: RecordRoute(spec: "tax-rates", id: id)) {
                                TaxRateRow(rate: rate)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                            .ledgerRow()
                        }
                    }
                    LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "rate" : "rates")")
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await load() }
            } else if loaded {
                EmptyStateView(symbol: "percent", title: "No tax rates yet", message: "Add the rates you charge and pay so invoices and bills work out tax.", actionTitle: "New tax rate") { creating = true }
                    .frame(maxHeight: .infinity)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 8, avatar: false) }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Tax rates")
        .navigationSubtitle(loaded ? "\(rates.count)" : "")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search tax rates")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New tax rate", systemImage: "plus") { creating = true }
            }
        }
        .sheet(isPresented: $creating) {
            TaxRateSheet(rate: nil) { Task { await load() } }
        }
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == "tax-rates" { Task { await load() } }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("tax-rates")
            withAnimation(.snappy) {
                rates = response["taxRates"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

private struct TaxRateRow: View {
    let rate: JSONValue

    var body: some View {
        let active = rate["isActive"]?.boolValue ?? true
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(rate["name"]?.stringValue ?? "Tax rate")
                        .font(.system(size: 16, weight: .semibold))
                        .tracking(-0.2)
                        .foregroundStyle(active ? DTheme.ink : DTheme.inkTertiary)
                        .lineLimit(1)
                    if rate["isDefault"]?.boolValue == true {
                        StatusPill(text: "Default")
                    }
                }
                Text([TaxFormat.appliesTo(rate["type"]?.stringValue), TaxFormat.kind(rate["kind"]?.stringValue)].joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(TaxFormat.percent(rate["rate"]?.intValue ?? 0))
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(active ? DTheme.ink : DTheme.inkTertiary)
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One tax rate: the rate large, how it behaves, its components, and edit,
/// make default and delete. `GET/PATCH/DELETE tax-rates/{id}` -> `{ taxRate }`.
struct TaxRateDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var rate: JSONValue?
    @State private var error: String?
    @State private var editing = false
    @State private var confirmingDelete = false
    @State private var working = false

    var body: some View {
        ScrollView {
            if let rate {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            if rate["isDefault"]?.boolValue == true { LedgerStatus(text: "Default", tone: .info) }
                            if rate["isActive"]?.boolValue == false { LedgerStatus(text: "Inactive", tone: .neutral) }
                        }
                        Text(rate["name"]?.stringValue ?? "Tax rate")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(TaxFormat.percent(rate["rate"]?.intValue ?? 0))
                            .font(.system(size: 44, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .tracking(-1.2)
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Details")
                        CardStack {
                            DetailRow("Applies to", TaxFormat.appliesTo(rate["type"]?.stringValue))
                            DetailRow("Kind", TaxFormat.kind(rate["kind"]?.stringValue))
                            DetailRow("Recoverable", TaxFormat.percent((rate["recoverablePercent"]?.intValue ?? 10000)))
                            if let created = rate["createdAt"]?.stringValue {
                                DetailRow("Created", DubblDate.display(created))
                            }
                        }
                    }

                    if let components = rate["components"]?.arrayValue, !components.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionLabel("Components · \(components.count)")
                            CardStack {
                                ForEach(Array(components.enumerated()), id: \.offset) { _, component in
                                    DetailRow(component["name"]?.stringValue ?? "Component", TaxFormat.percent(component["rate"]?.intValue ?? 0))
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 6, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Tax rate")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if rate?["isDefault"]?.boolValue != true {
                        Button { Task { await makeDefault() } } label: { Label("Make default", systemImage: "star") }
                    }
                    Button(role: .destructive) { confirmingDelete = true } label: { Label("Delete", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if rate != nil {
                PayrollActionTray(actions: [PayrollTrayAction(title: "Edit", symbol: "pencil") { editing = true }])
                    .disabled(working)
            }
        }
        .sheet(isPresented: $editing) {
            TaxRateSheet(rate: rate) { Task { await load() } }
        }
        .confirmationDialog("Delete this tax rate?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Documents that already use it keep their tax.")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("tax-rates/\(id)")
            withAnimation(.snappy) {
                rate = response["taxRate"] ?? response
                error = nil
            }
        } catch {
            if rate == nil { self.error = error.localizedDescription }
        }
    }

    private func makeDefault() async {
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.patch("tax-rates/\(id)", body: ["isDefault": JSONValue.bool(true)])
            env.toast.show("Default tax rate set")
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-rates")
            await load()
        } catch {
            env.toast.error(error)
        }
    }

    private func delete() async {
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.delete("tax-rates/\(id)")
            env.toast.show("Tax rate deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-rates")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

/// Add or edit a tax rate: name, percentage, what it applies to and its kind.
struct TaxRateSheet: View {
    /// The rate being edited; nil creates one.
    let rate: JSONValue?
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var percent = ""
    @State private var type = "both"
    @State private var kind = "standard"
    @State private var recoverable = "100"
    @State private var isDefault = false
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focused: Bool

    private var basisPoints: Int? {
        Double(percent.replacingOccurrences(of: ",", with: ".")).map { Int(($0 * 100).rounded()) }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && (basisPoints ?? -1) >= 0 && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("e.g. Standard VAT", text: $name)
                                .focused($focused)
                        }
                        FieldRow(label: "Rate") {
                            HStack(spacing: 4) {
                                TextField("20", text: $percent)
                                    .keyboardType(.decimalPad)
                                    .font(DFont.figure(16, weight: .regular))
                                Text("%").foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Applies to")
                        TaxSegment(options: [("sales", "Sales"), ("purchase", "Purchases"), ("both", "Both")], selection: $type)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Behaviour")
                        CardStack {
                            HStack {
                                Text("Kind")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Picker("Kind", selection: $kind) {
                                    ForEach(TaxFormat.kinds, id: \.value) { option in
                                        Text(option.label).tag(option.value)
                                    }
                                }
                                .labelsHidden()
                                .tint(DTheme.inkSecondary)
                            }
                            .padding(.leading, 16)
                            .padding(.trailing, 6)
                            .frame(minHeight: 50)
                            if kind == "partial_block" {
                                FieldRow(label: "Recoverable share") {
                                    HStack(spacing: 4) {
                                        TextField("50", text: $recoverable)
                                            .keyboardType(.decimalPad)
                                            .font(DFont.figure(16, weight: .regular))
                                        Text("%").foregroundStyle(DTheme.inkSecondary)
                                    }
                                }
                            }
                            Toggle(isOn: $isDefault) {
                                Text("Default rate")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                            }
                            .tint(DTheme.positive)
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
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
            .navigationTitle(rate == nil ? "New tax rate" : "Edit tax rate")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text(rate == nil ? "Add" : "Save") }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear(perform: fill)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func fill() {
        guard let rate else {
            focused = true
            return
        }
        name = rate["name"]?.stringValue ?? ""
        percent = (Double(rate["rate"]?.intValue ?? 0) / 100).formatted(.number.precision(.fractionLength(0 ... 2)).grouping(.never))
        type = rate["type"]?.stringValue ?? "both"
        kind = rate["kind"]?.stringValue ?? "standard"
        recoverable = (Double(rate["recoverablePercent"]?.intValue ?? 10000) / 100).formatted(.number.precision(.fractionLength(0 ... 2)).grouping(.never))
        isDefault = rate["isDefault"]?.boolValue ?? false
    }

    private func save() async {
        guard let basisPoints else { return }
        saving = true
        error = nil
        defer { saving = false }
        let share: Int = {
            switch kind {
            case "blocked": return 0
            case "partial_block": return min(10000, max(0, Int(((Double(recoverable) ?? 100) * 100).rounded())))
            default: return 10000
            }
        }()
        let body: [String: JSONValue] = [
            "name": .string(name.trimmingCharacters(in: .whitespaces)),
            "rate": .number(Double(basisPoints)),
            "type": .string(type),
            "kind": .string(kind),
            "recoverablePercent": .number(Double(share)),
            "isDefault": .bool(isDefault),
        ]
        do {
            if let id = rate?.recordID {
                let _: JSONValue = try await env.api.patch("tax-rates/\(id)", body: body)
                env.toast.show("Tax rate saved")
            } else {
                let _: JSONValue = try await env.api.post("tax-rates", body: body)
                env.toast.show("Tax rate added")
            }
            NotificationCenter.default.post(name: .recordsChanged, object: "tax-rates")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
