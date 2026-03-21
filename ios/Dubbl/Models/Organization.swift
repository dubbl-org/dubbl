import Foundation

struct Organization: Codable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let logo: String?
    let country: String?
    let businessType: String?
    let defaultCurrency: String?
    let fiscalYearStartMonth: Int?
    let countryCode: String?
    let taxId: String?
    let businessRegistrationNumber: String?
    let legalEntityType: String?
    let street: String?
    let city: String?
    let state: String?
    let postalCode: String?
    let contactPhone: String?
    let contactEmail: String?
    let contactWebsite: String?
    let defaultPaymentTerms: Int?
    let industrySector: String?
    let mileageRate: Int?
    let createdAt: Date?
    let updatedAt: Date?
}

struct OrganizationUpdate: Encodable {
    var name: String?
    var logo: String?
    var country: String?
    var businessType: String?
    var defaultCurrency: String?
    var fiscalYearStartMonth: Int?
    var taxId: String?
    var street: String?
    var city: String?
    var state: String?
    var postalCode: String?
    var contactPhone: String?
    var contactEmail: String?
    var contactWebsite: String?
    var defaultPaymentTerms: Int?
}

struct Member: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let userId: String?
    let role: String?
    let createdAt: Date?
    let user: MemberUser?
}

struct MemberUser: Codable {
    let id: String?
    let name: String?
    let email: String?
    let image: String?
}

struct Invitation: Codable, Identifiable {
    let id: String
    let email: String
    let role: String?
    let status: String?
    let createdAt: Date?
}
