import Foundation

struct Project: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let description: String?
    let contactId: String?
    let status: ProjectStatus?
    let priority: String?
    let billingType: String?
    let color: String?
    let budget: Int?
    let hourlyRate: Int?
    let fixedPrice: Int?
    let totalHours: Int?
    let totalBilled: Int?
    let estimatedHours: Int?
    let currency: String?
    let startDate: String?
    let endDate: String?
    let category: String?
    let createdAt: Date?
    let updatedAt: Date?
    let contact: Contact?
}

enum ProjectStatus: String, Codable, CaseIterable {
    case active, completed, onHold = "on_hold", cancelled, archived

    var displayName: String {
        switch self {
        case .active: return "Active"
        case .completed: return "Completed"
        case .onHold: return "On Hold"
        case .cancelled: return "Cancelled"
        case .archived: return "Archived"
        }
    }
}

struct ProjectTask: Codable, Identifiable {
    let id: String
    let projectId: String?
    let title: String
    let description: String?
    let status: TaskStatus?
    let priority: String?
    let assignedTo: String?
    let dueDate: String?
    let startDate: String?
    let estimatedHours: Int?
    let sortOrder: Int?
    let createdAt: Date?
    let updatedAt: Date?
}

enum TaskStatus: String, Codable, CaseIterable {
    case backlog, todo, inProgress = "in_progress", inReview = "in_review", done, cancelled

    var displayName: String {
        switch self {
        case .backlog: return "Backlog"
        case .todo: return "To Do"
        case .inProgress: return "In Progress"
        case .inReview: return "In Review"
        case .done: return "Done"
        case .cancelled: return "Cancelled"
        }
    }
}

struct TimeEntry: Codable, Identifiable {
    let id: String
    let projectId: String?
    let memberId: String?
    let taskId: String?
    let date: String?
    let description: String?
    let duration: Int? // minutes
    let billableAmount: Int? // cents
    let isBillable: Bool?
    let entryNumber: Int?
    let createdAt: Date?
}

struct ProjectMilestone: Codable, Identifiable {
    let id: String
    let projectId: String?
    let name: String
    let description: String?
    let dueDate: String?
    let startDate: String?
    let status: String?
    let progress: Int?
    let createdAt: Date?
}

struct ProjectCreate: Encodable {
    var name: String
    var description: String?
    var contactId: String?
    var status: String?
    var priority: String?
    var billingType: String?
    var color: String?
    var budget: Int?
    var hourlyRate: Int?
    var startDate: String?
    var endDate: String?
}

struct TaskCreate: Encodable {
    var title: String
    var description: String?
    var status: String?
    var priority: String?
    var assignedTo: String?
    var dueDate: String?
    var estimatedHours: Int?
}

struct TimeEntryCreate: Encodable {
    var projectId: String
    var taskId: String?
    var date: String
    var description: String?
    var duration: Int
    var isBillable: Bool?
}
