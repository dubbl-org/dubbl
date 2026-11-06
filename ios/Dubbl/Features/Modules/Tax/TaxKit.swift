import SwiftUI

// Pieces the tax screens share: date ranges for returns, the period menu,
// small figure rows and the loading scaffold.

/// A window a return is worked out for: a quick preset or a saved tax period.
struct TaxDateRange: Hashable {
    var start: String
    var end: String
    var label: String
    /// Set when the range is one of the organization's tax periods, so it can be filed.
    var periodID: String?

    /// "1 Jul – 30 Sep 2026"
    var span: String {
        guard let from = DubblDate.parseDay(start), let to = DubblDate.parseDay(end) else { return "\(start) – \(end)" }
        let sameYear = Calendar.current.isDate(from, equalTo: to, toGranularity: .year)
        let left = sameYear ? from.formatted(.dateTime.day().month(.abbreviated)) : from.formatted(.dateTime.day().month(.abbreviated).year())
        return "\(left) – \(to.formatted(.dateTime.day().month(.abbreviated).year()))"
    }

    var query: [String: String?] { ["startDate": start, "endDate": end] }

    /// A saved tax period from `GET tax-periods`.
    init?(period: JSONValue) {
        guard let start = period["startDate"]?.stringValue, let end = period["endDate"]?.stringValue else { return nil }
        self.start = start
        self.end = end
        label = period["name"]?.stringValue ?? "Tax period"
        periodID = period.recordID
    }

    init(start: String, end: String, label: String, periodID: String? = nil) {
        self.start = start
        self.end = end
        self.label = label
        self.periodID = periodID
    }

    /// Quarters, months and years around today.
    static func presets(today: Date = .now) -> [TaxDateRange] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        func day(_ date: Date) -> String { DubblDate.string(date) }
        func range(_ component: Calendar.Component, offset: Int, label: String) -> TaxDateRange? {
            guard let interval = calendar.dateInterval(of: component, for: today),
                  let start = calendar.date(byAdding: component, value: offset, to: interval.start),
                  let next = calendar.date(byAdding: component, value: 1, to: start),
                  let end = calendar.date(byAdding: .day, value: -1, to: next) else { return nil }
            return TaxDateRange(start: day(start), end: day(end), label: label)
        }
        let quarterStart: Date = {
            let month = calendar.component(.month, from: today)
            let first = ((month - 1) / 3) * 3 + 1
            return calendar.date(from: DateComponents(year: calendar.component(.year, from: today), month: first, day: 1)) ?? today
        }()
        func quarter(offset: Int, label: String) -> TaxDateRange? {
            guard let start = calendar.date(byAdding: .month, value: offset * 3, to: quarterStart),
                  let next = calendar.date(byAdding: .month, value: 3, to: start),
                  let end = calendar.date(byAdding: .day, value: -1, to: next) else { return nil }
            return TaxDateRange(start: day(start), end: day(end), label: label)
        }
        let yearStart = calendar.date(from: DateComponents(year: calendar.component(.year, from: today), month: 1, day: 1)) ?? today
        return [
            quarter(offset: 0, label: "This quarter"),
            quarter(offset: -1, label: "Last quarter"),
            range(.month, offset: 0, label: "This month"),
            range(.month, offset: -1, label: "Last month"),
            TaxDateRange(start: day(yearStart), end: day(today), label: "Year to date"),
            range(.year, offset: -1, label: "Last year"),
        ].compactMap { $0 }
    }
}

/// The card at the top of a return: which period, with presets and saved tax periods in a menu.
struct TaxPeriodMenu: View {
    @Binding var range: TaxDateRange
    let periods: [JSONValue]

    var body: some View {
        Menu {
            Section("Quick ranges") {
                ForEach(TaxDateRange.presets(), id: \.self) { preset in
                    Button {
                        range = preset
                    } label: {
                        Label(preset.label, systemImage: range.periodID == nil && range.start == preset.start && range.end == preset.end ? "checkmark" : "calendar")
                    }
                }
            }
            if !periods.isEmpty {
                Section("Tax periods") {
                    ForEach(periods.prefix(12), id: \.self) { period in
                        if let option = TaxDateRange(period: period) {
                            Button {
                                range = option
                            } label: {
                                let status = period["status"]?.stringValue ?? "open"
                                Label("\(option.label) · \(RecordFormat.statusLabel(status))", systemImage: range.periodID == option.periodID ? "checkmark" : (status == "open" ? "circle" : "checkmark.seal"))
                            }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 12) {
                IconTile(symbol: "calendar", size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(range.label)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(DTheme.ink)
                    Text(range.span)
                        .font(.system(size: 13.5))
                        .foregroundStyle(DTheme.inkSecondary)
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(TapScaleStyle())
        .accessibilityLabel("Period, \(range.label), \(range.span)")
    }
}

/// Two options in a grey-tinted capsule, e.g. accrual vs cash basis.
struct TaxSegment: View {
    let options: [(value: String, label: String)]
    @Binding var selection: String
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.value) { option in
                let selected = selection == option.value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { selection = option.value }
                } label: {
                    Text(option.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background {
                            if selected {
                                Capsule().fill(DTheme.tintStrong).matchedGeometryEffect(id: "segment", in: namespace)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(DTheme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// One numbered line on a return: "1  VAT due on sales ....... $4,120.00".
struct TaxBoxRow: View {
    let number: String
    let label: String
    let amount: Int
    let currency: String
    var emphasized = false
    var drillable = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(number)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(emphasized ? DTheme.ink : DTheme.inkSecondary)
                .frame(minWidth: 30, minHeight: 22)
                .padding(.horizontal, 2)
                .background(emphasized ? DTheme.tintStrong : DTheme.tint, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                .alignmentGuide(.firstTextBaseline) { $0[.firstTextBaseline] }
            Text(label)
                .font(.system(size: 15, weight: emphasized ? .semibold : .regular))
                .foregroundStyle(DTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(Money.format(amount, currency: currency))
                .font(.system(size: 15, weight: emphasized ? .semibold : .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(amount < 0 ? DTheme.negative : DTheme.ink)
                .fixedSize()
            if drillable {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// A label and a figure on one line inside a card.
struct TaxFigureRow: View {
    let label: String
    let value: String
    var detail: String?
    var tone: Tone = .neutral
    var strong = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 15, weight: strong ? .semibold : .regular))
                    .foregroundStyle(DTheme.ink)
                if let detail {
                    Text(detail)
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                }
            }
            Spacer(minLength: 12)
            Text(value)
                .font(.system(size: 15, weight: strong ? .semibold : .medium, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tone == .neutral ? DTheme.ink : tone.color)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}

/// Loading, failed or loaded: skeleton, retry, or the content.
struct TaxLoadState<Content: View>: View {
    let loaded: Bool
    let error: String?
    let retry: () async -> Void
    @ViewBuilder var content: Content

    var body: some View {
        if loaded {
            content
        } else if let error {
            ErrorStateView(message: error, retry: retry)
                .padding(.top, 60)
        } else {
            SkeletonRows(rows: 7, avatar: false)
        }
    }
}

enum TaxFormat {
    /// "20%" from basis points.
    static func percent(_ basisPoints: Int) -> String {
        (Double(basisPoints) / 100).formatted(.number.precision(.fractionLength(0 ... 2))) + "%"
    }

    static func appliesTo(_ type: String?) -> String {
        switch type {
        case "sales": "Sales"
        case "purchase": "Purchases"
        default: "Sales and purchases"
        }
    }

    static let kinds: [(value: String, label: String)] = [
        ("standard", "Standard"), ("blocked", "Blocked"), ("partial_block", "Partly blocked"), ("exempt", "Exempt"),
        ("reverse_charge", "Reverse charge"), ("no_vat", "No VAT"), ("sales_tax_us", "US sales tax"),
    ]

    static func kind(_ value: String?) -> String {
        kinds.first { $0.value == value }?.label ?? (value ?? "Standard").humanized
    }

    /// Exchange rates are stored ×1,000,000.
    static func rate(_ stored: Int) -> String {
        let value = Double(stored) / 1_000_000
        return value.formatted(.number.precision(.fractionLength(2 ... 6)))
    }
}
