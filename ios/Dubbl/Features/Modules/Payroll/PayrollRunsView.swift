import SwiftUI

/// Pay runs as a ledger: the pay period, who's in it and net pay, filtered by
/// status. `GET payroll/runs` (paginated, `status=`) with items and employees.
struct PayrollRunsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var runs: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var filter = "all"
    @State private var creating = false

    private static let filters: [(value: String, label: String)] = [
        ("all", "All"), ("draft", "Draft"), ("pending_approval", "Awaiting approval"), ("completed", "Paid"), ("void", "Void"),
    ]

    private var currency: String { env.session.currency }

    private var visible: [JSONValue] {
        filter == "all" ? runs : runs.filter { $0["status"]?.stringValue == filter }
    }

    var body: some View {
        Group {
            if loaded {
                List {
                    let paid = runs.filter { $0["status"]?.stringValue == "completed" }
                    let open = runs.filter { ["draft", "pending_approval"].contains($0["status"]?.stringValue ?? "") }
                    LedgerTotals(items: [
                        .init(label: "To pay", value: Money.short(open.reduce(0) { $0 + ($1["totalNet"]?.intValue ?? 0) }, currency: currency), detail: "\(open.count) open", tint: DTheme.warning) { filter = "draft" },
                        .init(label: "Paid", value: Money.short(paid.reduce(0) { $0 + ($1["totalNet"]?.intValue ?? 0) }, currency: currency), detail: "\(paid.count) \(paid.count == 1 ? "run" : "runs")", tint: DTheme.positive) { filter = "completed" },
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()

                    if visible.isEmpty {
                        Text(runs.isEmpty ? "No pay runs yet. Start one for the current pay period." : "No runs in this state.")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.vertical, 24)
                            .ledgerRow()
                    }
                    ForEach(Array(visible.enumerated()), id: \.offset) { _, run in
                        if let id = run.recordID {
                            NavigationLink(value: RecordRoute(spec: "payroll-runs", id: id)) {
                                PayrollRunRow(run: run, currency: currency)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                            .ledgerRow()
                        }
                    }
                    if !visible.isEmpty {
                        LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "run" : "runs")")
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await load() }
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .frame(maxHeight: .infinity)
            } else {
                ScrollView { SkeletonRows(rows: 8, avatar: false) }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Pay runs")
        .navigationSubtitle(loaded ? "\(visible.count)\(filter == "all" ? "" : " " + (Self.filters.first { $0.value == filter }?.label.lowercased() ?? ""))" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Status", selection: $filter) {
                        ForEach(Self.filters, id: \.value) { Text($0.label).tag($0.value) }
                    }
                } label: {
                    Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityLabel("Filter by status")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("New pay run", systemImage: "plus") { creating = true }
            }
        }
        .sheet(isPresented: $creating) {
            PayrollNewRunSheet { Task { await load() } }
        }
        .task { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if note.object as? String == "payroll-runs" { Task { await load() } }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/runs", query: ["limit": "100"])
            withAnimation(.snappy) {
                runs = response["data"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

/// "1 – 31 Oct 2026 · Regular · 4 people ........ $18,420.00  Paid"
struct PayrollRunRow: View {
    let run: JSONValue
    let currency: String

    var body: some View {
        let status = run["status"]?.stringValue ?? "draft"
        let people = run["items"]?.arrayValue?.count ?? 0
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(PayrollFormat.period(run["payPeriodStart"]?.stringValue, run["payPeriodEnd"]?.stringValue))
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("\(PayrollFormat.runType(run["runType"]?.stringValue)) · \(people) \(people == 1 ? "person" : "people")")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(run["totalNet"]?.intValue ?? 0, currency: currency))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                    .fixedSize()
                LedgerStatus(text: PayrollFormat.runStatus(status), tone: PayrollFormat.runTones[status] ?? .neutral)
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One pay run: totals, a payslip per person, and the approve / process /
/// payslip steps the API allows from its status. `GET payroll/runs/{id}` -> `{ run }`.
struct PayrollRunView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var run: JSONValue?
    @State private var error: String?
    @State private var payslip: JSONValue?

    private var currency: String { env.session.currency }
    private var status: String { run?["status"]?.stringValue ?? "draft" }

    var body: some View {
        ScrollView {
            if let run {
                VStack(alignment: .leading, spacing: 24) {
                    hero(run)
                    breakdown(run)
                    payslips(run)
                    details(run)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, trayActions.isEmpty ? 28 : 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Pay run")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        env.router.askTilly("Check this pay run for anything unusual: \(PayrollFormat.period(run?["payPeriodStart"]?.stringValue, run?["payPeriodEnd"]?.stringValue)).", page: "payroll-runs")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                    if status == "draft" {
                        Button { Task { await post("submit-for-approval", done: "Sent for approval") } } label: { Label("Send for approval", systemImage: "person.badge.clock") }
                        Button(role: .destructive) { Task { await remove(done: "Pay run deleted") } } label: { Label("Delete", systemImage: "trash") }
                    }
                    if status == "completed" {
                        Button(role: .destructive) { Task { await remove(done: "Pay run voided") } } label: { Label("Void", systemImage: "xmark.circle") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if run != nil { PayrollActionTray(actions: trayActions) }
        }
        .sheet(item: Binding(get: { payslip.map(PayrollSlipItem.init) }, set: { payslip = $0?.item })) { slip in
            PayrollPayslipSheet(item: slip.item, run: run ?? .null)
        }
        .task { await load() }
        .refreshable { await load() }
    }

    /// The next step for this run.
    private var trayActions: [PayrollTrayAction] {
        switch status {
        case "draft":
            return [PayrollTrayAction(title: "Process and pay", symbol: "checkmark.circle", confirm: "Pay everyone in this run? This posts the payroll journal.") { await post("process", done: "Pay run processed") }]
        case "pending_approval":
            if run?["approvalStatus"]?.stringValue == "approved" {
                return [PayrollTrayAction(title: "Process and pay", symbol: "checkmark.circle", confirm: "Pay everyone in this run? This posts the payroll journal.") { await post("process", done: "Pay run processed") }]
            }
            return [
                PayrollTrayAction(title: "Reject", symbol: "xmark", destructive: true, confirm: "Send this run back to draft?") { await post("reject", done: "Run sent back") },
                PayrollTrayAction(title: "Approve", symbol: "checkmark") { await post("approve", done: "Run approved") },
            ]
        case "completed":
            return [PayrollTrayAction(title: "Generate payslips", symbol: "doc.text") { await post("generate-payslips", done: "Payslips generated") }]
        default:
            return []
        }
    }

    private func hero(_ run: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(PayrollFormat.runType(run["runType"]?.stringValue))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DTheme.inkTertiary)
                LedgerStatus(text: PayrollFormat.runStatus(status), tone: PayrollFormat.runTones[status] ?? .neutral)
            }
            Text(PayrollFormat.period(run["payPeriodStart"]?.stringValue, run["payPeriodEnd"]?.stringValue))
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(run["totalNet"]?.intValue ?? 0, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("Net pay")
                .font(.system(size: 14))
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private func breakdown(_ run: JSONValue) -> some View {
        let items = run["items"]?.arrayValue ?? []
        let tax = items.reduce(0) { $0 + ($1["taxAmount"]?.intValue ?? 0) }
        let deductions = items.reduce(0) { $0 + ($1["deductions"]?.intValue ?? 0) }
        return CardStack {
            TaxFigureRow(label: "Gross pay", value: Money.format(run["totalGross"]?.intValue ?? 0, currency: currency))
            TaxFigureRow(label: "Tax withheld", value: Money.format(tax, currency: currency))
            TaxFigureRow(label: "Other deductions", value: Money.format(deductions, currency: currency))
            TaxFigureRow(label: "Net pay", value: Money.format(run["totalNet"]?.intValue ?? 0, currency: currency), strong: true)
        }
    }

    private func payslips(_ run: JSONValue) -> some View {
        let items = run["items"]?.arrayValue ?? []
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Payslips · \(items.count)")
            if items.isEmpty {
                Text("Nobody in this run.")
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dubblCard()
            } else {
                CardStack(dividerInset: 62) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        Button { payslip = item } label: {
                            PayrollSlipRow(item: item, currency: currency)
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
            }
        }
    }

    private func details(_ run: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                DetailRow("Pay period starts", DubblDate.display(run["payPeriodStart"]?.stringValue))
                DetailRow("Pay period ends", DubblDate.display(run["payPeriodEnd"]?.stringValue))
                if let approval = run["approvalStatus"]?.stringValue {
                    DetailRow("Approval", RecordFormat.statusLabel(approval))
                }
                if let processed = run["processedAt"]?.stringValue {
                    DetailRow("Processed", DubblDate.display(processed))
                }
                DetailRow("Created", DubblDate.display(run["createdAt"]?.stringValue))
                if let notes = run["notes"]?.stringValue, !notes.isEmpty {
                    DetailRow("Notes", notes)
                }
            }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/runs/\(id)")
            withAnimation(.snappy) {
                run = response["run"] ?? response
                error = nil
            }
        } catch {
            if run == nil { self.error = error.localizedDescription }
        }
    }

    private func post(_ action: String, done: String) async {
        let ok = await PayrollCall.run(env, done: done, spec: "payroll-runs") {
            let _: JSONValue = try await env.api.post("payroll/runs/\(id)/\(action)", body: [String: JSONValue]())
        }
        if ok { await load() }
    }

    private func remove(done: String) async {
        let voiding = status == "completed"
        let ok = await PayrollCall.run(env, done: done, spec: "payroll-runs") {
            let _: JSONValue = try await env.api.delete("payroll/runs/\(id)")
        }
        if ok { if voiding { await load() } else { dismiss() } }
    }
}

/// Wraps a payroll item for `.sheet(item:)`.
private struct PayrollSlipItem: Identifiable {
    let item: JSONValue
    var id: String { item.recordID ?? item["employeeId"]?.stringValue ?? "slip" }
}

private struct PayrollSlipRow: View {
    let item: JSONValue
    let currency: String

    var body: some View {
        let name = item["employee.name"]?.stringValue ?? "Employee"
        // The pay type only when it isn't ordinary salary.
        let parts = [item["type"]?.stringValue].compactMap { $0 }.filter { $0 != "regular_salary" }.map { $0.replacingOccurrences(of: "_", with: " ").humanized }
        HStack(spacing: 12) {
            Avatar(name: name, size: 34)
            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(([Money.format(item["grossAmount"]?.intValue ?? 0, currency: currency) + " gross"] + parts).joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(Money.format(item["netAmount"]?.intValue ?? 0, currency: currency))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DTheme.inkTertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

/// One person's pay in a run, laid out like a payslip.
struct PayrollPayslipSheet: View {
    let item: JSONValue
    let run: JSONValue

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let currency = item["currency"]?.stringValue ?? env.session.currency
        let name = item["employee.name"]?.stringValue ?? "Employee"
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 14) {
                        Avatar(name: name, size: 48)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(name)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(DTheme.ink)
                            Text([item["employee.employeeNumber"]?.stringValue, item["employee.position"]?.stringValue].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13.5))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Take-home pay")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(Money.format(item["netAmount"]?.intValue ?? 0, currency: currency))
                            .font(.system(size: 38, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .tracking(-1.1)
                            .foregroundStyle(DTheme.ink)
                        Text(PayrollFormat.period(run["payPeriodStart"]?.stringValue, run["payPeriodEnd"]?.stringValue))
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Earnings")
                        CardStack {
                            TaxFigureRow(label: (item["type"]?.stringValue ?? "regular_salary").replacingOccurrences(of: "_", with: " ").humanized, value: Money.format((item["grossAmount"]?.intValue ?? 0) - (item["overtimeAmount"]?.intValue ?? 0) - (item["bonusAmount"]?.intValue ?? 0), currency: currency))
                            if let overtime = item["overtimeAmount"]?.intValue, overtime > 0 {
                                TaxFigureRow(label: "Overtime", value: Money.format(overtime, currency: currency), detail: item["overtimeHours"].map { PayrollFormat.hours($0) })
                            }
                            if let bonus = item["bonusAmount"]?.intValue, bonus > 0 {
                                TaxFigureRow(label: "Bonus", value: Money.format(bonus, currency: currency))
                            }
                            TaxFigureRow(label: "Gross pay", value: Money.format(item["grossAmount"]?.intValue ?? 0, currency: currency), strong: true)
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Taxes and deductions")
                        CardStack {
                            TaxFigureRow(label: "Tax withheld", value: "−" + Money.format(item["taxAmount"]?.intValue ?? 0, currency: currency))
                            if let pre = item["preTaxDeductions"]?.intValue, pre > 0 {
                                TaxFigureRow(label: "Before-tax deductions", value: "−" + Money.format(pre, currency: currency))
                            }
                            if let post = item["postTaxDeductions"]?.intValue, post > 0 {
                                TaxFigureRow(label: "After-tax deductions", value: "−" + Money.format(post, currency: currency))
                            } else if let deductions = item["deductions"]?.intValue, deductions > 0, (item["preTaxDeductions"]?.intValue ?? 0) == 0 {
                                TaxFigureRow(label: "Deductions", value: "−" + Money.format(deductions, currency: currency))
                            }
                            TaxFigureRow(label: "Net pay", value: Money.format(item["netAmount"]?.intValue ?? 0, currency: currency), strong: true)
                        }
                    }
                    if let description = item["description"]?.stringValue, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .background(DTheme.shell)
            .navigationTitle("Payslip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

/// Start a regular pay run for a period; the server works out everyone's pay.
/// `POST payroll/runs { payPeriodStart, payPeriodEnd, runType }` -> `{ run }`.
struct PayrollNewRunSheet: View {
    let onSave: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date()
    @State private var end = Date()
    @State private var runType = "regular"
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    TaxSegment(options: [("regular", "Regular"), ("off_cycle", "Off-cycle")], selection: $runType)
                    CardStack {
                        DatePicker("Period starts", selection: $start, displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                        DatePicker("Period ends", selection: $end, in: start..., displayedComponents: .date)
                            .font(.system(size: 15))
                            .padding(.horizontal, 16)
                            .frame(minHeight: 50)
                    }
                    Text("Everyone active in the period is included. Salaries, approved timesheets, deductions and tax are worked out for you; you can review before paying.")
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(.horizontal, 4)
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .background(DTheme.shell)
            .navigationTitle("New pay run")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Create") }
                    }
                    .disabled(saving)
                }
            }
            .onAppear(perform: suggest)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    /// This calendar month.
    private func suggest() {
        let calendar = Calendar(identifier: .gregorian)
        guard let month = calendar.dateInterval(of: .month, for: .now),
              let last = calendar.date(byAdding: .day, value: -1, to: month.end) else { return }
        start = month.start
        end = last
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let body: [String: JSONValue] = [
            "payPeriodStart": .string(DubblDate.string(start)),
            "payPeriodEnd": .string(DubblDate.string(end)),
            "runType": .string(runType),
        ]
        do {
            let _: JSONValue = try await env.api.post("payroll/runs", body: body)
            env.toast.show("Pay run created")
            NotificationCenter.default.post(name: .recordsChanged, object: "payroll-runs")
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
