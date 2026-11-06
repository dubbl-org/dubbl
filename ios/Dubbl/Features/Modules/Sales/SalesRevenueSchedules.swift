import SwiftUI

// Revenue schedules spread an invoice's income over months. The route answers
// schedules with their periods but no invoice details, so the list joins them
// with the invoices list for a number and a customer.

enum SalesRevenue {
    static let methods: [String: String] = [
        "straight_line": "Evenly over time", "milestone": "By milestone", "on_completion": "When finished",
    ]

    static let statuses: [String: String] = ["active": "In progress", "completed": "Finished", "cancelled": "Cancelled"]

    static func entries(_ schedule: JSONValue) -> [JSONValue] {
        (schedule["entries"]?.arrayValue ?? []).sorted {
            ($0["periodDate"]?.stringValue ?? "", $0["sortOrder"]?.intValue ?? 0) < ($1["periodDate"]?.stringValue ?? "", $1["sortOrder"]?.intValue ?? 0)
        }
    }

    /// Periods whose month has come but aren't counted yet.
    static func behind(_ schedule: JSONValue) -> Int {
        guard schedule["status"]?.stringValue == "active" else { return 0 }
        return entries(schedule).filter { $0["recognized"]?.boolValue != true && (DubblDate.daysFromToday($0["periodDate"]?.stringValue) ?? 1) <= 0 }.count
    }

    static func progress(_ schedule: JSONValue) -> Double {
        let total = schedule["totalAmount"]?.intValue ?? 0
        guard total > 0 else { return 0 }
        return min(1, Double(schedule["recognizedAmount"]?.intValue ?? 0) / Double(total))
    }

    /// "Oct 2026"
    static func month(_ day: String?) -> String {
        DubblDate.parseDay(day).map { $0.formatted(.dateTime.month(.abbreviated).year()) } ?? (day ?? "")
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "active": .info
        case "completed": .positive
        default: .neutral
        }
    }
}

/// A slim progress bar in the positive tone.
struct SalesProgressBar: View {
    let value: Double
    var height: CGFloat = 4

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DTheme.tint)
                Capsule().fill(DTheme.positive).frame(width: max(value > 0 ? height : 0, proxy.size.width * value))
            }
        }
        .frame(height: height)
        .animation(.snappy, value: value)
    }
}

/// Invoice number and customer for a schedule, from the invoices list.
struct SalesInvoiceLabel: Hashable {
    let number: String
    let customer: String?
}

/// Every schedule with how much has been counted so far.
struct SalesRevenueSchedulesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var schedules: [JSONValue] = []
    @State private var invoices: [String: SalesInvoiceLabel] = [:]
    @State private var loaded = false
    @State private var failed: String?
    @State private var filter = "all"
    @State private var shown = false

    private var visible: [JSONValue] {
        schedules.filter { filter == "all" || $0["status"]?.stringValue == filter }
    }

    private func sum(_ field: String) -> Int {
        schedules.filter { $0["status"]?.stringValue != "cancelled" }.reduce(0) { $0 + ($1[field]?.intValue ?? 0) }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("Revenue schedules")
            .navigationSubtitle(loaded ? "\(visible.count)" : "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Status", selection: $filter) {
                            Text("All").tag("all")
                            ForEach(["active", "completed", "cancelled"], id: \.self) { status in
                                Text(SalesRevenue.statuses[status] ?? status).tag(status)
                            }
                        }
                        Divider()
                        Button("Ask Tilly", systemImage: "sparkle") {
                            env.router.askTilly("Which revenue schedules are behind, and what should I count this month?", page: "revenue-schedules")
                        }
                    } label: {
                        Image(systemName: filter == "all" ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter by status")
                }
            }
            .task {
                await load()
                shown = true
            }
            .onReceive(NotificationCenter.default.publisher(for: .recordsChanged)) { note in
                if note.object as? String == "revenue-schedules" { Task { await load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if schedules.isEmpty {
            Group {
                if let failed {
                    ErrorStateView(message: failed) { await load() }
                } else if loaded {
                    EmptyStateView(
                        symbol: "calendar.badge.clock",
                        title: "No revenue schedules yet",
                        message: "Spread an upfront invoice over the months you earn it. Set one up from an invoice on the web."
                    )
                } else {
                    ScrollView { SkeletonRows(rows: 7) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                LedgerTotals(items: [
                    .init(label: "Scheduled", value: Money.short(sum("totalAmount"), currency: env.session.currency), detail: "\(schedules.count) schedules", tint: DTheme.info),
                    .init(label: "Counted", value: Money.short(sum("recognizedAmount"), currency: env.session.currency), detail: "as income", tint: DTheme.positive),
                    .init(label: "Still to count", value: Money.short(sum("totalAmount") - sum("recognizedAmount"), currency: env.session.currency), detail: behindText),
                ])
                .padding(.vertical, 14)
                .ledgerRow()

                ForEach(Array(visible.enumerated()), id: \.offset) { index, schedule in
                    Group {
                        if let id = schedule.recordID {
                            NavigationLink(value: RecordRoute(spec: "revenue-schedules", id: id)) {
                                row(schedule)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                        } else {
                            row(schedule)
                        }
                    }
                    .ledgerRow()
                    .reveal(shown, min(index, 8))
                }
                LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "schedule" : "schedules")")
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .refreshable { await load() }
        }
    }

    private var behindText: String {
        let behind = schedules.reduce(0) { $0 + SalesRevenue.behind($1) }
        return behind == 0 ? "up to date" : "\(behind) \(behind == 1 ? "period" : "periods") behind"
    }

    private func row(_ schedule: JSONValue) -> some View {
        let status = schedule["status"]?.stringValue ?? "active"
        let invoice = schedule["invoiceId"]?.stringValue.flatMap { invoices[$0] }
        let behind = SalesRevenue.behind(schedule)
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(invoice?.customer ?? SalesRevenue.methods[schedule["method"]?.stringValue ?? ""] ?? "Schedule")
                        .font(.system(size: 16, weight: .semibold))
                        .tracking(-0.2)
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if let number = invoice?.number {
                            Text(number)
                                .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                        Text("\(SalesRevenue.month(schedule["startDate"]?.stringValue)) – \(SalesRevenue.month(schedule["endDate"]?.stringValue))")
                            .font(.system(size: 13))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .trailing, spacing: 6) {
                    Text(Money.format(schedule["totalAmount"]?.intValue ?? 0, currency: env.session.currency))
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                    if behind > 0 {
                        LedgerStatus(text: "\(behind) behind", tone: .warning)
                    } else {
                        LedgerStatus(text: SalesRevenue.statuses[status] ?? status.humanized, tone: SalesRevenue.tone(status))
                    }
                }
            }
            HStack(spacing: 10) {
                SalesProgressBar(value: SalesRevenue.progress(schedule))
                Text("\(Int((SalesRevenue.progress(schedule) * 100).rounded()))%")
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(DTheme.inkTertiary)
                    .frame(width: 36, alignment: .trailing)
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        async let invoicePage: Page<Invoice>? = try? env.api.get("invoices", query: ["limit": "200"])
        do {
            let response: JSONValue = try await env.api.get("revenue-schedules", query: ["limit": "100"])
            let rows = RecordListStore.rows(in: response, key: nil)
            let labels = await invoicePage?.data.reduce(into: [String: SalesInvoiceLabel]()) { map, invoice in
                map[invoice.id] = SalesInvoiceLabel(number: invoice.invoiceNumber, customer: invoice.contact?.name)
            }
            withAnimation(.snappy) {
                schedules = rows
                if let labels { invoices = labels }
                failed = nil
                loaded = true
            }
        } catch {
            guard !(error is CancellationError) else { return }
            failed = error.localizedDescription
            loaded = true
        }
    }
}

// MARK: - Detail

/// One schedule: progress, every period and a button to count the next one.
struct SalesRevenueScheduleDetail: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var schedule: JSONValue?
    @State private var invoice: Invoice?
    @State private var failed: String?
    @State private var working = false
    @State private var confirmingCancel = false

    private var currency: String { invoice?.currencyCode ?? env.session.currency }
    private var status: String { schedule?["status"]?.stringValue ?? "active" }
    private var entries: [JSONValue] { schedule.map(SalesRevenue.entries) ?? [] }
    private var next: JSONValue? { status == "active" ? entries.first { $0["recognized"]?.boolValue != true } : nil }

    var body: some View {
        ScrollView {
            if let schedule {
                VStack(alignment: .leading, spacing: 24) {
                    hero(schedule)
                    periods
                    details(schedule)
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, next == nil ? 28 : 110)
            } else if let failed {
                ErrorStateView(message: failed) { await load() }
                    .padding(.top, 80)
            } else {
                SkeletonRows(rows: 8)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Revenue schedule")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Ask Tilly", systemImage: "sparkle") {
                        env.router.askTilly("Explain this revenue schedule for \(invoice?.invoiceNumber ?? "an invoice") and what's left to count.", page: "revenue-schedules")
                    }
                    if status == "active", entries.contains(where: { $0["recognized"]?.boolValue != true }) {
                        Button("Cancel schedule", systemImage: "xmark.circle", role: .destructive) { confirmingCancel = true }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let next {
                PurchasesActionBar {
                    Button {
                        Task { await recognize() }
                    } label: {
                        HStack(spacing: 8) {
                            if working { ProgressView().controlSize(.small).tint(DTheme.canvas) } else { Image(systemName: "checkmark") }
                            Text("Count \(SalesRevenue.month(next["periodDate"]?.stringValue)) · \(Money.format(next["amount"]?.intValue ?? 0, currency: currency))")
                        }
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(working)
                }
            }
        }
        .confirmationDialog("Stop counting income from this schedule? Periods already counted stay.", isPresented: $confirmingCancel, titleVisibility: .visible) {
            Button("Cancel schedule", role: .destructive) { Task { await cancel() } }
            Button("Keep it", role: .cancel) {}
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func hero(_ schedule: JSONValue) -> some View {
        let total = schedule["totalAmount"]?.intValue ?? 0
        let counted = schedule["recognizedAmount"]?.intValue ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let number = invoice?.invoiceNumber {
                    Text(number)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                }
                LedgerStatus(text: SalesRevenue.statuses[status] ?? status.humanized, tone: SalesRevenue.tone(status))
            }
            Text(invoice?.contact?.name ?? "Revenue schedule")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(total, currency: currency))
                .font(.system(size: 40, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.2)
                .foregroundStyle(DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            SalesProgressBar(value: SalesRevenue.progress(schedule), height: 6)
                .padding(.top, 2)
            Text("\(Money.format(counted, currency: currency)) counted · \(Money.format(max(0, total - counted), currency: currency)) to go")
                .font(.system(size: 14))
                .monospacedDigit()
                .foregroundStyle(DTheme.inkSecondary)
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }

    private var periods: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Periods · \(entries.count)")
            CardStack {
                ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                    let done = entry["recognized"]?.boolValue == true
                    let late = !done && status == "active" && (DubblDate.daysFromToday(entry["periodDate"]?.stringValue) ?? 1) <= 0
                    HStack(spacing: 12) {
                        Image(systemName: done ? "checkmark.circle.fill" : late ? "exclamationmark.circle" : "circle")
                            .font(.system(size: 17))
                            .foregroundStyle(done ? DTheme.positive : late ? DTheme.warning : DTheme.inkTertiary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(SalesRevenue.month(entry["periodDate"]?.stringValue))
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            Text(done ? "Counted" : late ? "Ready to count" : status == "cancelled" ? "Not counted" : "Upcoming")
                                .font(.system(size: 13))
                                .foregroundStyle(late ? DTheme.warning : DTheme.inkSecondary)
                        }
                        Spacer()
                        Text(Money.format(entry["amount"]?.intValue ?? 0, currency: currency))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(done ? DTheme.inkSecondary : DTheme.ink)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                }
            }
        }
    }

    private func details(_ schedule: JSONValue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                DetailRow("How it's spread", SalesRevenue.methods[schedule["method"]?.stringValue ?? ""] ?? (schedule["method"]?.stringValue ?? ""))
                DetailRow("Starts", DubblDate.display(schedule["startDate"]?.stringValue))
                DetailRow("Ends", DubblDate.display(schedule["endDate"]?.stringValue))
                if let invoice {
                    NavigationLink {
                        InvoiceDetailView(id: invoice.id)
                    } label: {
                        HStack {
                            Text("Invoice")
                                .font(.system(size: 15))
                                .foregroundStyle(DTheme.inkSecondary)
                            Spacer()
                            Text(invoice.invoiceNumber)
                                .font(.system(size: 15, design: .monospaced))
                                .foregroundStyle(DTheme.ink)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 48)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
        }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("revenue-schedules/\(id)")
            let record = RecordDetailView.record(in: response, key: "schedule")
            withAnimation(.snappy) {
                schedule = record
                failed = nil
            }
            if invoice == nil, let invoiceID = record["invoiceId"]?.stringValue,
               let detail: InvoiceDetailResponse = try? await env.api.get("invoices/\(invoiceID)") {
                withAnimation(.snappy) { invoice = detail.invoice }
            }
        } catch {
            if schedule == nil { failed = error.localizedDescription }
        }
    }

    /// `POST revenue-schedules/{id}/recognize` counts the next period.
    private func recognize() async {
        guard let next else { return }
        working = true
        defer { working = false }
        do {
            let _: JSONValue = try await env.api.post("revenue-schedules/\(id)/recognize", body: [String: JSONValue]())
            env.toast.show("Counted \(Money.format(next["amount"]?.intValue ?? 0, currency: currency)) for \(SalesRevenue.month(next["periodDate"]?.stringValue))")
            NotificationCenter.default.post(name: .recordsChanged, object: "revenue-schedules")
            #if DEBUG
            if DemoData.isEnabled { markDemoRecognized(next); return }
            #endif
            await load()
        } catch {
            env.toast.error(error)
        }
    }

    private func cancel() async {
        do {
            let _: JSONValue = try await env.api.delete("revenue-schedules/\(id)")
            env.toast.show("Schedule cancelled")
            NotificationCenter.default.post(name: .recordsChanged, object: "revenue-schedules")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }

    #if DEBUG
    /// Fixtures don't change, so tick the period off here.
    private func markDemoRecognized(_ entry: JSONValue) {
        guard case var .object(object) = schedule, var list = object["entries"]?.arrayValue else { return }
        if let index = list.firstIndex(where: { $0.recordID == entry.recordID }), case var .object(row) = list[index] {
            row["recognized"] = .bool(true)
            list[index] = .object(row)
        }
        object["entries"] = .array(list)
        object["recognizedAmount"] = .number(Double((object["recognizedAmount"]?.intValue ?? 0) + (entry["amount"]?.intValue ?? 0)))
        withAnimation(.snappy) { schedule = .object(object) }
    }
    #endif
}
