import Foundation

actor InvoiceService {
    private let api = APIClient.shared

    func list(page: Int = 1, limit: Int = 50, status: String? = nil, search: String? = nil) async throws -> PaginatedResponse<Invoice> {
        var query: [URLQueryItem] = []
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        if let search = search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/invoices", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func get(id: String) async throws -> Invoice {
        try await api.request(APIEndpoint(path: "/invoices/\(id)"))
    }

    func create(_ invoice: InvoiceCreate) async throws -> Invoice {
        try await api.request(APIEndpoint(path: "/invoices", method: .post), body: invoice)
    }

    func update(id: String, _ invoice: InvoiceCreate) async throws -> Invoice {
        try await api.request(APIEndpoint(path: "/invoices/\(id)", method: .patch), body: invoice)
    }

    func delete(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/invoices/\(id)", method: .delete))
    }

    func send(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/invoices/\(id)/send", method: .post))
    }

    func markPaid(id: String, amount: Int? = nil, paymentDate: String? = nil) async throws {
        struct MarkPaidBody: Encodable {
            let amount: Int?
            let paymentDate: String?
        }
        try await api.requestVoid(
            APIEndpoint(path: "/invoices/\(id)/mark-paid", method: .post),
            body: MarkPaidBody(amount: amount, paymentDate: paymentDate)
        )
    }

    func void(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/invoices/\(id)/void", method: .post))
    }
}
