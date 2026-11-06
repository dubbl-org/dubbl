import Foundation

/// Amounts come from the API as integers in the currency's minor units (cents
/// for USD and EUR, whole yen for JPY, fils for KWD...).
enum Money {
    /// How many decimals a currency's minor unit has.
    static func fractionDigits(_ currency: String) -> Int {
        switch currency.uppercased() {
        case "JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF", "PYG", "RWF": 0
        case "KWD", "BHD", "OMR", "JOD", "TND", "LYD", "IQD": 3
        default: 2
        }
    }

    static func major(_ minor: Int, currency: String) -> Decimal {
        Decimal(minor) / pow(10, fractionDigits(currency))
    }

    static func minor(fromMajor value: Decimal, currency: String) -> Int {
        var scaled = value * pow(10, fractionDigits(currency))
        var rounded = Decimal()
        NSDecimalRound(&rounded, &scaled, 0, .plain)
        return NSDecimalNumber(decimal: rounded).intValue
    }

    /// "$1,234.50"
    static func format(_ minor: Int, currency: String) -> String {
        major(minor, currency: currency).formatted(.currency(code: currency))
    }

    /// "$1.2K" for tight spots like chart axes and KPI subtitles.
    static func compact(_ minor: Int, currency: String) -> String {
        let value = NSDecimalNumber(decimal: major(minor, currency: currency)).doubleValue
        guard abs(value) >= 10_000 else { return format(minor, currency: currency) }
        return value.formatted(.currency(code: currency).notation(.compactName).precision(.significantDigits(1 ... 3)))
    }

    /// "$4.51K", "$840": header subtitles, where a line has to fit beside buttons.
    static func short(_ minor: Int, currency: String) -> String {
        let value = NSDecimalNumber(decimal: major(minor, currency: currency)).doubleValue
        guard abs(value) >= 1_000 else { return value.formatted(.currency(code: currency).precision(.fractionLength(0))) }
        return value.formatted(.currency(code: currency).notation(.compactName).precision(.significantDigits(1 ... 3)))
    }

    static func symbol(_ currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.currencySymbol ?? currency
    }
}

/// The API sends calendar dates as "YYYY-MM-DD" and moments as ISO-8601 with
/// milliseconds. Models keep both as strings; these turn them into Dates.
enum DubblDate {
    private static let day: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func parseDay(_ value: String?) -> Date? {
        guard let value else { return nil }
        return day.date(from: String(value.prefix(10)))
    }

    static func parseMoment(_ value: String?) -> Date? {
        guard let value else { return nil }
        if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value) { return date }
        return try? Date.ISO8601FormatStyle().parse(value)
    }

    static func string(_ date: Date) -> String { day.string(from: date) }

    /// "12 Oct 2026"
    static func display(_ value: String?) -> String {
        guard let date = parseDay(value) ?? parseMoment(value) else { return value ?? "" }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// "12 Oct", or with the year when it isn't this year.
    static func short(_ value: String?) -> String {
        guard let date = parseDay(value) ?? parseMoment(value) else { return value ?? "" }
        let sameYear = Calendar.current.isDate(date, equalTo: .now, toGranularity: .year)
        return sameYear
            ? date.formatted(.dateTime.day().month(.abbreviated))
            : date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    /// "3h ago", "Yesterday"...
    static func relative(_ value: String?) -> String {
        guard let date = parseMoment(value) ?? parseDay(value) else { return "" }
        if abs(date.timeIntervalSinceNow) < 60 { return "Just now" }
        return date.formatted(.relative(presentation: .named, unitsStyle: .abbreviated))
    }

    /// Whole days from today until the date (negative = in the past).
    static func daysFromToday(_ value: String?) -> Int? {
        guard let date = parseDay(value) else { return nil }
        let calendar = Calendar.current
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: .now), to: calendar.startOfDay(for: date)).day
    }
}

extension String {
    /// "pending_approval" -> "Pending approval"
    var humanized: String {
        let spaced = replacingOccurrences(of: "_", with: " ")
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }

    var initials: String {
        let parts = split(whereSeparator: { $0 == " " || $0 == "@" || $0 == "." }).prefix(2)
        let letters = parts.compactMap(\.first).map { String($0).uppercased() }
        return letters.isEmpty ? "?" : letters.joined()
    }
}
