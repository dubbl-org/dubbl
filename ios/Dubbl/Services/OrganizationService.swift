import Foundation

actor OrganizationService {
    private let api = APIClient.shared

    // MARK: - Organization

    func get() async throws -> Organization {
        try await api.request(APIEndpoint(path: "/organization"))
    }

    func update(_ org: OrganizationUpdate) async throws -> Organization {
        try await api.request(APIEndpoint(path: "/organization", method: .patch), body: org)
    }

    // MARK: - Members

    func listMembers(page: Int = 1) async throws -> PaginatedResponse<Member> {
        try await api.requestPaginated(APIEndpoint(path: "/members"), page: page)
    }

    func removeMember(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/members/\(id)", method: .delete))
    }

    func updateMemberRole(id: String, role: String) async throws {
        struct Body: Encodable { let role: String }
        try await api.requestVoid(
            APIEndpoint(path: "/members/\(id)", method: .patch),
            body: Body(role: role)
        )
    }

    // MARK: - Invitations

    func listInvitations() async throws -> PaginatedResponse<Invitation> {
        try await api.requestPaginated(APIEndpoint(path: "/invitations"), page: 1, limit: 100)
    }

    func invite(email: String, role: String) async throws {
        struct Body: Encodable { let email: String; let role: String }
        try await api.requestVoid(
            APIEndpoint(path: "/invitations", method: .post),
            body: Body(email: email, role: role)
        )
    }

    // MARK: - Payments

    func listPayments(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<Payment> {
        try await api.requestPaginated(APIEndpoint(path: "/payments"), page: page, limit: limit)
    }

    // MARK: - Quotes

    func listQuotes(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<Quote> {
        try await api.requestPaginated(APIEndpoint(path: "/quotes"), page: page, limit: limit)
    }

    // MARK: - Purchase Orders

    func listPurchaseOrders(page: Int = 1, limit: Int = 50) async throws -> PaginatedResponse<PurchaseOrder> {
        try await api.requestPaginated(APIEndpoint(path: "/purchase-orders"), page: page, limit: limit)
    }

    // MARK: - Credit / Debit Notes

    func listCreditNotes(page: Int = 1) async throws -> PaginatedResponse<CreditNote> {
        try await api.requestPaginated(APIEndpoint(path: "/credit-notes"), page: page)
    }

    func listDebitNotes(page: Int = 1) async throws -> PaginatedResponse<DebitNote> {
        try await api.requestPaginated(APIEndpoint(path: "/debit-notes"), page: page)
    }
}
