import Foundation

actor ContactService {
    private let api = APIClient.shared

    func list(page: Int = 1, limit: Int = 50, type: String? = nil, search: String? = nil) async throws -> PaginatedResponse<Contact> {
        var query: [URLQueryItem] = []
        if let type = type { query.append(URLQueryItem(name: "type", value: type)) }
        if let search = search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/contacts", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func get(id: String) async throws -> Contact {
        try await api.request(APIEndpoint(path: "/contacts/\(id)"))
    }

    func create(_ contact: ContactCreate) async throws -> Contact {
        try await api.request(APIEndpoint(path: "/contacts", method: .post), body: contact)
    }

    func update(id: String, _ contact: ContactCreate) async throws -> Contact {
        try await api.request(APIEndpoint(path: "/contacts/\(id)", method: .patch), body: contact)
    }

    func delete(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/contacts/\(id)", method: .delete))
    }
}
