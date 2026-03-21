import Foundation

struct Bill: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let contactId: String?
    let billNumber: String?
    let issueDate: String?
    let dueDate: String?
    let status: BillStatus?
    let reference: String?
    let notes: String?
    let subtotal: Int?
    let taxTotal: Int?
    let total: Int?
    let amountPaid: Int?
    let amountDue: Int?
    let currencyCode: String?
    let approvedBy: String?
    let approvedAt: Date?
    let rejectionReason: String?
    let createdAt: Date?
    let updatedAt: Date?
    let contact: Contact?
    let lines: [BillLine]?
}

enum BillStatus: String, Codable, CaseIterable {
    case draft
    case pendingApproval = "pending_approval"
    case received
    case partial
    case paid
    case overdue
    case void

    var displayName: String {
        switch self {
        case .draft: return "Draft"
        case .pendingApproval: return "Pending Approval"
        case .received: return "Received"
        case .partial: return "Partial"
        case .paid: return "Paid"
        case .overdue: return "Overdue"
        case .void: return "Void"
        }
    }
}

struct BillLine: Codable, Identifiable {
    let id: String
    let billId: String?
    let description: String?
    let quantity: Int?
    let unitPrice: Int?
    let accountId: String?
    let taxRateId: String?
    let discountPercent: Int?
    let taxAmount: Int?
    let amount: Int?
    let sortOrder: Int?
}

struct BillCreate: Encodable {
    var contactId: String
    var issueDate: String
    var dueDate: String
    var reference: String?
    var notes: String?
    var currencyCode: String?
    var lines: [BillLineCreate]
}

struct BillLineCreate: Encodable {
    var description: String
    var quantity: Int
    var unitPrice: Int
    var accountId: String?
    var taxRateId: String?
}
