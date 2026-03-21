import Foundation

struct ExpenseClaim: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let title: String?
    let description: String?
    let submittedBy: String?
    let status: ExpenseStatus?
    let totalAmount: Int?
    let currencyCode: String?
    let approvedBy: String?
    let approvedAt: Date?
    let rejectionReason: String?
    let paidAt: Date?
    let createdAt: Date?
    let updatedAt: Date?
    let items: [ExpenseItem]?
}

enum ExpenseStatus: String, Codable, CaseIterable {
    case draft, submitted, approved, rejected, paid

    var displayName: String { rawValue.capitalized }
}

struct ExpenseItem: Codable, Identifiable {
    let id: String
    let expenseClaimId: String?
    let date: String?
    let description: String?
    let amount: Int?
    let category: String?
    let accountId: String?
    let costCenterId: String?
    let receiptFileKey: String?
    let receiptFileName: String?
    let isMileage: Bool?
    let distanceMiles: Int?
    let mileageRate: Int?
    let sortOrder: Int?
}

struct ExpenseClaimCreate: Encodable {
    var title: String
    var description: String?
    var currencyCode: String?
    var items: [ExpenseItemCreate]
}

struct ExpenseItemCreate: Encodable {
    var date: String
    var description: String
    var amount: Int
    var category: String?
    var accountId: String?
    var isMileage: Bool?
    var distanceMiles: Int?
}
