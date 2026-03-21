import Foundation

struct Report: Codable, Identifiable {
    let id: String?
    let type: String?
    let title: String?
    let data: ReportData?
    let generatedAt: Date?

    var displayId: String { id ?? UUID().uuidString }
}

struct ReportData: Codable {
    let rows: [[String: AnyCodable]]?
    let summary: [String: AnyCodable]?
    let columns: [ReportColumn]?
}

struct ReportColumn: Codable {
    let key: String?
    let label: String?
    let type: String?
}

/// Type-erased Codable wrapper for dynamic JSON values
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            value = ""
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let string = value as? String {
            try container.encode(string)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else {
            try container.encodeNil()
        }
    }

    var stringValue: String {
        if let string = value as? String { return string }
        if let int = value as? Int { return "\(int)" }
        if let double = value as? Double { return String(format: "%.2f", double) }
        if let bool = value as? Bool { return bool ? "Yes" : "No" }
        return ""
    }
}

enum ReportType: String, CaseIterable {
    case trialBalance = "trial_balance"
    case generalLedger = "general_ledger"
    case balanceSheet = "balance_sheet"
    case incomeStatement = "income_statement"
    case agedReceivables = "aged_receivables"
    case agedPayables = "aged_payables"
    case cashFlow = "cash_flow"
    case accountTransactions = "account_transactions"
    case budgetVsActual = "budget_vs_actual"

    var displayName: String {
        switch self {
        case .trialBalance: return "Trial Balance"
        case .generalLedger: return "General Ledger"
        case .balanceSheet: return "Balance Sheet"
        case .incomeStatement: return "Income Statement"
        case .agedReceivables: return "Aged Receivables"
        case .agedPayables: return "Aged Payables"
        case .cashFlow: return "Cash Flow"
        case .accountTransactions: return "Account Transactions"
        case .budgetVsActual: return "Budget vs Actual"
        }
    }

    var icon: String {
        switch self {
        case .trialBalance: return "scale.3d"
        case .generalLedger: return "book"
        case .balanceSheet: return "chart.bar"
        case .incomeStatement: return "chart.line.uptrend.xyaxis"
        case .agedReceivables: return "arrow.down.circle"
        case .agedPayables: return "arrow.up.circle"
        case .cashFlow: return "water.waves"
        case .accountTransactions: return "list.bullet.rectangle"
        case .budgetVsActual: return "chart.bar.xaxis"
        }
    }
}
