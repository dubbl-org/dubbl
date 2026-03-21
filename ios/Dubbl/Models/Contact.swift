import Foundation

struct Contact: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let email: String?
    let phone: String?
    let taxNumber: String?
    let type: ContactType?
    let paymentTermsDays: Int?
    let creditLimit: Int?
    let isTaxExempt: Bool?
    let notes: String?
    let currencyCode: String?
    let createdAt: Date?
    let updatedAt: Date?
    let persons: [ContactPerson]?
}

enum ContactType: String, Codable, CaseIterable {
    case customer, supplier, both

    var displayName: String { rawValue.capitalized }
}

struct ContactPerson: Codable, Identifiable {
    let id: String
    let contactId: String?
    let name: String?
    let email: String?
    let phone: String?
    let jobTitle: String?
    let isPrimary: Bool?
}

struct ContactCreate: Encodable {
    var name: String
    var email: String?
    var phone: String?
    var type: String = "customer"
    var taxNumber: String?
    var paymentTermsDays: Int?
    var notes: String?
    var currencyCode: String?
}
