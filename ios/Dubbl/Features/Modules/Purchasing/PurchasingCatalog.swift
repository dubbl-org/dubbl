import SwiftUI

/// Purchases extras (recurring bills, supplier credits, recurring expenses, requisitions, purchase orders, goods received, landed costs).
@MainActor
enum PurchasingCatalog {
    static let specs: [RecordSpec] = [supplierCredits, requisitions, purchaseOrders, goodsReceipts, landedCosts]

    static let screens: [RecordScreen] = {
        var screens = [
            // Recurring templates share one route and list (see SalesRecurring).
            RecordScreen(key: "recurring-bills", webPath: "/purchases/bills/recurring", title: "Recurring bills") {
                AnyView(SalesRecurringListView(type: "bill", title: "Recurring bills"))
            },
            RecordScreen(key: "recurring-expenses", webPath: "/purchases/expenses/recurring", title: "Recurring expenses") {
                AnyView(SalesRecurringListView(type: "expense", title: "Recurring expenses"))
            },
        ]
        #if DEBUG
        // Forms as pages for demo screenshots (DUBBL_DEMO_OPEN=page:/purchases/orders/new).
        screens += [
            RecordScreen(key: "debug-new-po", webPath: "/purchases/orders/new", title: "New purchase order") { AnyView(SalesDocumentFormView(kind: purchaseOrderForm)) },
            RecordScreen(key: "debug-receive-po", webPath: "/purchases/orders/receive", title: "Receive goods") { AnyView(SalesDebugSheetPage { PurchasingReceiveSheet(orderID: "demo-po-61") {} }) },
        ]
        #endif
        return screens
    }()

    // MARK: Supplier credits

    static let supplierCreditForm = SalesDocumentKind(
        title: "New supplier credit",
        singular: "Supplier credit",
        party: .supplier,
        endpoint: "debit-notes",
        responseKey: "debitNote",
        numberKey: "debitNoteNumber",
        referencePlaceholder: "Bill number or return reference",
        notesPlaceholder: "What's being credited and why",
        finish: .init(title: "Save and mark as sent", path: "send", done: "marked as sent"),
        specKey: "debit-notes"
    )

    /// `GET debit-notes` (paginated, `status=` draft|sent|applied|void),
    /// `GET debit-notes/{id}` -> `{ debitNote }`. Sent credits are applied to
    /// the supplier's bills with `POST apply { billId, amount }`.
    static let supplierCredits: RecordSpec = RecordSpec(
        key: "debit-notes",
        webPath: "/purchases/debit-notes",
        title: "Supplier credits",
        singular: "Supplier credit",
        symbol: "arrow.uturn.backward.circle",
        endpoint: "debit-notes",
        detailKey: "debitNote",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("sent", "Sent"), RecordStatus("applied", "Applied"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["contact.name"], number: "debitNoteNumber", amount: "total", date: "issueDate"),
        actions: [
            RecordAction(title: "Mark as sent", symbol: "paperplane", path: "send", statuses: ["draft"], primary: true),
            RecordAction(title: "Void", symbol: "xmark.circle", path: "void", statuses: ["draft", "sent", "applied"], destructive: true, confirm: "Void this supplier credit?"),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft"], destructive: true, confirm: "Delete this supplier credit?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "Unused", field: "amountRemaining", statuses: ["sent", "applied"], tone: .info),
            RecordTotal(label: "Applied", field: "amountApplied", tone: .positive),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: supplierCreditForm, onCreated: done)) },
        detail: { id in
            AnyView(SalesDetailHost(spec: supplierCredits, id: id, actions: [
                SalesHostAction(title: "Apply to bill", symbol: "arrow.right.doc.on.clipboard", statuses: ["sent", "applied"], when: { ($0["amountRemaining"]?.intValue ?? 0) > 0 }) { record, done in
                    AnyView(SalesApplySheet(
                        title: "Apply supplier credit", target: .bill, contactID: record["contactId"]?.stringValue,
                        currency: record["currencyCode"]?.stringValue ?? "USD", available: record["amountRemaining"]?.intValue ?? 0,
                        path: "debit-notes/\(id)/apply", done: done
                    ))
                },
            ]))
        },
        emptyMessage: "Credits and refunds suppliers owe you show up here.",
        tillyPrompt: "Which supplier credits haven't been used yet?"
    )

    // MARK: Requisitions

    static let requisitionForm = SalesDocumentKind(
        title: "New requisition",
        singular: "Requisition",
        party: .supplier,
        partyOptional: true,
        endpoint: "purchase-requisitions",
        responseKey: "requisition",
        numberKey: "requisitionNumber",
        dateLabel: "Requested",
        dateKey: "requestDate",
        secondDate: .init(label: "Needed by", key: "requiredDate", days: 14, optional: true),
        sendsCurrency: false,
        referencePlaceholder: "Project or cost centre",
        notesPlaceholder: "What it's for",
        specKey: "purchase-requisitions"
    )

    /// `GET purchase-requisitions` (paginated, `status=`), `GET
    /// purchase-requisitions/{id}` -> the bare record with contact and lines.
    /// Approve/reject act on submitted ones; convert turns an approved one with
    /// a supplier into a purchase order.
    static let requisitions: RecordSpec = RecordSpec(
        key: "purchase-requisitions",
        webPath: "/purchases/requisitions",
        title: "Requisitions",
        singular: "Requisition",
        symbol: "list.clipboard",
        endpoint: "purchase-requisitions",
        searchParam: nil,
        statuses: [
            RecordStatus("draft", "Draft"), RecordStatus("submitted", "Waiting for approval"), RecordStatus("approved", "Approved"),
            RecordStatus("rejected", "Rejected"), RecordStatus("converted", "Ordered"),
        ],
        row: RecordRow(title: ["contact.name", "reference", "requisitionNumber"], number: "requisitionNumber", amount: "total", date: "requiredDate"),
        tones: ["submitted": .warning, "converted": .special],
        actions: [
            RecordAction(title: "Reject", symbol: "xmark", path: "reject", statuses: ["submitted"], destructive: true, confirm: "Reject this requisition?", primary: true),
            RecordAction(title: "Approve", symbol: "checkmark", path: "approve", statuses: ["submitted"], primary: true),
            RecordAction(title: "Create purchase order", symbol: "shippingbox", path: "convert", statuses: ["approved"], confirm: "Turn this requisition into a purchase order? It needs a supplier.", primary: true),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft", "rejected"], destructive: true, confirm: "Delete this requisition?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "Waiting", field: "total", statuses: ["submitted"], tone: .warning),
            RecordTotal(label: "Approved", field: "total", statuses: ["approved"], tone: .positive),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: requisitionForm, onCreated: done)) },
        emptyMessage: "Requests to buy something show up here for approval.",
        tillyPrompt: "Which requisitions are waiting for my approval?"
    )

    // MARK: Purchase orders

    static let purchaseOrderForm = SalesDocumentKind(
        title: "New purchase order",
        singular: "Purchase order",
        party: .supplier,
        endpoint: "purchase-orders",
        responseKey: "purchaseOrder",
        numberKey: "poNumber",
        secondDate: .init(label: "Delivery", key: "deliveryDate", days: 14, optional: true),
        referencePlaceholder: "Project or quote number",
        notesPlaceholder: "Delivery instructions",
        finish: .init(title: "Save and mark as sent", path: "send", done: "marked as sent"),
        specKey: "purchase-orders"
    )

    /// `GET purchase-orders` (paginated, `status=`), `GET purchase-orders/{id}`
    /// -> `{ purchaseOrder }` with lines (quantity and quantityReceived ×100).
    /// Goods are received with `POST goods-receipts`; convert bills the order.
    static let purchaseOrders: RecordSpec = RecordSpec(
        key: "purchase-orders",
        webPath: "/purchases/orders",
        title: "Purchase orders",
        singular: "Purchase order",
        symbol: "shippingbox",
        endpoint: "purchase-orders",
        detailKey: "purchaseOrder",
        searchParam: nil,
        statuses: [
            RecordStatus("draft", "Draft"), RecordStatus("sent", "Sent"), RecordStatus("partial", "Part received"),
            RecordStatus("received", "Received"), RecordStatus("closed", "Billed"), RecordStatus("void", "Void"),
        ],
        row: RecordRow(title: ["contact.name"], number: "poNumber", amount: "total", date: "deliveryDate"),
        tones: ["closed": .special],
        hiddenFields: ["convertedBillId"],
        actions: [
            RecordAction(title: "Mark as sent", symbol: "paperplane", path: "send", statuses: ["draft"], primary: true),
            RecordAction(title: "Create bill", symbol: "doc.text", path: "convert", statuses: ["received"], confirm: "Create a bill for everything not billed yet?", primary: true),
            RecordAction(title: "Bill now", symbol: "doc.text", path: "convert", statuses: ["sent", "partial"], confirm: "Bill the whole order before it's all received?"),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft"], destructive: true, confirm: "Delete this purchase order?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "On order", field: "total", statuses: ["sent", "partial"], tone: .info),
            RecordTotal(label: "To bill", field: "total", statuses: ["received"], tone: .warning),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: purchaseOrderForm, onCreated: done)) },
        detail: { id in
            AnyView(SalesDetailHost(spec: purchaseOrders, id: id, actions: [
                SalesHostAction(title: "Receive goods", symbol: "shippingbox", statuses: ["sent", "partial"]) { _, done in
                    AnyView(PurchasingReceiveSheet(orderID: id, done: done))
                },
            ]))
        },
        emptyMessage: "Orders you place with suppliers show up here.",
        tillyPrompt: "Which purchase orders are still waiting on delivery?"
    )

    // MARK: Goods received

    /// `GET goods-receipts` (paginated, `status=` draft|received|billed|void),
    /// `GET goods-receipts/{id}` -> `{ goodsReceipt }` with lines
    /// (quantityReceived ×100, unitCost). `POST create-bill` bills a receipt.
    static let goodsReceipts: RecordSpec = RecordSpec(
        key: "goods-receipts",
        webPath: "/purchases/goods-receipts",
        title: "Goods received",
        singular: "Goods receipt",
        symbol: "checkmark.rectangle.stack",
        endpoint: "goods-receipts",
        detailKey: "goodsReceipt",
        searchParam: nil,
        statuses: [RecordStatus("received", "Received"), RecordStatus("billed", "Billed"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["contact.name"], number: "receiptNumber", date: "date"),
        tones: ["received": .info, "billed": .positive],
        detail: { id in AnyView(PurchasingGoodsReceiptDetail(id: id)) },
        emptyMessage: "Deliveries you receive against purchase orders show up here.",
        tillyPrompt: "What was delivered this week and what still needs billing?"
    )

    // MARK: Landed costs

    /// `GET landed-costs` (paginated; no status filter), `GET landed-costs/{id}`
    /// -> the bare record with components, bill and purchase order.
    /// `POST allocate` spreads the cost over the order's lines (draft only).
    static let landedCosts: RecordSpec = RecordSpec(
        key: "landed-costs",
        webPath: "/purchases/landed-costs",
        title: "Landed costs",
        singular: "Landed cost",
        symbol: "airplane.arrival",
        endpoint: "landed-costs",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("allocated", "Allocated")],
        row: RecordRow(title: ["name"], subtitle: ["purchaseOrder.poNumber", "bill.billNumber"], amount: "totalCostAmount"),
        tones: ["draft": .warning, "allocated": .positive],
        hiddenFields: ["lineAllocations", "allocationMethod"],
        actions: [
            RecordAction(title: "Allocate", symbol: "arrow.triangle.branch", path: "allocate", statuses: ["draft"], confirm: "Spread these costs over the purchase order's lines and post them?", primary: true),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft"], destructive: true, confirm: "Delete this landed cost?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "To allocate", field: "totalCostAmount", statuses: ["draft"], tone: .warning),
            RecordTotal(label: "Allocated", field: "totalCostAmount", statuses: ["allocated"], tone: .positive),
        ],
        emptyMessage: "Freight, duty and other costs added to stock show up here.",
        tillyPrompt: "How much have landed costs added to my stock this quarter?"
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = supplierCreditFixtures
        .merging(requisitionFixtures) { $1 }
        .merging(purchaseOrderFixtures) { $1 }
        .merging(goodsReceiptFixtures) { $1 }
        .merging(landedCostFixtures) { $1 }
    #endif
}
