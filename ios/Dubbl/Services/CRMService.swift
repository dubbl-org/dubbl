import Foundation

actor CRMService {
    private let api = APIClient.shared

    // MARK: - Pipelines

    func listPipelines() async throws -> PaginatedResponse<Pipeline> {
        try await api.requestPaginated(APIEndpoint(path: "/pipelines"), page: 1, limit: 100)
    }

    func getPipeline(id: String) async throws -> Pipeline {
        try await api.request(APIEndpoint(path: "/pipelines/\(id)"))
    }

    // MARK: - Deals

    func listDeals(page: Int = 1, limit: Int = 50, pipelineId: String? = nil, stageId: String? = nil) async throws -> PaginatedResponse<Deal> {
        var query: [URLQueryItem] = []
        if let pipelineId = pipelineId { query.append(URLQueryItem(name: "pipelineId", value: pipelineId)) }
        if let stageId = stageId { query.append(URLQueryItem(name: "stageId", value: stageId)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/deals", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func getDeal(id: String) async throws -> Deal {
        try await api.request(APIEndpoint(path: "/deals/\(id)"))
    }

    func createDeal(_ deal: DealCreate) async throws -> Deal {
        try await api.request(APIEndpoint(path: "/deals", method: .post), body: deal)
    }

    func updateDeal(id: String, _ deal: DealCreate) async throws -> Deal {
        try await api.request(APIEndpoint(path: "/deals/\(id)", method: .patch), body: deal)
    }

    func deleteDeal(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/deals/\(id)", method: .delete))
    }

    // MARK: - Activities

    func listActivities(dealId: String) async throws -> PaginatedResponse<DealActivity> {
        try await api.requestPaginated(
            APIEndpoint(path: "/deals/\(dealId)/activities"),
            page: 1, limit: 100
        )
    }
}
