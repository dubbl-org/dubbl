import SwiftUI

/// Projects, inventory, teams, CRM and documents.
@MainActor
enum OperationsCatalog {
    static let specs: [RecordSpec] = [
        projects,
        inventoryItems, inventoryCategories, inventoryLocations, inventoryTransfers, inventoryStockTakes, inventoryBOM,
        teams, teamMembers,
        crmDeals,
    ]

    static let screens: [RecordScreen] = [
        RecordScreen(key: "inventory-items-screen", webPath: "/inventory", title: "Items") { AnyView(InventoryItemsView()) },
        RecordScreen(key: "inventory-alerts", webPath: "/inventory/alerts", title: "Reorder alerts") { AnyView(InventoryAlertsView()) },
        RecordScreen(key: "inventory-transfers-screen", webPath: "/inventory/transfers", title: "Transfers") { AnyView(InventoryTransfersView()) },
        RecordScreen(key: "inventory-assembly", webPath: "/inventory/assembly", title: "Assembly orders") { AnyView(InventoryAssemblyView()) },
        RecordScreen(key: "inventory-valuation", webPath: "/inventory/valuation", title: "Stock value") { AnyView(InventoryValuationView()) },
        RecordScreen(key: "crm-pipeline", webPath: "/crm", title: "Pipeline") { AnyView(CRMPipelineView()) },
        RecordScreen(key: "crm-activities", webPath: "/crm/activities", title: "Activities") { AnyView(CRMActivitiesView()) },
        RecordScreen(key: "crm-analytics", webPath: "/crm/analytics", title: "Analytics") { AnyView(CRMAnalyticsView()) },
        RecordScreen(key: "crm-pipelines", webPath: "/crm/pipelines", title: "Pipelines and stages") { AnyView(CRMPipelinesView()) },
        RecordScreen(key: "documents", webPath: "/documents", title: "All files") { AnyView(DocumentsBrowserView(view: "folder")) },
        RecordScreen(key: "documents-attachments", webPath: "/documents/attachments", title: "Attachments") { AnyView(DocumentsBrowserView(view: "linked")) },
        RecordScreen(key: "documents-unlinked", webPath: "/documents/unlinked", title: "Unlinked") { AnyView(DocumentsBrowserView(view: "unlinked")) },
        RecordScreen(key: "documents-emails", webPath: "/documents/emails", title: "Sent emails") { AnyView(DocumentsEmailsView()) },
    ]

    // MARK: Projects

    /// `GET projects` (paginated, `status=`, no search) with contact, members
    /// and tasks; `GET projects/{id}` adds time entries, milestones and notes.
    static let projects = RecordSpec(
        key: "projects",
        webPath: "/projects",
        title: "Projects",
        singular: "Project",
        symbol: "square.stack.3d.up",
        endpoint: "projects",
        detailKey: "project",
        searchParam: nil,
        statuses: Projects.statuses.map { RecordStatus($0.value, $0.label) },
        row: RecordRow(title: ["name"], subtitle: ["contact.name", "billingType"], amount: "budget", currency: "currency", date: "endDate"),
        tones: ["active": .positive, "completed": .info, "on_hold": .warning, "archived": .neutral],
        totals: [
            RecordTotal(label: "Active budgets", field: "budget", statuses: ["active"], tone: .positive),
            RecordTotal(label: "Billed", field: "totalBilled", tone: .info),
        ],
        create: { done in AnyView(ProjectsNewSheet(onCreated: done)) },
        detail: { id in AnyView(ProjectsDetailView(id: id)) },
        emptyMessage: "Track budgets, time and profit for each job.",
        tillyPrompt: "Which projects are over budget?"
    )

    // MARK: Inventory

    /// Items open in their own screen; the list itself is `InventoryItemsView`.
    static let inventoryItems = RecordSpec(
        key: "inventory-items",
        webPath: "/inventory",
        title: "Items",
        singular: "Item",
        symbol: "shippingbox",
        endpoint: "inventory",
        detailKey: "inventoryItem",
        statuses: [RecordStatus("active", "Active"), RecordStatus("low_stock", "Low stock"), RecordStatus("inactive", "Inactive")],
        row: RecordRow(title: ["name"], subtitle: ["sku"], number: "code", amount: "salePrice", status: nil),
        detail: { id in AnyView(InventoryItemView(id: id)) }
    )

    /// `GET inventory/categories` -> `{ data: tree, flat }`; no detail route.
    static let inventoryCategories = RecordSpec(
        key: "inventory-categories",
        webPath: "/inventory/categories",
        title: "Categories",
        singular: "Category",
        symbol: "folder",
        endpoint: "inventory/categories",
        listKey: "flat",
        paged: false,
        hasDetail: false,
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["description"], status: nil),
        create: { done in AnyView(InventoryNewCategorySheet(onCreated: done)) },
        emptyMessage: "Group items into categories like Stationery or Packaging."
    )

    /// `GET warehouses` -> `{ data }` (not under /inventory), `GET warehouses/{id}/stock`.
    static let inventoryLocations = RecordSpec(
        key: "inventory-locations",
        webPath: "/inventory/warehouses",
        title: "Locations",
        singular: "Location",
        symbol: "mappin.and.ellipse",
        endpoint: "warehouses",
        listKey: "data",
        paged: false,
        detailKey: "warehouse",
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["address"], number: "code", status: nil),
        create: { done in AnyView(InventoryNewLocationSheet(onCreated: done)) },
        detail: { id in AnyView(InventoryLocationView(id: id)) },
        emptyMessage: "Warehouses, shops and stockrooms you keep stock in."
    )

    /// The list is `InventoryTransfersView` (rows read "From → To").
    static let inventoryTransfers = RecordSpec(
        key: "inventory-transfers",
        webPath: "/inventory/transfers",
        title: "Transfers",
        singular: "Transfer",
        symbol: "arrow.left.arrow.right",
        endpoint: "inventory/transfers",
        listKey: "data",
        paged: false,
        detailKey: "transfer",
        searchParam: nil,
        row: RecordRow(title: ["fromWarehouse.name"], subtitle: ["toWarehouse.name"]),
        detail: { id in AnyView(InventoryTransferView(id: id)) }
    )

    /// `GET stock-takes` -> `{ stockTakes }` (not under /inventory), each with `itemCount`.
    static let inventoryStockTakes = RecordSpec(
        key: "inventory-stock-takes",
        webPath: "/inventory/stock-takes",
        title: "Stocktakes",
        singular: "Stocktake",
        symbol: "checklist",
        endpoint: "stock-takes",
        listKey: "stockTakes",
        paged: false,
        detailKey: "stockTake",
        searchParam: nil,
        statuses: [
            RecordStatus("draft", "Draft"), RecordStatus("in_progress", "Counting"),
            RecordStatus("completed", "Completed"), RecordStatus("cancelled", "Cancelled"),
        ],
        row: RecordRow(title: ["name"], subtitle: ["notes"], date: "createdAt"),
        tones: ["in_progress": .info],
        create: { done in AnyView(InventoryNewStockTakeSheet(onCreated: done)) },
        detail: { id in AnyView(InventoryStockTakeView(id: id)) },
        emptyMessage: "Count what's on the shelf and fix the books in one go."
    )

    /// `GET inventory/bom` with assembly item and components; detail adds `costBreakdown`.
    static let inventoryBOM = RecordSpec(
        key: "inventory-bom",
        webPath: "/inventory/bom",
        title: "Bills of materials",
        singular: "Bill of materials",
        symbol: "list.bullet.indent",
        endpoint: "inventory/bom",
        listKey: "data",
        paged: false,
        detailKey: "bom",
        searchParam: nil,
        row: RecordRow(title: ["assemblyItem.name", "name"], subtitle: ["name"], status: nil),
        detail: { id in AnyView(InventoryBOMView(id: id)) },
        emptyMessage: "Recipes for the things you make from other items. Set them up on the web."
    )

    // MARK: Teams

    /// `GET teams` (paginated, `search=`); `GET teams/{id}` has members with users.
    static let teams = RecordSpec(
        key: "teams",
        webPath: "/teams",
        title: "Teams",
        singular: "Team",
        symbol: "person.3",
        endpoint: "teams",
        detailKey: "team",
        row: RecordRow(title: ["name"], subtitle: ["description"], status: nil, avatar: true),
        create: { done in AnyView(TeamsNewSheet(onCreated: done)) },
        detail: { id in AnyView(TeamsDetailView(id: id)) },
        emptyMessage: "Group people into teams like Design or Sales.",
        tillyPrompt: "Who's on which team?"
    )

    /// `GET members` -> `{ members }`, not paginated; search runs on the device.
    static let teamMembers = RecordSpec(
        key: "teams-members",
        webPath: "/teams/members",
        title: "Members",
        singular: "Member",
        symbol: "person.2",
        endpoint: "members",
        listKey: "members",
        paged: false,
        hasDetail: false,
        searchParam: nil,
        row: RecordRow(title: ["userName", "userEmail"], subtitle: ["userEmail", "customRoleName"], status: "role", avatar: true),
        tones: ["owner": .special, "admin": .info, "member": .neutral],
        emptyMessage: "People in this organization."
    )

    // MARK: CRM

    /// `GET crm/deals` (paginated, `stageId=`, `search=` on title) with contact,
    /// owner and pipeline. Deals have no status column, so the list filters by
    /// stage; won and lost deals sit in `closed_won` / `closed_lost`.
    static let crmDeals = RecordSpec(
        key: "crm-deals",
        webPath: "/crm/deals",
        title: "Deals",
        singular: "Deal",
        symbol: "briefcase",
        endpoint: "crm/deals",
        detailKey: "deal",
        statuses: CRM.defaultStages.map { RecordStatus($0.id, $0.name) },
        statusParam: "stageId",
        row: RecordRow(title: ["title"], subtitle: ["contact.name"], amount: "valueCents", currency: "currency", status: "stageId", date: "expectedCloseDate"),
        tones: ["lead": .neutral, "qualified": .info, "proposal": .special, "negotiation": .warning, CRM.wonStage: .positive, CRM.lostStage: .negative],
        totals: [
            RecordTotal(label: "Open", field: "valueCents", statuses: ["lead", "qualified", "proposal", "negotiation"], tone: .info),
            RecordTotal(label: "Won", field: "valueCents", statuses: [CRM.wonStage], tone: .positive),
        ],
        create: { done in AnyView(CRMNewDealSheet(onCreated: done)) },
        detail: { id in AnyView(CRMDealView(id: id)) },
        emptyMessage: "Deals you're working on show up here.",
        tillyPrompt: "Which deals are most likely to close this month?"
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = OperationsFixtures.all
    #endif
}
