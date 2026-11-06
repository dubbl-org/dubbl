import Charts
import SwiftUI

// The pieces every report shares: a period (or "as at" date) picker, a page
// that loads one JSON report and redraws it when the period changes, headline
// figures, sections of rows with totals, ranked bars, and links that drill
// into an account's transactions or the record behind a row.

// MARK: - Period

/// The windows a report can cover. Presets run to today, like the web.
enum ReportsRange: Hashable, Sendable {
    case month, quarter, year, lastYear, custom

    var label: String {
        switch self {
        case .month: "This month"
        case .quarter: "This quarter"
        case .year: "This year"
        case .lastYear: "Last year"
        case .custom: "Custom"
        }
    }
}

/// A date window for a report.
struct ReportsPeriod: Hashable, Sendable {
    var range: ReportsRange
    var start: Date
    var end: Date

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    static func preset(_ range: ReportsRange, today: Date = .now) -> ReportsPeriod {
        let calendar = calendar
        let parts = calendar.dateComponents([.year, .month], from: today)
        let year = parts.year ?? 2026, month = parts.month ?? 1
        func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
            calendar.date(from: DateComponents(year: y, month: m, day: d)) ?? today
        }
        switch range {
        case .month: return ReportsPeriod(range: range, start: day(year, month, 1), end: today)
        case .quarter: return ReportsPeriod(range: range, start: day(year, (month - 1) / 3 * 3 + 1, 1), end: today)
        case .year, .custom: return ReportsPeriod(range: range == .custom ? .year : range, start: day(year, 1, 1), end: today)
        case .lastYear: return ReportsPeriod(range: range, start: day(year - 1, 1, 1), end: day(year - 1, 12, 31))
        }
    }

    static var thisYear: ReportsPeriod { preset(.year) }
    static var thisQuarter: ReportsPeriod { preset(.quarter) }
    static var thisMonth: ReportsPeriod { preset(.month) }

    var startString: String { DubblDate.string(start) }
    var endString: String { DubblDate.string(end) }

    /// `startDate`/`endDate`, the names every period report takes.
    var query: [String: String?] { ["startDate": startString, "endDate": endString] }

    /// "1 Jan – 12 Oct 2026"
    var label: String { ReportsDates.range(start, end) }

    /// The same number of days just before this one, for "vs previous period".
    var previous: ReportsPeriod {
        let calendar = Self.calendar
        let days = (calendar.dateComponents([.day], from: start, to: end).day ?? 0) + 1
        let end = calendar.date(byAdding: .day, value: -1, to: start) ?? start
        let start = calendar.date(byAdding: .day, value: -(days - 1), to: end) ?? end
        return ReportsPeriod(range: .custom, start: start, end: end)
    }
}

/// Date helpers the reports need beyond DubblDate.
enum ReportsDates {
    static func range(_ start: Date, _ end: Date) -> String {
        let calendar = ReportsPeriod.calendar
        let sameYear = calendar.isDate(start, equalTo: end, toGranularity: .year)
        let head = sameYear ? start.formatted(.dateTime.day().month(.abbreviated)) : start.formatted(.dateTime.day().month(.abbreviated).year())
        return "\(head) – \(end.formatted(.dateTime.day().month(.abbreviated).year()))"
    }

    static func day(_ date: Date) -> String { date.formatted(.dateTime.day().month(.abbreviated).year()) }

    /// The last day of the month `monthsBack` months before `date`'s month.
    static func monthEnd(before date: Date, monthsBack: Int) -> Date {
        let calendar = ReportsPeriod.calendar
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: date)) ?? date
        let shifted = calendar.date(byAdding: .month, value: -(monthsBack - 1), to: first) ?? first
        return calendar.date(byAdding: .day, value: -1, to: shifted) ?? shifted
    }

    static func lastQuarterEnd(_ date: Date) -> Date {
        let calendar = ReportsPeriod.calendar
        let parts = calendar.dateComponents([.year, .month], from: date)
        let quarterStart = calendar.date(from: DateComponents(year: parts.year, month: ((parts.month ?? 1) - 1) / 3 * 3 + 1, day: 1)) ?? date
        return calendar.date(byAdding: .day, value: -1, to: quarterStart) ?? date
    }

    static func lastYearEnd(_ date: Date) -> Date {
        let calendar = ReportsPeriod.calendar
        let year = calendar.component(.year, from: date)
        return calendar.date(from: DateComponents(year: year - 1, month: 12, day: 31)) ?? date
    }

    /// "Oct 2026" from "2026-10".
    static func month(_ key: String, year: Bool = false) -> String {
        guard let date = DubblDate.parseDay(key.prefix(7) + "-01") else { return key }
        return year ? date.formatted(.dateTime.month(.abbreviated).year()) : date.formatted(.dateTime.month(.abbreviated))
    }
}

// MARK: - Pickers

/// A chip like the app's ChipRow: grey tint when selected, hairline when not.
struct ReportsChip: View {
    let title: String
    var symbol: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let symbol { Image(systemName: symbol).font(.system(size: 12, weight: .semibold)) }
                Text(title)
            }
            .font(.system(size: 13.5, weight: .medium))
            .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
            .padding(.horizontal, 12)
            .frame(height: 32)
            .background(selected ? DTheme.tintStrong : DTheme.tint.opacity(0.0001), in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? .clear : DTheme.hairline, lineWidth: 0.5))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A horizontal row of chips for one choice (dimension, grouping, weeks...).
struct ReportsChoice<Value: Hashable>: View {
    let options: [(value: Value, label: String)]
    @Binding var selection: Value

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.value) { option in
                    ReportsChip(title: option.label, selected: option.value == selection) {
                        withAnimation(.snappy(duration: 0.22)) { selection = option.value }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// This month / quarter / year / last year / custom dates.
struct ReportsPeriodBar: View {
    @Binding var period: ReportsPeriod
    var ranges: [ReportsRange] = [.month, .quarter, .year, .lastYear]
    @State private var picking = false

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ranges, id: \.self) { range in
                    ReportsChip(title: range.label, selected: period.range == range) {
                        withAnimation(.snappy(duration: 0.22)) { period = .preset(range) }
                    }
                }
                ReportsChip(
                    title: period.range == .custom ? period.label : "Custom",
                    symbol: "calendar",
                    selected: period.range == .custom
                ) { picking = true }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: period)
        .sheet(isPresented: $picking) {
            ReportsRangeSheet(period: $period)
                .presentationDetents([.medium, .large])
        }
    }
}

/// Picks a custom start and end.
private struct ReportsRangeSheet: View {
    @Binding var period: ReportsPeriod
    @Environment(\.dismiss) private var dismiss
    @State private var start = Date.now
    @State private var end = Date.now

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("From", selection: $start, in: ...end, displayedComponents: .date)
                DatePicker("To", selection: $end, in: start..., displayedComponents: .date)
            }
            .navigationTitle("Custom dates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        period = ReportsPeriod(range: .custom, start: start, end: end)
                        dismiss()
                    }
                }
            }
            .onAppear {
                start = period.start
                end = period.end
            }
        }
    }
}

/// "As at" today, the end of last month, quarter or year, or a picked day.
struct ReportsAsAtBar: View {
    @Binding var date: Date
    @State private var picking = false

    private var presets: [(label: String, date: Date)] {
        let today = Date.now
        return [
            ("Today", today),
            ("End of last month", ReportsDates.monthEnd(before: today, monthsBack: 1)),
            ("End of last quarter", ReportsDates.lastQuarterEnd(today)),
            ("End of last year", ReportsDates.lastYearEnd(today)),
        ]
    }

    private func same(_ a: Date, _ b: Date) -> Bool { ReportsPeriod.calendar.isDate(a, inSameDayAs: b) }

    var body: some View {
        let isPreset = presets.contains { same($0.date, date) }
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(presets, id: \.label) { preset in
                    ReportsChip(title: preset.label, selected: same(preset.date, date)) {
                        withAnimation(.snappy(duration: 0.22)) { date = preset.date }
                    }
                }
                ReportsChip(title: isPreset ? "Pick a date" : ReportsDates.day(date), symbol: "calendar", selected: !isPreset) {
                    picking = true
                }
            }
            .padding(.horizontal, 16)
        }
        .sensoryFeedback(.selection, trigger: date)
        .sheet(isPresented: $picking) {
            NavigationStack {
                DatePicker("As at", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding(.horizontal, 16)
                    .navigationTitle("As at")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { picking = false } }
                    }
                Spacer()
            }
            .presentationDetents([.medium, .large])
        }
    }
}

// MARK: - Loading

/// Loads one JSON report and keeps the last good copy while it refreshes, so
/// switching period dims the old figures instead of blanking the screen.
@MainActor @Observable
final class ReportsLoader {
    private(set) var value: JSONValue?
    private(set) var error: String?
    private(set) var loading = false
    private var generation = 0

    func load(_ api: APIClient, _ path: String, query: [String: String?] = [:]) async {
        generation += 1
        let current = generation
        loading = true
        defer { if current == generation { loading = false } }
        do {
            let response: JSONValue = try await api.get(path, query: query)
            guard current == generation else { return }
            withAnimation(.snappy) {
                value = response
                error = nil
            }
        } catch {
            guard current == generation, !(error is CancellationError) else { return }
            if value == nil { self.error = error.localizedDescription }
        }
    }

    func set(_ newValue: JSONValue?) { value = newValue }
}

/// A PDF or spreadsheet version of a report, shared from the page's menu.
struct ReportsExport {
    enum Format: String { case pdf, xlsx }
    let path: String
    var query: [String: String?] = [:]
    let name: String
    var formats: [Format] = [.pdf, .xlsx]
}

private struct ReportsFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// One report screen: controls on top, then the figures for the loaded JSON.
/// Reloads whenever the path or query changes; pull to refresh; a menu with
/// export and Ask Tilly.
struct ReportsPage<Controls: View, Content: View>: View {
    let title: String
    let path: String
    var query: [String: String?]
    var tilly: String?
    var export: ReportsExport?
    @ViewBuilder var controls: () -> Controls
    @ViewBuilder var content: (JSONValue) -> Content

    @Environment(AppEnvironment.self) private var env
    @State private var loader = ReportsLoader()
    @State private var shared: ReportsFile?
    @State private var exporting = false
    @State private var shown = false

    init(
        _ title: String, path: String, query: [String: String?] = [:], tilly: String? = nil, export: ReportsExport? = nil,
        @ViewBuilder controls: @escaping () -> Controls, @ViewBuilder content: @escaping (JSONValue) -> Content
    ) {
        self.title = title
        self.path = path
        self.query = query
        self.tilly = tilly
        self.export = export
        self.controls = controls
        self.content = content
    }

    private var key: String {
        path + "?" + query.keys.sorted().map { "\($0)=\(query[$0].flatMap { $0 } ?? "")" }.joined(separator: "&")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                controls()
                    .padding(.top, 4)
                    .padding(.bottom, 6)
                Group {
                    if let value = loader.value {
                        VStack(alignment: .leading, spacing: 22) {
                            content(value)
                        }
                        .opacity(loader.loading ? 0.5 : 1)
                        .animation(.easeOut(duration: 0.2), value: loader.loading)
                        .reveal(shown, 0)
                        .onAppear { shown = true }
                    } else if let error = loader.error {
                        ErrorStateView(message: error) { await reload() }
                            .padding(.top, 60)
                    } else {
                        ReportsSkeleton()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 32)
            }
        }
        .background(DTheme.shell)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let export {
                        ForEach(export.formats, id: \.rawValue) { format in
                            Button {
                                run(export, format)
                            } label: {
                                Label(format == .pdf ? "Export PDF" : "Export spreadsheet", systemImage: format == .pdf ? "doc.richtext" : "tablecells")
                            }
                        }
                    }
                    Button {
                        env.router.askTilly(tilly ?? "Explain my \(title.lowercased()) report.", page: "reports")
                    } label: {
                        Label("Ask Tilly", systemImage: "sparkle")
                    }
                } label: {
                    if exporting { ProgressView().controlSize(.small) } else { Image(systemName: "ellipsis") }
                }
                .accessibilityLabel("Report actions")
            }
        }
        .task(id: key) { await reload() }
        .refreshable { await reload() }
        .sheet(item: $shared) { file in
            ReportsShareSheet(url: file.url)
        }
    }

    private func reload() async {
        await loader.load(env.api, path, query: query)
    }

    private func run(_ export: ReportsExport, _ format: ReportsExport.Format) {
        exporting = true
        Task {
            defer { exporting = false }
            do {
                var query = export.query
                query["format"] = format.rawValue
                let data = try await env.api.download(export.path, query: query)
                guard !data.isEmpty else {
                    env.toast.show("Nothing to export here", symbol: "exclamationmark.circle", isError: true)
                    return
                }
                let url = FileManager.default.temporaryDirectory.appending(path: "\(export.name).\(format.rawValue)")
                try data.write(to: url, options: .atomic)
                shared = ReportsFile(url: url)
            } catch {
                env.toast.error(error)
            }
        }
    }
}

extension ReportsPage where Controls == EmptyView {
    init(
        _ title: String, path: String, query: [String: String?] = [:], tilly: String? = nil, export: ReportsExport? = nil,
        @ViewBuilder content: @escaping (JSONValue) -> Content
    ) {
        self.init(title, path: path, query: query, tilly: tilly, export: export, controls: { EmptyView() }, content: content)
    }
}

/// The system share sheet for an exported file.
struct ReportsShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Placeholder while the first copy loads: a headline and a card of rows.
struct ReportsSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                RoundedRectangle(cornerRadius: 4).fill(DTheme.tint).frame(width: 110, height: 11)
                RoundedRectangle(cornerRadius: 6).fill(DTheme.tintStrong).frame(width: 200, height: 30)
            }
            .padding(.horizontal, 4)
            SkeletonRows(rows: 6, avatar: false)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .skeletonShimmer()
    }
}

// MARK: - JSON

/// Reads report JSON leniently: SQL sums can arrive as strings, and a few
/// statements send decimal strings in major units instead of cents.
enum ReportsJSON {
    static func int(_ value: JSONValue?) -> Int { value?.intValue ?? 0 }

    static func double(_ value: JSONValue?) -> Double? {
        switch value {
        case let .number(number): number
        case let .string(string): Double(string)
        default: nil
        }
    }

    static func string(_ value: JSONValue?) -> String? {
        guard let text = value?.stringValue, !text.isEmpty else { return nil }
        return text
    }

    /// "1234.56" (major units) as minor units.
    static func decimalCents(_ value: JSONValue?, currency: String) -> Int {
        guard let double = double(value) else { return 0 }
        let digits = Money.fractionDigits(currency)
        return Int((double * pow(10, Double(digits))).rounded())
    }

    static func array(_ value: JSONValue?) -> [JSONValue] { value?.arrayValue ?? [] }

    /// `values[index]`, or 0 past the end.
    static func at(_ values: [Int], _ index: Int) -> Int { values.indices.contains(index) ? values[index] : 0 }

    /// An account id that the account-transactions report can open.
    static func drillableAccount(_ id: String?) -> String? {
        guard let id, !id.isEmpty, id != "current-year-earnings", !id.hasPrefix("__") else { return nil }
        return id
    }
}

enum ReportsText {
    /// "12.5%" from a plain percentage number.
    static func percent(_ value: Double?, digits: Int = 1) -> String {
        guard let value else { return "–" }
        return value.formatted(.number.precision(.fractionLength(0 ... digits))) + "%"
    }

    /// "+12%" / "−4%" with a sign.
    static func change(_ value: Double?) -> String {
        guard let value else { return "New" }
        let sign = value > 0 ? "+" : value < 0 ? "−" : ""
        return sign + abs(value).formatted(.number.precision(.fractionLength(0 ... 1))) + "%"
    }

    /// "+$1,200.00" / "−$300.00".
    static func signedMoney(_ minor: Int, currency: String) -> String {
        let sign = minor > 0 ? "+" : minor < 0 ? "−" : ""
        return sign + Money.format(abs(minor), currency: currency)
    }

    static func count(_ count: Int, _ singular: String, _ plural: String? = nil) -> String {
        "\(count.formatted()) \(count == 1 ? singular : (plural ?? singular + "s"))"
    }
}

// MARK: - Headline

/// The figure a report leads with: a label, a big amount and one line under it.
struct ReportsHeadline: View {
    let label: String
    let amount: Int
    let currency: String
    var caption: String?
    var captionTone: Tone = .neutral
    var negativeIsBad = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 38, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .tracking(-1.1)
                .foregroundStyle(amount < 0 && negativeIsBad ? DTheme.negative : DTheme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.55)
                .contentTransition(.numericText(value: Double(amount)))
            if let caption {
                Text(caption)
                    .font(.system(size: 13.5, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(captionTone == .neutral ? DTheme.inkSecondary : captionTone.color)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Two to four figures side by side on a card, with rules between them.
struct ReportsFigures: View {
    let items: [LedgerTotals.Item]

    var body: some View {
        LedgerTotals(items: items)
            .dubblCard(padding: 16)
    }
}

extension LedgerTotals.Item {
    /// A money figure in short form ("$28.6K").
    static func money(_ label: String, _ minor: Int, currency: String, detail: String? = nil, tint: Color? = nil) -> LedgerTotals.Item {
        LedgerTotals.Item(label: label, value: Money.short(minor, currency: currency), detail: detail, tint: tint)
    }
}

/// A small notice inside a report: balanced, out of balance, nothing to file...
struct ReportsNote: View {
    let symbol: String
    let text: String
    var tone: Tone = .neutral

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 13.5, weight: .semibold))
                .foregroundStyle(tone == .neutral ? DTheme.inkSecondary : tone.color)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(DTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(tone.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - Sections and rows

/// A titled card of rows, with the section's figure on the right of its title.
struct ReportsSection<Rows: View>: View {
    let title: String
    var trailing: String?
    @ViewBuilder var rows: Rows

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Spacer()
                if let trailing {
                    Text(trailing)
                        .font(.system(size: 13.5, weight: .medium))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            .padding(.horizontal, 4)
            CardStack {
                rows
            }
        }
    }
}

/// One line of a report: optional code, a name, a line under it and an amount.
struct ReportsRow: View {
    let title: String
    var code: String?
    var subtitle: String?
    var amount: Int?
    var currency: String = "USD"
    /// Text instead of an amount ("12 days", "1.4x").
    var value: String?
    var valueTone: Tone = .neutral
    var bold = false
    var chevron = false

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    if let code, !code.isEmpty {
                        Text(code)
                            .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                    Text(title)
                        .font(.system(size: 15, weight: bold ? .semibold : .regular))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(2)
                }
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Group {
                if let value {
                    Text(value)
                        .foregroundStyle(valueTone == .neutral ? DTheme.ink : valueTone.color)
                } else if let amount {
                    Text(Money.format(amount, currency: currency))
                        .foregroundStyle(valueTone == .neutral ? (amount < 0 ? DTheme.negative : DTheme.ink) : valueTone.color)
                }
            }
            .font(.system(size: 15, weight: bold ? .semibold : .medium, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .fixedSize(horizontal: false, vertical: true)
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11.5, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A section's closing line on a soft grey band.
struct ReportsTotalRow: View {
    let title: String
    let amount: Int
    let currency: String
    var tone: Tone = .neutral

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(DTheme.ink)
            Spacer()
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 15.5, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone == .neutral ? DTheme.ink : tone.color)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .background(DTheme.tint)
        .accessibilityElement(children: .combine)
    }
}

/// A row that opens an account's transactions for the period when the report
/// gives an account id, and is a plain row otherwise.
struct ReportsAccountRow: View {
    let accountId: String?
    let name: String
    var code: String?
    var subtitle: String?
    let amount: Int
    let currency: String
    let start: String
    let end: String
    /// A tracking filter for the drill-down, e.g. ("costCenterId", id).
    var dimension: (key: String, value: String)?

    var body: some View {
        if let id = ReportsJSON.drillableAccount(accountId) {
            NavigationLink {
                ReportsAccountView(accountId: id, name: name, code: code, start: start, end: end, dimension: dimension)
            } label: {
                ReportsRow(title: name, code: code, subtitle: subtitle, amount: amount, currency: currency, chevron: true)
            }
            .buttonStyle(RowPressStyle())
        } else {
            ReportsRow(title: name, code: code, subtitle: subtitle, amount: amount, currency: currency)
        }
    }
}

/// Wraps any row in a link to an account's transactions when the id can be opened.
struct ReportsAccountLink<Label: View>: View {
    let accountId: String?
    let name: String
    var code: String?
    let start: String
    let end: String
    @ViewBuilder var label: Label

    var body: some View {
        if let id = ReportsJSON.drillableAccount(accountId) {
            NavigationLink {
                ReportsAccountView(accountId: id, name: name, code: code, start: start, end: end)
            } label: {
                label
            }
            .buttonStyle(RowPressStyle())
        } else {
            label
        }
    }
}

/// Opens the invoice or bill behind a report row.
struct ReportsDocumentLink<Label: View>: View {
    enum Kind { case invoice, bill, contact }
    let kind: Kind
    let id: String?
    @ViewBuilder var label: Label

    var body: some View {
        if let id, !id.isEmpty {
            NavigationLink {
                switch kind {
                case .invoice: InvoiceDetailView(id: id)
                case .bill: BillDetailView(id: id)
                case .contact: ContactDetailView(id: id)
                }
            } label: {
                label
            }
            .buttonStyle(RowPressStyle())
        } else {
            label
        }
    }
}

// MARK: - Bars

/// A ranked line: name and amount over a thin bar showing its share.
struct ReportsBarRow: View {
    let title: String
    var subtitle: String?
    let amount: Int
    let currency: String
    /// 0...1 of the largest (or of the whole).
    let share: Double
    var tint: Color = DTheme.accent
    var trailingNote: String?
    var chevron = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 12.5))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Money.format(amount, currency: currency))
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(DTheme.ink)
                    if let trailingNote {
                        Text(trailingNote)
                            .font(.system(size: 12.5, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.inkTertiary)
                    }
                }
                if chevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            ReportsMeter(fraction: share, tint: tint)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A thin rounded bar filled to a fraction.
struct ReportsMeter: View {
    let fraction: Double
    var tint: Color = DTheme.accent
    var height: CGFloat = 5

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DTheme.tint)
                Capsule().fill(tint)
                    .frame(width: max(fraction > 0 ? height : 0, proxy.size.width * min(max(fraction, 0), 1)))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// One bar split into coloured parts, with a legend under it (aging, money in/out).
struct ReportsSplitBar: View {
    struct Part: Identifiable {
        let label: String
        let value: Int
        let color: Color
        var id: String { label }
    }

    let parts: [Part]
    let currency: String

    var body: some View {
        let total = max(parts.reduce(0) { $0 + max($1.value, 0) }, 1)
        VStack(alignment: .leading, spacing: 12) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    ForEach(parts.filter { $0.value > 0 }) { part in
                        Rectangle()
                            .fill(part.color)
                            .frame(width: max(3, (proxy.size.width - CGFloat(parts.count) * 2) * CGFloat(part.value) / CGFloat(total)))
                    }
                    Spacer(minLength: 0)
                }
                .clipShape(Capsule())
                .background(Capsule().fill(DTheme.tint))
            }
            .frame(height: 10)
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(parts) { part in
                    HStack(spacing: 6) {
                        Circle().fill(part.color).frame(width: 7, height: 7)
                        Text(part.label)
                            .font(.system(size: 12.5))
                            .foregroundStyle(DTheme.inkSecondary)
                            .lineLimit(1)
                        Spacer(minLength: 2)
                        Text(Money.short(part.value, currency: currency))
                            .font(.system(size: 12.5, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.trailing, 8)
                }
            }
        }
        .dubblCard(padding: 16)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Charts

/// One value in a column chart: a period and a series.
struct ReportsChartPoint: Identifiable, Hashable {
    let label: String
    let series: String
    let value: Int
    var order = 0
    var id: String { "\(order)|\(label)|\(series)" }
}

/// Columns per period, grouped by series (money in vs out, revenue vs expenses),
/// with an optional line (running balance, net). Scrub to read a column.
struct ReportsColumnChart: View {
    let points: [ReportsChartPoint]
    var line: [ReportsChartPoint] = []
    let currency: String
    var colors: [String: Color] = [:]
    var stacked = false
    var height: CGFloat = 180

    @State private var selected: String?

    private var labels: [String] {
        var seen = Set<String>()
        return (points + line).sorted { $0.order < $1.order }.compactMap { seen.insert($0.label).inserted ? $0.label : nil }
    }

    private var series: [String] {
        var seen = Set<String>()
        return (points + line).compactMap { seen.insert($0.series).inserted ? $0.series : nil }
    }

    private func color(_ series: String, index: Int) -> Color {
        if let color = colors[series] { return color }
        let palette = [DTheme.chartPrimary, DTheme.chartSecondary, DTheme.special, DTheme.positive, DTheme.warning, DTheme.inkTertiary]
        return palette[index % palette.count]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            readout
            Chart {
                ForEach(points) { point in
                    if stacked {
                        BarMark(x: .value("Period", point.label), y: .value("Amount", point.value))
                            .foregroundStyle(by: .value("Series", point.series))
                            .cornerRadius(3)
                    } else {
                        BarMark(x: .value("Period", point.label), y: .value("Amount", point.value))
                            .foregroundStyle(by: .value("Series", point.series))
                            .position(by: .value("Series", point.series))
                            .cornerRadius(3)
                    }
                }
                ForEach(line) { point in
                    LineMark(x: .value("Period", point.label), y: .value("Amount", point.value), series: .value("Series", point.series))
                        .foregroundStyle(by: .value("Series", point.series))
                        .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round))
                        .interpolationMethod(.monotone)
                }
                if let selected {
                    RuleMark(x: .value("Period", selected))
                        .foregroundStyle(DTheme.hairline)
                        .zIndex(-1)
                }
            }
            .chartForegroundStyleScale(domain: series, range: series.enumerated().map { color($0.element, index: $0.offset) })
            .chartLegend(.hidden)
            .chartXScale(domain: labels)
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                    AxisGridLine().foregroundStyle(DTheme.hairline)
                    AxisValueLabel {
                        if let amount = value.as(Double.self) {
                            Text(Money.short(Int(amount), currency: currency))
                                .font(.system(size: 10.5))
                                .foregroundStyle(DTheme.inkTertiary)
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: labels.count > 8 ? stride(from: 0, to: labels.count, by: max(labels.count / 6, 1)).map { labels[$0] } : labels) { _ in
                    AxisValueLabel()
                        .font(.system(size: 10.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            .chartXSelection(value: $selected)
            .frame(height: height)
            .sensoryFeedback(.selection, trigger: selected)
        }
        .dubblCard(padding: 16)
    }

    private var readout: some View {
        let label = selected ?? labels.last ?? ""
        let values = (points + line).filter { $0.label == label }
        let items = HStack(alignment: .firstTextBaseline, spacing: 14) {
            ForEach(Array(series.enumerated()), id: \.element) { index, name in
                if let value = values.first(where: { $0.series == name }) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Circle().fill(color(name, index: index)).frame(width: 6, height: 6)
                            Text(name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                                .lineLimit(1)
                        }
                        Text(Money.short(value.value, currency: currency))
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.ink)
                            .lineLimit(1)
                    }
                    .fixedSize()
                }
            }
        }
        return HStack(alignment: .top, spacing: 10) {
            // Many series (suppliers, accounts) scroll sideways instead of squashing.
            ViewThatFits(in: .horizontal) {
                items
                ScrollView(.horizontal, showsIndicators: false) { items }
            }
            Spacer(minLength: 0)
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(DTheme.inkTertiary)
                .lineLimit(1)
        }
        .animation(.snappy(duration: 0.2), value: selected)
    }
}

// MARK: - Empty

/// Inside a report: the period had nothing to show.
struct ReportsEmpty: View {
    let symbol: String
    let title: String
    var message: String?

    var body: some View {
        EmptyStateView(symbol: symbol, title: title, message: message)
            .padding(.top, 30)
    }
}
