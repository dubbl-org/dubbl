import Foundation

struct BankAccount: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let accountName: String
    let accountNumber: String?
    let bankName: String?
    let currencyCode: String?
    let countryCode: String?
    let accountType: BankAccountType?
    let color: String?
    let chartAccountId: String?
    let balance: Int?
    let lowBalanceThreshold: Int?
    let isActive: Bool?
    let createdAt: Date?
}

enum BankAccountType: String, Codable, CaseIterable {
    case checking, savings, creditCard = "credit_card", cash, loan, investment, other

    var displayName: String {
        switch self {
        case .checking: return "Checking"
        case .savings: return "Savings"
        case .creditCard: return "Credit Card"
        case .cash: return "Cash"
        case .loan: return "Loan"
        case .investment: return "Investment"
        case .other: return "Other"
        }
    }

    var icon: String {
        switch self {
        case .checking: return "building.columns"
        case .savings: return "banknote"
        case .creditCard: return "creditcard"
        case .cash: return "dollarsign.circle"
        case .loan: return "arrow.left.arrow.right"
        case .investment: return "chart.line.uptrend.xyaxis"
        case .other: return "ellipsis.circle"
        }
    }
}

struct BankTransaction: Codable, Identifiable {
    let id: String
    let bankAccountId: String?
    let date: String?
    let description: String?
    let reference: String?
    let amount: Int?
    let balance: Int?
    let status: BankTransactionStatus?
    let mappedJournalEntryId: String?
}

enum BankTransactionStatus: String, Codable {
    case unreconciled, reconciled, excluded
}

struct BankAccountCreate: Encodable {
    var accountName: String
    var accountNumber: String?
    var bankName: String?
    var currencyCode: String?
    var accountType: String = "checking"
    var color: String?
}
