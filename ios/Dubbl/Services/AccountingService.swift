import Foundation

actor AccountingService {
    private let api = APIClient.shared

    // MARK: - Chart of Accounts

    func listAccounts(page: Int = 1, limit: Int = 50, type: String? = nil) async throws -> PaginatedResponse<ChartAccount> {
        var query: [URLQueryItem] = []
        if let type = type { query.append(URLQueryItem(name: "type", value: type)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/accounts", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func getAccount(id: String) async throws -> ChartAccount {
        try await api.request(APIEndpoint(path: "/accounts/\(id)"))
    }

    func createAccount(_ account: ChartAccountCreate) async throws -> ChartAccount {
        try await api.request(APIEndpoint(path: "/accounts", method: .post), body: account)
    }

    func updateAccount(id: String, _ account: ChartAccountCreate) async throws -> ChartAccount {
        try await api.request(APIEndpoint(path: "/accounts/\(id)", method: .patch), body: account)
    }

    func deleteAccount(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/accounts/\(id)", method: .delete))
    }

    // MARK: - Journal Entries

    func listEntries(page: Int = 1, limit: Int = 50, status: String? = nil) async throws -> PaginatedResponse<JournalEntry> {
        var query: [URLQueryItem] = []
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/entries", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func getEntry(id: String) async throws -> JournalEntry {
        try await api.request(APIEndpoint(path: "/entries/\(id)"))
    }

    func createEntry(_ entry: JournalEntryCreate) async throws -> JournalEntry {
        try await api.request(APIEndpoint(path: "/entries", method: .post), body: entry)
    }

    func postEntry(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/entries/\(id)/post", method: .post))
    }

    func voidEntry(id: String, reason: String) async throws {
        struct Body: Encodable { let reason: String }
        try await api.requestVoid(
            APIEndpoint(path: "/entries/\(id)/void", method: .post),
            body: Body(reason: reason)
        )
    }

    // MARK: - Tax Rates

    func listTaxRates() async throws -> PaginatedResponse<TaxRate> {
        try await api.requestPaginated(APIEndpoint(path: "/tax-rates"), page: 1, limit: 100)
    }

    // MARK: - Cost Centers

    func listCostCenters() async throws -> PaginatedResponse<CostCenter> {
        try await api.requestPaginated(APIEndpoint(path: "/cost-centers"), page: 1, limit: 100)
    }

    // MARK: - Reports

    func generateReport(type: String, params: [String: String] = [:]) async throws -> Report {
        var query = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        query.append(URLQueryItem(name: "type", value: type))
        return try await api.request(APIEndpoint(path: "/reports", queryItems: query))
    }
}
