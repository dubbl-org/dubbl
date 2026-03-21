import Foundation

struct InventoryItem: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let code: String?
    let name: String
    let description: String?
    let imageUrl: String?
    let categoryId: String?
    let sku: String?
    let purchasePrice: Int?
    let salePrice: Int?
    let costAccountId: String?
    let revenueAccountId: String?
    let inventoryAccountId: String?
    let quantityOnHand: Int?
    let reorderPoint: Int?
    let trackingMethod: String?
    let isActive: Bool?
    let createdAt: Date?
    let updatedAt: Date?
    let category: InventoryCategory?
}

struct InventoryCategory: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let color: String?
    let description: String?
    let parentId: String?
}

struct Warehouse: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let name: String
    let code: String?
    let address: String?
    let isDefault: Bool?
    let isActive: Bool?
}

struct InventoryMovement: Codable, Identifiable {
    let id: String
    let organizationId: String?
    let inventoryItemId: String?
    let warehouseId: String?
    let type: String?
    let quantity: Int?
    let previousQuantity: Int?
    let newQuantity: Int?
    let reference: String?
    let reason: String?
    let createdAt: Date?
}

struct InventoryItemCreate: Encodable {
    var code: String
    var name: String
    var description: String?
    var sku: String?
    var purchasePrice: Int?
    var salePrice: Int?
    var quantityOnHand: Int?
    var reorderPoint: Int?
    var categoryId: String?
    var trackingMethod: String?
}
