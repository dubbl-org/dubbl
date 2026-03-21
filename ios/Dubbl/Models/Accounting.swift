import Foundation

// MARK: - Chart of Accounts

struct ChartAccount: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let code: String?
    let name: String
    let type: AccountType?
    let subType: String?
    let parentId: String?
    let currencyCode: String?
    let isActive: Bool?
    let description: String?
    let createdAt: Date?
}

enum AccountType: String, Codable, CaseIterable {
    case asset, liability, equity, revenue, expense

    var displayName: String { rawValue.capitalized }

    var icon: String {
        switch self {
        case .asset: return "building.2"
        case .liability: return "creditcard"
        case .equity: return "chart.pie"
        case .revenue: return "arrow.down.circle"
        case .expense: return "arrow.up.circle"
        }
    }
}

struct ChartAccountCreate: Encodable {
    var code: String
    var name: String
    var type: String
    var subType: String?
    var parentId: String?
    var currencyCode: String?
    var description: String?
}

// MARK: - Journal Entries

struct JournalEntry: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let entryNumber: String?
    let date: String?
    let description: String?
    let reference: String?
    let status: JournalEntryStatus?
    let sourceType: String?
    let sourceId: String?
    let createdBy: String?
    let postedAt: Date?
    let voidedAt: Date?
    let voidReason: String?
    let createdAt: Date?
    let updatedAt: Date?
    let lines: [JournalLine]?
}

enum JournalEntryStatus: String, Codable, CaseIterable {
    case draft, posted, void

    var displayName: String { rawValue.capitalized }
}

struct JournalLine: Codable, Identifiable {
    let id: String
    let journalEntryId: String?
    let accountId: String?
    let description: String?
    let debitAmount: Int?
    let creditAmount: Int?
    let currencyCode: String?
    let exchangeRate: Int?
    let costCenterId: String?
    let account: ChartAccount?
}

struct JournalEntryCreate: Encodable {
    var date: String
    var description: String?
    var reference: String?
    var lines: [JournalLineCreate]
}

struct JournalLineCreate: Encodable {
    var accountId: String
    var description: String?
    var debitAmount: Int?
    var creditAmount: Int?
}

// MARK: - Tax Rates

struct TaxRate: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let rate: Int?
    let type: String?
    let isDefault: Bool?
    let isActive: Bool?
    let createdAt: Date?
}

// MARK: - Cost Centers

struct CostCenter: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let code: String?
    let name: String
    let isActive: Bool?
    let parentId: String?
    let createdAt: Date?
}

// MARK: - Fiscal Years

struct FiscalYear: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String?
    let startDate: String?
    let endDate: String?
    let isClosed: Bool?
}
