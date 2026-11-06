import SwiftUI

/// Payroll at a glance: the next pay run, what payroll costs, headcount, the
/// last run's split and shortcuts to the rest. Built from
/// `GET payroll/employees` and `GET payroll/runs` like the web overview.
struct PayrollOverviewView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var employees: [JSONValue] = []
    @State private var runs: [JSONValue] = []
    @State private var waiting = 0
    @State private var loaded = false
    @State private var error: String?
    @State private var creatingRun = false

    private var currency: String { env.session.currency }
    private var active: [JSONValue] { employees.filter { $0["isActive"]?.boolValue ?? true } }

    var body: some View {
        ScrollView {
            TaxLoadState(loaded: loaded, error: error, retry: { await load() }) {
                VStack(alignment: .leading, spacing: 24) {
                    nextRun
                    stats
                    lastRun
                    recent
                    shortcuts
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(DTheme.shell)
        .navigationTitle("Payroll")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { creatingRun = true } label: { Label("New pay run", systemImage: "play.circle") }
                    Button {
                        env.router.askTilly("When's the next pay run, and what will it cost?", page: "payroll")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New")
            }
        }
        .sheet(isPresented: $creatingRun) {
            PayrollNewRunSheet { Task { await load() } }
        }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
            if (note.object as? String ?? "").hasPrefix("payroll") { Task { await load() } }
        }
    }

    // MARK: Next run

    /// A draft or awaiting run is the next one; otherwise the period after the last paid run.
    private var upcoming: (run: JSONValue?, start: String?, end: String?) {
        let open = runs
            .filter { ["draft", "pending_approval"].contains($0["status"]?.stringValue ?? "") }
            .sorted { ($0["payPeriodStart"]?.stringValue ?? "") < ($1["payPeriodStart"]?.stringValue ?? "") }
        if let run = open.first {
            return (run, run["payPeriodStart"]?.stringValue, run["payPeriodEnd"]?.stringValue)
        }
        let last = runs
            .filter { $0["status"]?.stringValue == "completed" }
            .max { ($0["payPeriodEnd"]?.stringValue ?? "") < ($1["payPeriodEnd"]?.stringValue ?? "") }
        guard let end = DubblDate.parseDay(last?["payPeriodEnd"]?.stringValue) else { return (nil, nil, nil) }
        let calendar = Calendar(identifier: .gregorian)
        let frequency = mostCommonFrequency
        guard let start = calendar.date(byAdding: .day, value: 1, to: end) else { return (nil, nil, nil) }
        let next: Date? = switch frequency {
        case "weekly": calendar.date(byAdding: .day, value: 6, to: start)
        case "biweekly": calendar.date(byAdding: .day, value: 13, to: start)
        default: calendar.date(byAdding: .day, value: -1, to: calendar.date(byAdding: .month, value: 1, to: start) ?? start)
        }
        return (nil, DubblDate.string(start), next.map(DubblDate.string))
    }

    private var mostCommonFrequency: String {
        let counts = Dictionary(grouping: active.compactMap { $0["payFrequency"]?.stringValue }, by: { $0 }).mapValues(\.count)
        return counts.max { $0.value < $1.value }?.key ?? "monthly"
    }

    /// One pay for everyone active, from annual salaries.
    private var estimatedGross: Int {
        active.reduce(0) { $0 + ($1["salary"]?.intValue ?? 0) / PayrollFormat.periods($1["payFrequency"]?.stringValue) }
    }

    private var nextRun: some View {
        let next = upcoming
        let status = next.run?["status"]?.stringValue
        let amount = next.run?["totalNet"]?.intValue ?? estimatedGross
        let days = DubblDate.daysFromToday(next.end)
        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Next pay run")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Spacer()
                if let status {
                    LedgerStatus(text: PayrollFormat.runStatus(status), tone: PayrollFormat.runTones[status] ?? .neutral)
                } else if let days {
                    Text(days >= 0 ? "Due in \(days) \(days == 1 ? "day" : "days")" : "Overdue")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(days >= 0 ? DTheme.inkTertiary : DTheme.negative)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(Money.format(amount, currency: currency))
                    .font(.system(size: 38, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .tracking(-1.1)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(next.start == nil
                    ? "Start your first pay run to see it here."
                    : "\(PayrollFormat.period(next.start, next.end)) · \(next.run == nil ? "estimated gross" : "net pay") · \(next.run?["items"]?.arrayValue?.count ?? active.count) people")
                    .font(.system(size: 13.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            if let run = next.run, let id = run.recordID {
                NavigationLink(value: RecordRoute(spec: "payroll-runs", id: id)) {
                    Label(status == "draft" ? "Review and pay" : "Open pay run", systemImage: "arrow.right")
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            } else {
                Button { creatingRun = true } label: { Label("Start pay run", systemImage: "play.fill") }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            }
        }
        .dubblCard()
    }

    // MARK: Figures

    private var stats: some View {
        let year = Calendar.current.component(.year, from: .now)
        let paid = runs.filter { $0["status"]?.stringValue == "completed" }
        let thisYear = paid.filter { ($0["payPeriodEnd"]?.stringValue ?? "").hasPrefix("\(year)") }
        let annual = active.reduce(0) { $0 + ($1["salary"]?.intValue ?? 0) }
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            PayrollStat(label: "Headcount", value: "\(active.count)", detail: employees.count > active.count ? "\(employees.count - active.count) inactive" : "Active employees", symbol: "person.2")
            PayrollStat(label: "Monthly cost", value: Money.short(annual / 12, currency: currency), detail: "\(Money.short(annual, currency: currency)) a year", symbol: "dollarsign.circle")
            PayrollStat(label: "Paid this year", value: Money.short(thisYear.reduce(0) { $0 + ($1["totalNet"]?.intValue ?? 0) }, currency: currency), detail: "\(thisYear.count) \(thisYear.count == 1 ? "run" : "runs")", symbol: "calendar")
            PayrollStat(label: "To approve", value: "\(waiting)", detail: "Timesheets and leave", symbol: "clock")
        }
    }

    @ViewBuilder
    private var lastRun: some View {
        if let run = runs.first(where: { $0["status"]?.stringValue == "completed" }) {
            let gross = run["totalGross"]?.intValue ?? 0
            let net = run["totalNet"]?.intValue ?? 0
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("Last run · \(PayrollFormat.period(run["payPeriodStart"]?.stringValue, run["payPeriodEnd"]?.stringValue))")
                VStack(alignment: .leading, spacing: 12) {
                    GeometryReader { proxy in
                        let share = gross > 0 ? CGFloat(net) / CGFloat(gross) : 0
                        HStack(spacing: 3) {
                            Capsule().fill(DTheme.ink).frame(width: max(6, proxy.size.width * share - 1.5))
                            Capsule().fill(DTheme.orange)
                        }
                    }
                    .frame(height: 10)
                    HStack(spacing: 16) {
                        legend("Take-home", net, DTheme.ink)
                        legend("Tax and deductions", run["totalDeductions"]?.intValue ?? 0, DTheme.orange)
                    }
                    Hairline()
                    HStack {
                        Text("Gross")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                        Spacer()
                        Text(Money.format(gross, currency: currency))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                }
                .dubblCard()
            }
        }
    }

    private func legend(_ label: String, _ amount: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(label)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var recent: some View {
        if !runs.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Recent runs")
                        .font(.system(size: 13.5, weight: .medium))
                        .foregroundStyle(DTheme.inkSecondary)
                    Spacer()
                    NavigationLink(value: RecordPageRoute(path: "/payroll/runs")) {
                        Text("All runs")
                            .font(.system(size: 13.5, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                    }
                }
                .padding(.horizontal, 4)
                CardStack {
                    ForEach(Array(runs.prefix(4).enumerated()), id: \.offset) { _, run in
                        if let id = run.recordID {
                            NavigationLink(value: RecordRoute(spec: "payroll-runs", id: id)) {
                                PayrollRunRow(run: run, currency: currency)
                                    .padding(.horizontal, 16)
                            }
                            .buttonStyle(RowPressStyle())
                        }
                    }
                }
            }
        }
    }

    private var shortcuts: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Go to")
            CardStack(dividerInset: 62) {
                shortcut("Employees", "person.2", "/payroll/employees", detail: "\(active.count) active")
                shortcut("Time and leave", "clock", "/payroll/time-leave", detail: waiting > 0 ? "\(waiting) to approve" : nil)
                shortcut("Tax liabilities", "percent", "/payroll/tax-liabilities", detail: nil)
                shortcut("Reports and forecast", "chart.line.uptrend.xyaxis", "/payroll/analytics", detail: nil)
            }
        }
    }

    private func shortcut(_ title: String, _ symbol: String, _ path: String, detail: String?) -> some View {
        NavigationLink(value: RecordPageRoute(path: path)) {
            HStack(spacing: 12) {
                IconTile(symbol: symbol, size: 34)
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                Spacer()
                if let detail {
                    Text(detail)
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
    }

    private func load() async {
        do {
            let api = env.api
            async let people: JSONValue = api.get("payroll/employees", query: ["limit": "100"])
            async let runList: JSONValue = api.get("payroll/runs", query: ["limit": "50"])
            async let sheets: JSONValue? = try? api.get("payroll/timesheets", query: ["status": "submitted", "limit": "100"])
            async let leave: JSONValue? = try? api.get("payroll/leave/requests", query: ["status": "pending", "limit": "100"])
            let (p, r, s, l) = try await (people, runList, sheets, leave)
            // Demo fixtures ignore the status filter, so count by status here too.
            let pendingSheets = (s?["data"]?.arrayValue ?? []).filter { $0["status"]?.stringValue == "submitted" }.count
            let pendingLeave = (l?["data"]?.arrayValue ?? []).filter { $0["status"]?.stringValue == "pending" }.count
            withAnimation(.snappy) {
                employees = p["data"]?.arrayValue ?? []
                runs = r["data"]?.arrayValue ?? []
                waiting = pendingSheets + pendingLeave
                loaded = true
                error = nil
            }
        } catch {
            if !loaded { self.error = error.localizedDescription }
        }
    }
}
