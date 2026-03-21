import Foundation

actor BankService {
    private let api = APIClient.shared

    // MARK: - Bank Accounts

    func listAccounts(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<BankAccount> {
        try await api.requestPaginated(APIEndpoint(path: "/bank-accounts"), page: page, limit: limit)
    }

    func getAccount(id: String) async throws -> BankAccount {
        try await api.request(APIEndpoint(path: "/bank-accounts/\(id)"))
    }

    func createAccount(_ account: BankAccountCreate) async throws -> BankAccount {
        try await api.request(APIEndpoint(path: "/bank-accounts", method: .post), body: account)
    }

    func deleteAccount(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/bank-accounts/\(id)", method: .delete))
    }

    // MARK: - Transactions

    func listTransactions(accountId: String, page: Int = 1, limit: Int = 50, status: String? = nil) async throws -> PaginatedResponse<BankTransaction> {
        var query: [URLQueryItem] = []
        query.append(URLQueryItem(name: "bankAccountId", value: accountId))
        if let status = status { query.append(URLQueryItem(name: "status", value: status)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/bank-transactions", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func categorizeTransaction(id: String, accountId: String) async throws {
        struct Body: Encodable { let accountId: String }
        try await api.requestVoid(
            APIEndpoint(path: "/bank-transactions/\(id)/categorize", method: .post),
            body: Body(accountId: accountId)
        )
    }

    // MARK: - Reconciliation

    func startReconciliation(accountId: String, closingBalance: Int) async throws {
        struct Body: Encodable {
            let bankAccountId: String
            let closingBalance: Int
        }
        try await api.requestVoid(
            APIEndpoint(path: "/bank-reconciliation", method: .post),
            body: Body(bankAccountId: accountId, closingBalance: closingBalance)
        )
    }
}
