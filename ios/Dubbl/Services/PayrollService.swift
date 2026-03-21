import Foundation

actor PayrollService {
    private let api = APIClient.shared

    // MARK: - Employees

    func listEmployees(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<PayrollEmployee> {
        try await api.requestPaginated(APIEndpoint(path: "/employees"), page: page, limit: limit)
    }

    func getEmployee(id: String) async throws -> PayrollEmployee {
        try await api.request(APIEndpoint(path: "/employees/\(id)"))
    }

    // MARK: - Pay Runs

    func listPayRuns(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<PayRun> {
        try await api.requestPaginated(APIEndpoint(path: "/pay-runs"), page: page, limit: limit)
    }

    func getPayRun(id: String) async throws -> PayRun {
        try await api.request(APIEndpoint(path: "/pay-runs/\(id)"))
    }

    func processPayRun(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/pay-runs/\(id)/process", method: .post))
    }

    // MARK: - Payslips

    func listPayslips(payRunId: String) async throws -> PaginatedResponse<Payslip> {
        let query = [URLQueryItem(name: "payRunId", value: payRunId)]
        return try await api.requestPaginated(
            APIEndpoint(path: "/payslips", queryItems: query),
            page: 1, limit: 100
        )
    }

    // MARK: - Leave

    func listLeaveRequests(page: Int = 1) async throws -> PaginatedResponse<LeaveRequest> {
        try await api.requestPaginated(APIEndpoint(path: "/leave-requests"), page: page)
    }

    // MARK: - Timesheets

    func listTimesheets(page: Int = 1) async throws -> PaginatedResponse<Timesheet> {
        try await api.requestPaginated(APIEndpoint(path: "/timesheets"), page: page)
    }

    func approveTimesheet(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/timesheets/\(id)/approve", method: .post))
    }
}
