import Foundation

struct Pipeline: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let stages: [PipelineStage]?
    let isDefault: Bool?
    let createdAt: Date?
}

struct PipelineStage: Codable, Identifiable {
    let id: String
    let name: String
    let color: String?
}

struct Deal: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let pipelineId: String?
    let contactId: String?
    let stageId: String?
    let title: String
    let valueCents: Int?
    let currency: String?
    let probability: Int?
    let expectedCloseDate: String?
    let assignedTo: String?
    let source: DealSource?
    let notes: String?
    let wonAt: Date?
    let lostAt: Date?
    let lostReason: String?
    let createdAt: Date?
    let updatedAt: Date?
    let contact: Contact?
    let pipeline: Pipeline?
}

enum DealSource: String, Codable, CaseIterable {
    case website, referral
    case coldOutreach = "cold_outreach"
    case event, other

    var displayName: String {
        switch self {
        case .website: return "Website"
        case .referral: return "Referral"
        case .coldOutreach: return "Cold Outreach"
        case .event: return "Event"
        case .other: return "Other"
        }
    }
}

struct DealActivity: Codable, Identifiable {
    let id: String
    let dealId: String?
    let userId: String?
    let type: String?
    let content: String?
    let scheduledAt: Date?
    let completedAt: Date?
    let createdAt: Date?
}

struct DealCreate: Encodable {
    var pipelineId: String
    var contactId: String?
    var stageId: String
    var title: String
    var valueCents: Int?
    var currency: String?
    var probability: Int?
    var expectedCloseDate: String?
    var source: String?
    var notes: String?
}
