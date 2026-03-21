import Foundation

// MARK: - Currency Formatting (amounts are in cents)

extension Int {
    /// Formats integer cents to currency string (e.g., 1250 -> "$12.50")
    func asCurrency(code: String = "USD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = code
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        let value = NSNumber(value: Double(self) / 100.0)
        return formatter.string(from: value) ?? "$0.00"
    }

    /// Formats integer cents to a plain decimal (e.g., 1250 -> "12.50")
    func centsToDecimal() -> Double {
        Double(self) / 100.0
    }

    /// Formats basis points to percentage (e.g., 1000 -> "10%")
    func basisPointsToPercent() -> String {
        let percent = Double(self) / 100.0
        return String(format: "%.2f%%", percent)
    }

    /// Formats minutes to hours:minutes (e.g., 150 -> "2h 30m")
    func minutesToHoursMinutes() -> String {
        let hours = self / 60
        let minutes = self % 60
        if hours > 0 && minutes > 0 {
            return "\(hours)h \(minutes)m"
        } else if hours > 0 {
            return "\(hours)h"
        } else {
            return "\(minutes)m"
        }
    }

    /// Formats quantity (2 decimal places as int, e.g., 150 -> "1.50")
    func asQuantity() -> String {
        String(format: "%.2f", Double(self) / 100.0)
    }
}

extension Double {
    /// Converts a decimal dollar amount to integer cents
    var toCents: Int {
        Int((self * 100).rounded())
    }
}

// MARK: - Date Formatting

extension Date {
    func formatted(as style: DateStyle) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        switch style {
        case .short:
            formatter.dateStyle = .short
        case .medium:
            formatter.dateStyle = .medium
        case .long:
            formatter.dateStyle = .long
        case .iso:
            formatter.dateFormat = "yyyy-MM-dd"
        case .monthYear:
            formatter.dateFormat = "MMMM yyyy"
        case .relative:
            let relative = RelativeDateTimeFormatter()
            relative.unitsStyle = .abbreviated
            return relative.localizedString(for: self, relativeTo: Date())
        }
        return formatter.string(from: self)
    }

    enum DateStyle {
        case short, medium, long, iso, monthYear, relative
    }

    static func fromISO(_ string: String?) -> Date? {
        guard let string = string else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }
}
