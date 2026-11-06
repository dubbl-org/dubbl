import SwiftUI

// Custom reports: pick a source and columns, run it, save it; saved reports
// run again with a tap; schedules email a saved report on a timetable.

extension Notification.Name {
    /// Posted after a saved report or schedule is created, changed or deleted.
    static let reportsSavedChanged = Notification.Name("dubbl.reports.savedChanged")
}

/// The sources `POST reports/run` supports and the columns each one returns.
enum ReportsSource: String, CaseIterable, Identifiable {
    case invoices, contacts, inventory, transactions

    var id: String { rawValue }

    var label: String {
        switch self {
        case .invoices: "Invoices"
        case .contacts: "Contacts"
        case .inventory: "Inventory"
        case .transactions: "Bank transactions"
        }
    }

    var columns: [String] {
        switch self {
        case .invoices: ["invoiceNumber", "contactName", "status", "issueDate", "dueDate", "subtotal", "taxTotal", "total", "amountPaid", "amountDue", "currencyCode"]
        case .contacts: ["name", "email", "type", "phone", "paymentTermsDays", "creditLimit"]
        case .inventory: ["code", "name", "category", "purchasePrice", "salePrice", "quantityOnHand", "reorderPoint", "isActive"]
        case .transactions: ["date", "description", "amount", "status", "payee"]
        }
    }

    var defaultColumns: [String] {
        switch self {
        case .invoices: ["invoiceNumber", "contactName", "status", "dueDate", "amountDue"]
        case .contacts: ["name", "email", "type", "paymentTermsDays"]
        case .inventory: ["name", "code", "quantityOnHand", "salePrice"]
        case .transactions: ["date", "description", "payee", "amount"]
        }
    }

    /// Sources whose rows have a date the run can filter on.
    var hasDates: Bool { self == .invoices || self == .transactions }

    static func label(for column: String) -> String {
        let names = ["invoiceNumber": "Number", "contactName": "Contact", "quantityOnHand": "On hand", "paymentTermsDays": "Payment terms (days)", "isActive": "Active", "taxTotal": "Tax"]
        return names[column] ?? RecordFormat.label(column)
    }
}

// MARK: - Results

/// Rows from a run: the first plain column as the title, the first money
/// column on the right, everything else underneath.
struct ReportsResultsList: View {
    let rows: [JSONValue]
    let columns: [String]

    @Environment(AppEnvironment.self) private var env

    var body: some View {
        let currency = env.session.currency
        let money = columns.first { RecordFormat.isMoney($0, spec: nil) }
        let title = columns.first { $0 != money } ?? columns.first ?? ""
        let rest = columns.filter { $0 != money && $0 != title }
        let total = money.map { key in rows.reduce(0) { $0 + ReportsJSON.int($1[key]) } }
        VStack(alignment: .leading, spacing: 14) {
            if let money, let total {
                ReportsHeadline(label: "\(ReportsSource.label(for: money)) · \(ReportsText.count(rows.count, "row"))", amount: total, currency: currency)
            }
            if rows.isEmpty {
                ReportsEmpty(symbol: "tablecells", title: "No rows", message: "Nothing matched. Try a wider date range.")
            } else {
                ReportsSection(title: ReportsText.count(rows.count, "row"), trailing: rows.count > 200 ? "First 200" : nil) {
                    ForEach(Array(rows.prefix(200).enumerated()), id: \.offset) { _, row in
                        let subtitle = rest.compactMap { key -> String? in
                            guard let value = row[key], let text = RecordFormat.text(value, key: key, record: row, spec: nil, currency: currency) else { return nil }
                            return text
                        }.joined(separator: " · ")
                        ReportsRow(
                            title: row[title].flatMap { RecordFormat.text($0, key: title, record: row, spec: nil, currency: currency) } ?? "–",
                            subtitle: subtitle,
                            amount: money.flatMap { row[$0]?.intValue },
                            currency: row["currencyCode"]?.stringValue ?? currency
                        )
                    }
                }
            }
        }
    }
}

/// `POST reports/run` with a saved-report config -> `{ data, total }`.
enum ReportsRunner {
    static func body(source: String, columns: [String], from: String?, to: String?) -> JSONValue {
        var object: [String: JSONValue] = [
            "dataSource": .string(source),
            "filters": .array([]),
            "groupBy": .array([]),
            "columns": .array(columns.map(JSONValue.string)),
        ]
        if let from, let to { object["dateRange"] = .object(["from": .string(from), "to": .string(to)]) }
        return .object(object)
    }

    static func run(_ api: APIClient, body: JSONValue) async throws -> [JSONValue] {
        let response: JSONValue = try await api.post("reports/run", body: body)
        return ReportsJSON.array(response["data"])
    }
}

// MARK: - Builder

/// The custom report builder: source, columns, optional dates, run, save.
struct ReportsCustomView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var source = ReportsSource.invoices
    @State private var columns: [String] = ReportsSource.invoices.defaultColumns
    @State private var limitDates = false
    @State private var period = ReportsPeriod.thisYear
    @State private var results: [JSONValue]?
    @State private var ranColumns: [String] = []
    @State private var running = false
    @State private var naming = false
    @State private var name = ""

    private var body_: JSONValue {
        ReportsRunner.body(
            source: source.rawValue, columns: columns,
            from: limitDates && source.hasDates ? period.startString : nil, to: limitDates && source.hasDates ? period.endString : nil
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Source")
                    ReportsChoice(options: ReportsSource.allCases.map { ($0, $0.label) }, selection: $source)
                        .padding(.horizontal, -16)
                }
                ReportsSection(title: "Columns", trailing: "\(columns.count) of \(source.columns.count)") {
                    ForEach(source.columns, id: \.self) { column in
                        Button {
                            toggle(column)
                        } label: {
                            HStack {
                                Text(ReportsSource.label(for: column))
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Image(systemName: columns.contains(column) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 18))
                                    .foregroundStyle(columns.contains(column) ? DTheme.ink : DTheme.inkTertiary)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(RowPressStyle())
                    }
                }
                if source.hasDates {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle(isOn: $limitDates.animation(.snappy)) {
                            Text(source == .invoices ? "Only invoices issued in a period" : "Only transactions in a period")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.ink)
                        }
                        .tint(DTheme.positive)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 48)
                        .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        if limitDates {
                            ReportsPeriodBar(period: $period)
                                .padding(.horizontal, -16)
                        }
                    }
                }
                Button {
                    run()
                } label: {
                    HStack(spacing: 8) {
                        if running { ProgressView().tint(DTheme.inkInverse) } else { Image(systemName: "play.fill") }
                        Text("Run report")
                    }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(columns.isEmpty || running)
                if let results {
                    ReportsResultsList(rows: results, columns: ranColumns)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Custom report")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Save report", systemImage: "bookmark") {
                        name = "\(source.label) report"
                        naming = true
                    }
                    .disabled(columns.isEmpty)
                    NavigationLink(value: RecordPageRoute(path: "/reports/saved")) {
                        Label("Saved reports", systemImage: "bookmark.square")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("Report actions")
            }
        }
        .onChange(of: source) { _, newValue in
            columns = newValue.defaultColumns
            results = nil
        }
        .alert("Save report", isPresented: $naming) {
            TextField("Name", text: $name)
            Button("Cancel", role: .cancel) {}
            Button("Save") { save() }
        } message: {
            Text("Saved reports can be run again or emailed on a schedule.")
        }
    }

    private func toggle(_ column: String) {
        if let index = columns.firstIndex(of: column) {
            columns.remove(at: index)
        } else {
            // Keep the source's column order.
            columns = source.columns.filter { columns.contains($0) || $0 == column }
        }
    }

    private func run() {
        running = true
        let request = body_
        let chosen = columns
        Task {
            defer { running = false }
            do {
                let rows = try await ReportsRunner.run(env.api, body: request)
                withAnimation(.snappy) {
                    results = rows
                    ranColumns = chosen
                }
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let config = body_
        Task {
            do {
                let _: JSONValue = try await env.api.post("reports/saved", body: JSONValue.object(["name": .string(trimmed), "config": config]))
                env.toast.show("Report saved", symbol: "bookmark.fill")
                NotificationCenter.default.post(name: .reportsSavedChanged, object: nil)
            } catch {
                env.toast.error(error)
            }
        }
    }
}

// MARK: - Saved reports

/// `GET reports/saved` -> `{ reports: [{ id, name, description, config: { dataSource,
/// columns, dateRange? }, updatedAt }] }`; `DELETE reports/saved/{id}`. Schedules
/// (`GET report-schedules`) show which ones are emailed.
struct ReportsSavedView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var saved = ReportsLoader()
    @State private var schedules = ReportsLoader()
    @State private var deleting: JSONValue?

    private var reports: [JSONValue] { ReportsJSON.array(saved.value?["reports"]).reversed() }

    var body: some View {
        Group {
            if saved.value == nil, let error = saved.error {
                ErrorStateView(message: error) { await load() }
                    .frame(maxHeight: .infinity)
            } else if saved.value == nil {
                ScrollView { SkeletonRows(rows: 6, avatar: false) }
            } else if reports.isEmpty {
                VStack(spacing: 0) {
                    EmptyStateView(symbol: "bookmark", title: "No saved reports", message: "Build a custom report and save it to run it again here.")
                    NavigationLink(value: RecordPageRoute(path: "/reports/custom")) {
                        Text("Build a report")
                    }
                    .buttonStyle(InkButtonStyle(size: .small))
                }
                .frame(maxHeight: .infinity)
            } else {
                List {
                    ForEach(Array(reports.enumerated()), id: \.offset) { _, report in
                        NavigationLink {
                            ReportsSavedRunView(report: report)
                        } label: {
                            row(report)
                        }
                        .ledgerRow()
                        .swipeActions(edge: .trailing) {
                            Button("Delete", systemImage: "trash", role: .destructive) { deleting = report }
                        }
                    }
                    LedgerEndMarker(text: ReportsText.count(reports.count, "saved report"))
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Saved reports")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: RecordPageRoute(path: "/reports/custom")) {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New custom report")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .reportsSavedChanged)) { _ in Task { await load() } }
        .confirmationDialog("Delete \(deleting?["name"]?.stringValue ?? "this report")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
        } message: {
            Text("Its schedules stop too.")
        }
    }

    private func load() async {
        async let reports: Void = saved.load(env.api, "reports/saved")
        async let plans: Void = schedules.load(env.api, "report-schedules", query: ["limit": "200"])
        _ = await (reports, plans)
    }

    private func row(_ report: JSONValue) -> some View {
        let id = report.recordID
        let plans = ReportsJSON.array(schedules.value?["data"]).filter { $0["savedReportId"]?.stringValue == id && $0["isActive"]?.boolValue != false }
        let source = ReportsSource(rawValue: report["config.dataSource"]?.stringValue ?? "")
        let columns = ReportsJSON.array(report["config.columns"]).count
        return HStack(spacing: 12) {
            IconTile(symbol: "tablecells", tone: .neutral, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(report["name"]?.stringValue ?? "Report")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([source?.label ?? "Report", ReportsText.count(columns, "column"), DubblDate.short(report["updatedAt"]?.stringValue)].joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let plan = plans.first {
                LedgerStatus(text: RecordFormat.statusLabel(plan["frequency"]?.stringValue ?? "Scheduled"), tone: .info)
            }
        }
        .padding(.vertical, 12)
    }

    private func delete() {
        guard let id = deleting?.recordID else { return }
        Task {
            do {
                let _: JSONValue = try await env.api.delete("reports/saved/\(id)")
                env.toast.show("Report deleted", symbol: "trash")
                await load()
            } catch {
                env.toast.error(error)
            }
        }
    }
}

/// Runs a saved report and shows its rows; schedule or delete it from the menu.
struct ReportsSavedRunView: View {
    let report: JSONValue

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var rows: [JSONValue]?
    @State private var error: String?
    @State private var scheduling = false
    @State private var confirmingDelete = false

    private var columns: [String] { ReportsJSON.array(report["config.columns"]).compactMap(\.stringValue) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(report["name"]?.stringValue ?? "Report")
                        .displayFont(24)
                        .foregroundStyle(DTheme.ink)
                    Text(summary)
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                .padding(.horizontal, 4)
                if let rows {
                    ReportsResultsList(rows: rows, columns: columns)
                } else if let error {
                    ErrorStateView(message: error) { await run() }
                } else {
                    ReportsSkeleton()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Saved report")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Email on a schedule", systemImage: "clock") { scheduling = true }
                    Button("Delete", systemImage: "trash", role: .destructive) { confirmingDelete = true }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("Report actions")
            }
        }
        .task { await run() }
        .refreshable { await run() }
        .sheet(isPresented: $scheduling) {
            ReportsScheduleSheet(reportId: report.recordID) {}
        }
        .confirmationDialog("Delete this report?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { delete() }
        }
    }

    private var summary: String {
        let source = ReportsSource(rawValue: report["config.dataSource"]?.stringValue ?? "")?.label ?? "Report"
        var parts = [source, ReportsText.count(columns.count, "column")]
        if let from = report["config.dateRange.from"]?.stringValue, let to = report["config.dateRange.to"]?.stringValue {
            parts.append("\(DubblDate.short(from)) – \(DubblDate.display(to))")
        }
        return parts.joined(separator: " · ")
    }

    private func run() async {
        let config = report["config"] ?? .object([:])
        let body = ReportsRunner.body(
            source: config["dataSource"]?.stringValue ?? "invoices", columns: columns,
            from: config["dateRange.from"]?.stringValue, to: config["dateRange.to"]?.stringValue
        )
        do {
            let result = try await ReportsRunner.run(env.api, body: body)
            withAnimation(.snappy) {
                rows = result
                error = nil
            }
        } catch {
            if rows == nil { self.error = error.localizedDescription }
        }
    }

    private func delete() {
        guard let id = report.recordID else { return }
        Task {
            do {
                let _: JSONValue = try await env.api.delete("reports/saved/\(id)")
                env.toast.show("Report deleted", symbol: "trash")
                NotificationCenter.default.post(name: .reportsSavedChanged, object: nil)
                dismiss()
            } catch {
                env.toast.error(error)
            }
        }
    }
}

// MARK: - Schedules

/// `GET report-schedules?limit=200` (paginated) -> `{ data: [{ id, savedReportId,
/// frequency, format, recipients, dayOfWeek, dayOfMonth, timeOfDay, isActive,
/// nextRunAt, lastRunAt, lastRunStatus, savedReport: { name } }] }`;
/// pause/resume is `PATCH report-schedules/{id} { isActive }`, removal `DELETE`.
struct ReportsSchedulesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var loader = ReportsLoader()
    @State private var creating = false

    private var schedules: [JSONValue] { ReportsJSON.array(loader.value?["data"]) }

    private static let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    var body: some View {
        Group {
            if loader.value == nil, let error = loader.error {
                ErrorStateView(message: error) { await load() }
                    .frame(maxHeight: .infinity)
            } else if loader.value == nil {
                ScrollView { SkeletonRows(rows: 5, avatar: false) }
            } else if schedules.isEmpty {
                EmptyStateView(
                    symbol: "clock", title: "No schedules", message: "Email a saved report to your team or accountant every day, week, month or quarter.",
                    actionTitle: "New schedule", action: { creating = true }
                )
                .frame(maxHeight: .infinity)
            } else {
                List {
                    let active = schedules.filter { $0["isActive"]?.boolValue != false }.count
                    LedgerTotals(items: [
                        LedgerTotals.Item(label: "Active", value: "\(active)", detail: "sending", tint: DTheme.positive),
                        LedgerTotals.Item(label: "Paused", value: "\(schedules.count - active)", detail: "not sending", tint: DTheme.inkTertiary),
                    ])
                    .padding(.vertical, 14)
                    .ledgerRow()
                    ForEach(Array(schedules.enumerated()), id: \.offset) { _, schedule in
                        row(schedule)
                            .ledgerRow()
                            .swipeActions(edge: .trailing) {
                                Button("Delete", systemImage: "trash", role: .destructive) { remove(schedule) }
                            }
                            .swipeActions(edge: .leading) {
                                let active = schedule["isActive"]?.boolValue != false
                                Button(active ? "Pause" : "Resume", systemImage: active ? "pause" : "play") { setActive(schedule, !active) }
                                    .tint(active ? DTheme.warning : DTheme.positive)
                            }
                            .contextMenu {
                                let active = schedule["isActive"]?.boolValue != false
                                Button(active ? "Pause" : "Resume", systemImage: active ? "pause" : "play") { setActive(schedule, !active) }
                                Button("Delete", systemImage: "trash", role: .destructive) { remove(schedule) }
                            }
                    }
                    LedgerEndMarker(text: ReportsText.count(schedules.count, "schedule"))
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Schedules")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New schedule", systemImage: "plus") { creating = true }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .reportsSavedChanged)) { _ in Task { await load() } }
        .sheet(isPresented: $creating) {
            ReportsScheduleSheet(reportId: nil) { Task { await load() } }
        }
    }

    private func load() async {
        await loader.load(env.api, "report-schedules", query: ["limit": "200"])
    }

    /// "Weekly on Monday at 08:00"
    static func cadence(_ schedule: JSONValue) -> String {
        let frequency = schedule["frequency"]?.stringValue ?? ""
        let time = schedule["timeOfDay"]?.stringValue ?? "08:00"
        switch frequency {
        case "weekly":
            let day = schedule["dayOfWeek"]?.intValue.flatMap { weekdays.indices.contains($0) ? weekdays[$0] : nil } ?? "Monday"
            return "Weekly on \(day) at \(time)"
        case "monthly": return "Monthly on day \(schedule["dayOfMonth"]?.intValue ?? 1) at \(time)"
        case "quarterly": return "Quarterly on day \(schedule["dayOfMonth"]?.intValue ?? 1) at \(time)"
        default: return "Daily at \(time)"
        }
    }

    private func row(_ schedule: JSONValue) -> some View {
        let active = schedule["isActive"]?.boolValue != false
        let recipients = ReportsJSON.array(schedule["recipients"]).compactMap(\.stringValue)
        let next = schedule["nextRunAt"]?.stringValue
        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(schedule["savedReport.name"]?.stringValue ?? "Saved report")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("\(Self.cadence(schedule)) · \((schedule["format"]?.stringValue ?? "pdf").uppercased())")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
                Text(recipients.count <= 2 ? recipients.joined(separator: ", ") : "\(recipients[0]) +\(recipients.count - 1)")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                LedgerStatus(text: active ? "Active" : "Paused", tone: active ? .positive : .neutral)
                if active, let next {
                    Text("Next \(DubblDate.short(next))")
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                if schedule["lastRunStatus"]?.stringValue == "failed" {
                    LedgerStatus(text: "Last run failed", tone: .negative)
                }
            }
        }
        .padding(.vertical, 13)
        .accessibilityElement(children: .combine)
    }

    private func setActive(_ schedule: JSONValue, _ active: Bool) {
        guard let id = schedule.recordID else { return }
        Task {
            do {
                let _: JSONValue = try await env.api.patch("report-schedules/\(id)", body: ["isActive": active])
                env.toast.show(active ? "Schedule resumed" : "Schedule paused", symbol: active ? "play.fill" : "pause.fill")
                await load()
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func remove(_ schedule: JSONValue) {
        guard let id = schedule.recordID else { return }
        Task {
            do {
                let _: JSONValue = try await env.api.delete("report-schedules/\(id)")
                env.toast.show("Schedule deleted", symbol: "trash")
                await load()
            } catch {
                env.toast.error(error)
            }
        }
    }
}

/// Creates a schedule: `POST report-schedules { savedReportId, frequency, format,
/// recipients, dayOfWeek, dayOfMonth, timeOfDay, timezone }`.
struct ReportsScheduleSheet: View {
    let reportId: String?
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var reports = ReportsLoader()
    @State private var savedReportId = ""
    @State private var frequency = "weekly"
    @State private var dayOfWeek = 1
    @State private var dayOfMonth = 1
    @State private var time = ReportsPeriod.calendar.date(from: DateComponents(hour: 8, minute: 0)) ?? .now
    @State private var format = "pdf"
    @State private var recipients = ""
    @State private var saving = false

    private var list: [JSONValue] { ReportsJSON.array(reports.value?["reports"]) }

    private var emails: [String] {
        recipients.split(whereSeparator: { $0 == "," || $0 == " " || $0 == "\n" })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.contains("@") && $0.contains(".") }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Report") {
                    if list.isEmpty, reports.value != nil {
                        Text("Save a custom report first.").foregroundStyle(DTheme.inkSecondary)
                    } else {
                        Picker("Saved report", selection: $savedReportId) {
                            ForEach(list, id: \.self) { report in
                                Text(report["name"]?.stringValue ?? "Report").tag(report.recordID ?? "")
                            }
                        }
                    }
                }
                Section("When") {
                    Picker("Repeats", selection: $frequency) {
                        Text("Daily").tag("daily")
                        Text("Weekly").tag("weekly")
                        Text("Monthly").tag("monthly")
                        Text("Quarterly").tag("quarterly")
                    }
                    if frequency == "weekly" {
                        Picker("On", selection: $dayOfWeek) {
                            ForEach(0 ..< 7, id: \.self) { Text(ReportsSchedulesView.weekdayName($0)).tag($0) }
                        }
                    } else if frequency != "daily" {
                        Stepper("On day \(dayOfMonth)", value: $dayOfMonth, in: 1 ... 28)
                    }
                    DatePicker("At", selection: $time, displayedComponents: .hourAndMinute)
                }
                Section {
                    Picker("Format", selection: $format) {
                        Text("PDF").tag("pdf")
                        Text("Excel").tag("xlsx")
                        Text("CSV").tag("csv")
                    }
                    TextField("Email addresses", text: $recipients, axis: .vertical)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Send to")
                } footer: {
                    Text("Separate addresses with commas. Times are in \(TimeZone.current.identifier).")
                }
            }
            .navigationTitle("New schedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { save() }
                        .disabled(savedReportId.isEmpty || emails.isEmpty || saving)
                }
            }
            .task {
                if recipients.isEmpty { recipients = env.session.user?.email ?? "" }
                await reports.load(env.api, "reports/saved")
                if savedReportId.isEmpty { savedReportId = reportId ?? list.last?.recordID ?? "" }
            }
        }
    }

    private func save() {
        saving = true
        let parts = ReportsPeriod.calendar.dateComponents([.hour, .minute], from: time)
        var body: [String: JSONValue] = [
            "savedReportId": .string(savedReportId),
            "frequency": .string(frequency),
            "format": .string(format),
            "recipients": .array(emails.map(JSONValue.string)),
            "timeOfDay": .string(String(format: "%02d:%02d", parts.hour ?? 8, parts.minute ?? 0)),
            "timezone": .string(TimeZone.current.identifier),
        ]
        body["dayOfWeek"] = frequency == "weekly" ? .number(Double(dayOfWeek)) : .null
        body["dayOfMonth"] = frequency == "monthly" || frequency == "quarterly" ? .number(Double(dayOfMonth)) : .null
        Task {
            defer { saving = false }
            do {
                let _: JSONValue = try await env.api.post("report-schedules", body: JSONValue.object(body))
                env.toast.show("Schedule created", symbol: "clock.fill")
                NotificationCenter.default.post(name: .reportsSavedChanged, object: nil)
                onCreated()
                dismiss()
            } catch {
                env.toast.error(error)
            }
        }
    }
}

extension ReportsSchedulesView {
    static func weekdayName(_ index: Int) -> String { weekdays.indices.contains(index) ? weekdays[index] : "" }
}
