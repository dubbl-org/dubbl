import Foundation

actor InventoryService {
    private let api = APIClient.shared

    func listItems(page: Int = 1, limit: Int = 50, search: String? = nil) async throws -> PaginatedResponse<InventoryItem> {
        var query: [URLQueryItem] = []
        if let search = search, !search.isEmpty { query.append(URLQueryItem(name: "search", value: search)) }
        return try await api.requestPaginated(
            APIEndpoint(path: "/inventory-items", queryItems: query),
            page: page,
            limit: limit
        )
    }

    func getItem(id: String) async throws -> InventoryItem {
        try await api.request(APIEndpoint(path: "/inventory-items/\(id)"))
    }

    func createItem(_ item: InventoryItemCreate) async throws -> InventoryItem {
        try await api.request(APIEndpoint(path: "/inventory-items", method: .post), body: item)
    }

    func updateItem(id: String, _ item: InventoryItemCreate) async throws -> InventoryItem {
        try await api.request(APIEndpoint(path: "/inventory-items/\(id)", method: .patch), body: item)
    }

    func deleteItem(id: String) async throws {
        try await api.requestVoid(APIEndpoint(path: "/inventory-items/\(id)", method: .delete))
    }

    func listWarehouses() async throws -> PaginatedResponse<Warehouse> {
        try await api.requestPaginated(APIEndpoint(path: "/warehouses"), page: 1, limit: 100)
    }

    func listMovements(itemId: String, page: Int = 1) async throws -> PaginatedResponse<InventoryMovement> {
        let query = [URLQueryItem(name: "inventoryItemId", value: itemId)]
        return try await api.requestPaginated(
            APIEndpoint(path: "/inventory-movements", queryItems: query),
            page: page
        )
    }

    func listCategories() async throws -> PaginatedResponse<InventoryCategory> {
        try await api.requestPaginated(APIEndpoint(path: "/inventory-items/categories"), page: 1, limit: 100)
    }
}
