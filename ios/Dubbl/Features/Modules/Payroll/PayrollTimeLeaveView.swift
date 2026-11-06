import SwiftUI

/// Timesheets and leave requests in one place, switched by a segment, with
/// what's waiting for approval up top. `GET payroll/timesheets` and
/// `GET payroll/leave/requests` (both paginated, `status=`).
struct PayrollTimeLeaveView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var tab = "timesheets"
    @State private var filter = "all"
    @State private var timesheets: [JSONValue] = []
    @State private var requests: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?

    private var filters: [(value: String, label: String, count: Int?)] {
        let rows = tab == "timesheets" ? timesheets : requests
        let values = tab == "timesheets" ? ["draft", "submitted", "approved", "rejected"] : ["pending", "approved", "rejected", "cancelled"]
        return [("all", "All", nil)] + values.map { value in
            (value, RecordFormat.statusLabel(value), rows.filter { $0["status"]?.stringValue == value }.count)
        }
    }

    private var visible: [JSONValue] {
        let rows = tab == "timesheets" ? timesheets : requests
        return filter == "all" ? rows : rows.filter { $0["status"]?.stringValue == filter }
    }

    var body: some View {
        List {
            VStack(spacing: 14) {
                TaxSegment(options: [("timesheets", "Timesheets"), ("leave", "Leave")], selection: $tab)
                LedgerTotals(items: totals)
            }
            .padding(.vertical, 12)
            .ledgerRow()
            .listRowSeparator(.hidden)

            ChipRow(options: filters, selection: $filter)
                .padding(.horizontal, -20)
                .padding(.bottom, 6)
                .ledgerRow()
                .listRowSeparator(.hidden)

            if loaded {
                ForEach(Array(visible.enumerated()), id: \.offset) { _, row in
                    if let id = row.recordID {
                        NavigationLink(value: RecordRoute(spec: tab == "timesheets" ? "payroll-timesheets" : "payroll-leave", id: id)) {
                            if tab == "timesheets" { PayrollTimesheetRow(sheet: row) } else { PayrollLeaveRow(request: row) }
                        }
                        .navigationLinkIndicatorVisibility(.hidden)
                        .ledgerRow()
                    }
                }
                LedgerEndMarker(text: visible.isEmpty ? (tab == "timesheets" ? "No timesheets here" : "No leave requests here") : "\(visible.count) \(tab == "timesheets" ? (visible.count == 1 ? "timesheet" : "timesheets") : (visible.count == 1 ? "request" : "requests"))")
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .ledgerRow()
            } else {
                SkeletonRows(rows: 7)
                    .ledgerRow()
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(DTheme.canvas)
        .navigationTitle("Time and leave")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: tab) { _, _ in filter = "all" }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if ["payroll-timesheets", "payroll-leave"].contains(note.object as? String ?? "") { Task { await load() } }
        }
    }

    private var totals: [LedgerTotals.Item] {
        if tab == "timesheets" {
            let waiting = timesheets.filter { $0["status"]?.stringValue == "submitted" }
            let approved = timesheets.filter { $0["status"]?.stringValue == "approved" }
            return [
                .init(label: "To approve", value: "\(waiting.count)", detail: PayrollFormat.hours(.number(waiting.reduce(0) { $0 + hours($1["totalHours"]) })), tint: DTheme.warning) { filter = "submitted" },
                .init(label: "Approved", value: "\(approved.count)", detail: PayrollFormat.hours(.number(approved.reduce(0) { $0 + hours($1["totalHours"]) })), tint: DTheme.positive) { filter = "approved" },
            ]
        }
        let waiting = requests.filter { $0["status"]?.stringValue == "pending" }
        let approved = requests.filter { $0["status"]?.stringValue == "approved" }
        return [
            .init(label: "To approve", value: "\(waiting.count)", detail: PayrollFormat.hours(.number(waiting.reduce(0) { $0 + hours($1["hours"]) })), tint: DTheme.warning) { filter = "pending" },
            .init(label: "Approved", value: "\(approved.count)", detail: PayrollFormat.hours(.number(approved.reduce(0) { $0 + hours($1["hours"]) })) + " off", tint: DTheme.positive) { filter = "approved" },
        ]
    }

    private func hours(_ value: JSONValue?) -> Double {
        if case let .number(number) = value { return number }
        return 0
    }

    private func load() async {
        do {
            let api = env.api
            async let sheets: JSONValue = api.get("payroll/timesheets", query: ["limit": "100"])
            async let leave: JSONValue = api.get("payroll/leave/requests", query: ["limit": "100"])
            let (s, l) = try await (sheets, leave)
            withAnimation(.snappy) {
                timesheets = s["data"]?.arrayValue ?? []
                requests = l["data"]?.arrayValue ?? []
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}

private struct PayrollTimesheetRow: View {
    let sheet: JSONValue

    var body: some View {
        let status = sheet["status"]?.stringValue ?? "draft"
        let name = sheet["employee.name"]?.stringValue ?? "Employee"
        HStack(spacing: 12) {
            Avatar(name: name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(PayrollFormat.period(sheet["periodStart"]?.stringValue, sheet["periodEnd"]?.stringValue))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(PayrollFormat.hours(sheet["totalHours"]))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

private struct PayrollLeaveRow: View {
    let request: JSONValue

    var body: some View {
        let status = request["status"]?.stringValue ?? "pending"
        let name = request["employee.name"]?.stringValue ?? "Employee"
        HStack(spacing: 12) {
            Avatar(name: name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text([request["policy.name"]?.stringValue, PayrollFormat.period(request["startDate"]?.stringValue, request["endDate"]?.stringValue)].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(PayrollFormat.hours(request["hours"]))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.ink)
                LedgerStatus(text: RecordFormat.statusLabel(status), tone: status == "pending" ? .warning : RecordFormat.tone(status, spec: nil))
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One timesheet: hours by day and submit / approve / reject.
/// `GET payroll/timesheets/{id}` -> `{ timesheet }` with entries.
struct PayrollTimesheetView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @State private var sheet: JSONValue?
    @State private var error: String?

    private var status: String { sheet?["status"]?.stringValue ?? "draft" }

    var body: some View {
        ScrollView {
            if let sheet {
                let entries = (sheet["entries"]?.arrayValue ?? []).sorted { ($0["date"]?.stringValue ?? "") < ($1["date"]?.stringValue ?? "") }
                let name = sheet["employee.name"]?.stringValue ?? "Employee"
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            Avatar(name: name, size: 28)
                            Text(name)
                                .font(.system(size: 17, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                            LedgerStatus(text: RecordFormat.statusLabel(status), tone: RecordFormat.tone(status, spec: nil))
                        }
                        Text(PayrollFormat.hours(sheet["totalHours"]))
                            .font(.system(size: 40, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .tracking(-1.2)
                            .foregroundStyle(DTheme.ink)
                        Text(PayrollFormat.period(sheet["periodStart"]?.stringValue, sheet["periodEnd"]?.stringValue))
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 8)

                    if let reason = sheet["rejectionReason"]?.stringValue, status == "rejected" {
                        Text("Sent back: \(reason)")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .dubblCard()
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Days · \(entries.count)")
                        if entries.isEmpty {
                            Text("No hours logged yet.")
                                .font(.system(size: 14))
                                .foregroundStyle(DTheme.inkSecondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                        } else {
                            CardStack {
                                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                                    let shift = entry["shiftType"]?.stringValue ?? "regular"
                                    TaxFigureRow(
                                        label: DubblDate.parseDay(entry["date"]?.stringValue).map { $0.formatted(.dateTime.weekday(.wide).day().month(.abbreviated)) } ?? "Day",
                                        value: PayrollFormat.hours(entry["hours"]),
                                        detail: [shift == "regular" ? nil : shift.humanized, entry["description"]?.stringValue].compactMap { $0 }.joined(separator: " · ").nilIfEmpty,
                                        tone: shift == "overtime" ? .orange : .neutral
                                    )
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Details")
                        CardStack {
                            if let number = sheet["employee.employeeNumber"]?.stringValue {
                                DetailRow(label: "Employee number") { Text(number).font(.system(size: 15, design: .monospaced)) }
                            }
                            if let submitted = sheet["submittedAt"]?.stringValue { DetailRow("Submitted", DubblDate.display(submitted)) }
                            if let approved = sheet["approvedAt"]?.stringValue { DetailRow("Approved", DubblDate.display(approved)) }
                            DetailRow("Created", DubblDate.display(sheet["createdAt"]?.stringValue))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            } else if let error {
                ErrorStateView(message: error) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8, avatar: false)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Timesheet")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if sheet != nil {
                PayrollActionTray(actions: {
                    switch status {
                    case "draft":
                        return [PayrollTrayAction(title: "Submit", symbol: "paperplane") { await post("submit", done: "Timesheet submitted") }]
                    case "submitted":
                        return [
                            PayrollTrayAction(title: "Reject", symbol: "xmark", destructive: true, confirm: "Send this timesheet back?") { await post("reject", done: "Timesheet sent back") },
                            PayrollTrayAction(title: "Approve", symbol: "checkmark") { await post("approve", done: "Timesheet approved") },
                        ]
                    default:
                        return []
                    }
                }())
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("payroll/timesheets/\(id)")
            withAnimation(.snappy) {
                sheet = response["timesheet"] ?? response
                error = nil
            }
        } catch {
            if sheet == nil { self.error = error.localizedDescription }
        }
    }

    private func post(_ action: String, done: String) async {
        let ok = await PayrollCall.run(env, done: done, spec: "payroll-timesheets") {
            let _: JSONValue = try await env.api.post("payroll/timesheets/\(id)/\(action)", body: [String: JSONValue]())
        }
        if ok { await load() }
    }
}

extension String {
    /// nil when empty, for optional detail lines.
    fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
