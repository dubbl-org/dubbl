import Foundation

actor ExpenseService {
    private let api = APIClient.shared

    func list(page: Int = 1, limit: Int = 50, status: String? = nil) async throws -> PaginatedResponse<ExpenseClaim> {
        var query: [URLQueryItem] = []
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/expenses", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func get(id: String) async throws -> ExpenseClaim {
        try await api.request(APIEndpoint(path: "/expenses/\(id)"))
    }

    func create(_ expense: ExpenseClaimCreate) async throws -> ExpenseClaim {
        try await api.request(APIEndpoint(path: "/expenses", method: .post), body: expense)
    }

    func update(id: String, _ expense: ExpenseClaimCreate) async throws -> ExpenseClaim {
        try await api.request(APIEndpoint(path: "/expenses/\(id)", method: .patch), body: expense)
    }

    func delete(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/expenses/\(id)", method: .delete))
    }

    func submit(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/expenses/\(id)/submit", method: .post))
    }

    func approve(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/expenses/\(id)/approve", method: .post))
    }
}
