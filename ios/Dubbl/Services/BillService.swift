import Foundation

actor BillService {
    private let api = APIClient.shared

    func list(page: Int = 1, limit: Int = 50, status: String? = nil, search: String? = nil) async throws -> PaginatedResponse<Bill> {
        var query: [URLQueryItem] = []
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        if let search = search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/bills", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func get(id: String) async throws -> Bill {
        try await api.request(APIEndpoint(path: "/bills/\(id)"))
    }

    func create(_ bill: BillCreate) async throws -> Bill {
        try await api.request(APIEndpoint(path: "/bills", method: .post), body: bill)
    }

    func update(id: String, _ bill: BillCreate) async throws -> Bill {
        try await api.request(APIEndpoint(path: "/bills/\(id)", method: .patch), body: bill)
    }

    func delete(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/bills/\(id)", method: .delete))
    }

    func approve(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/bills/\(id)/approve", method: .post))
    }

    func markPaid(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/bills/\(id)/mark-paid", method: .post))
    }
}
