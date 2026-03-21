import Foundation

struct PayrollEmployee: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let memberId: String?
    let name: String
    let email: String?
    let employeeNumber: String?
    let position: String?
    let department: String?
    let hireDate: String?
    let terminationDate: String?
    let compensationType: String?
    let compensationAmount: Int?
    let hourlyRate: Int?
    let payFrequency: String?
    let taxFilingStatus: String?
    let createdAt: Date?
    let updatedAt: Date?
}

struct PayRun: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let payRunNumber: String?
    let startDate: String?
    let endDate: String?
    let runType: String?
    let status: PayRunStatus?
    let totalGrossPay: Int?
    let totalDeductions: Int?
    let totalNetPay: Int?
    let processedAt: Date?
    let createdAt: Date?
    let updatedAt: Date?
    let items: [PayrollItem]?
}

enum PayRunStatus: String, Codable, CaseIterable {
    case draft, processing, completed, void
    case pendingApproval = "pending_approval"

    var displayName: String {
        switch self {
        case .draft: return "Draft"
        case .processing: return "Processing"
        case .completed: return "Completed"
        case .void: return "Void"
        case .pendingApproval: return "Pending Approval"
        }
    }
}

struct PayrollItem: Codable, Identifiable {
    let id: String
    let payrollRunId: String?
    let payrollEmployeeId: String?
    let itemType: String?
    let amount: Int?
    let quantity: Int?
    let description: String?
    let isPreTax: Bool?
}

struct Payslip: Codable, Identifiable {
    let id: String
    let payrollRunId: String?
    let payrollEmployeeId: String?
    let payslipNumber: String?
    let payDate: String?
    let status: String?
    let grossPay: Int?
    let totalDeductions: Int?
    let netPay: Int?
    let sentAt: Date?
    let viewedAt: Date?
    let createdAt: Date?
}

struct LeaveRequest: Codable, Identifiable {
    let id: String
    let payrollEmployeeId: String?
    let leaveType: String?
    let startDate: String?
    let endDate: String?
    let status: String?
    let reason: String?
    let approvedAt: Date?
    let createdAt: Date?
}

struct Timesheet: Codable, Identifiable {
    let id: String
    let payrollEmployeeId: String?
    let weekStartDate: String?
    let status: String?
    let totalHours: Int?
    let approvedAt: Date?
    let createdAt: Date?
}
