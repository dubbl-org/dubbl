#if DEBUG
import Foundation

extension DemoData {
    /// Timestamps are relative to launch so the Today / This week / Earlier
    /// groups always have something in them.
    static let notificationsFixtures: [String: String] = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        func ago(_ minutes: Double) -> String {
            formatter.string(from: Date().addingTimeInterval(-minutes * 60))
        }
        func json(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }

        struct Item {
            let id, type, title, body: String
            let entityType, entityId: String?
            let minutesAgo: Double
            let read: Bool
        }

        let items: [Item] = [
            Item(id: "demo-ntf-01", type: "invoice_overdue", title: "Invoice INV-0038 is overdue",
                 body: "Initech owes $2,150.00, due 28 Sep", entityType: "invoice", entityId: "demo-inv-38", minutesAgo: 38, read: false),
            Item(id: "demo-ntf-02", type: "payment_received", title: "Payment received from Acme Corp",
                 body: "$6,400.00 for INV-0041", entityType: "invoice", entityId: "demo-inv-41", minutesAgo: 190, read: false),
            Item(id: "demo-ntf-03", type: "approval_needed", title: "Expense claim needs approval",
                 body: "Jamie Lee submitted Client workshop travel for $486.20", entityType: "expense_claim", entityId: "demo-exp-1", minutesAgo: 320, read: false),
            Item(id: "demo-ntf-04", type: "low_bank_balance", title: "Operating checking is below $50,000",
                 body: "Balance is $48,210.34 after Gusto payroll", entityType: "bank_account", entityId: "demo-bank-1", minutesAgo: 60 * 26, read: true),
            Item(id: "demo-ntf-05", type: "stripe_payment_failed", title: "Stripe payment failed",
                 body: "Card declined for Hooli, $1,200.00", entityType: "stripe_invoice", entityId: "demo-stripe-1", minutesAgo: 60 * 50, read: true),
            Item(id: "demo-ntf-06", type: "budget_exceeded", title: "Software budget at 92%",
                 body: "$1,840 of $2,000 spent this quarter", entityType: "budget_period", entityId: "demo-budget-1", minutesAgo: 60 * 75, read: true),
            Item(id: "demo-ntf-07", type: "approval_needed", title: "Bill BILL-0112 needs approval",
                 body: "Umbrella Health, $1,200.00", entityType: "bill", entityId: "demo-bill-112", minutesAgo: 60 * 98, read: true),
            Item(id: "demo-ntf-08", type: "system_alert", title: "Bank import finished",
                 body: "17 new transactions from Operating checking", entityType: nil, entityId: nil, minutesAgo: 60 * 24 * 9, read: true),
            Item(id: "demo-ntf-09", type: "payment_received", title: "Payment received from Globex",
                 body: "$2,150.00 for INV-0036", entityType: "invoice", entityId: "demo-inv-36", minutesAgo: 60 * 24 * 12, read: true),
            Item(id: "demo-ntf-10", type: "task_assigned", title: "Task assigned: Q3 close checklist",
                 body: "Riley assigned you to Q3 close in Finance", entityType: nil, entityId: nil, minutesAgo: 60 * 24 * 16, read: true),
        ]

        let rows = items.map { item in
            let created = ago(item.minutesAgo)
            return """
            {"id":"\(item.id)","organizationId":"demo-org","userId":"demo-user","type":"\(item.type)","title":"\(item.title)","body":"\(item.body)","entityType":\(json(item.entityType)),"entityId":\(json(item.entityId)),"channel":"in_app","readAt":\(item.read ? json(created) : "null"),"createdAt":"\(created)","deletedAt":null}
            """
        }
        let unread = items.filter { !$0.read }.count
        let page = """
        {"data":[\(rows.joined(separator: ","))],"pagination":{"page":1,"limit":30,"total":\(items.count),"totalPages":1},"unreadCount":\(unread)}
        """

        return [
            "notifications": page,
            "POST notifications/*/read": #"{"notification":{"id":"demo-ntf-01"}}"#,
            "DELETE notifications/*/read": #"{"notification":{"id":"demo-ntf-01"}}"#,
            "DELETE notifications/*": #"{"success":true}"#,
            "POST notifications/read-all": #"{"success":true}"#,
        ]
    }()
}
#endif
