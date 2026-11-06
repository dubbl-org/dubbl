import SwiftUI

/// Sales extras (quotes, cash sales, credit notes, payments, prepayments, recurring invoices, revenue schedules).
@MainActor
enum SalesCatalog {
    static let specs: [RecordSpec] = [quotes, cashSales, creditNotes, payments, prepayments, recurringTemplates, revenueSchedules]

    static let screens: [RecordScreen] = {
        var screens = [
            RecordScreen(key: "recurring-invoices", webPath: "/sales/recurring", title: "Recurring invoices") {
                AnyView(SalesRecurringListView(type: "invoice", title: "Recurring invoices"))
            },
            RecordScreen(key: "revenue-schedules-list", webPath: "/sales/revenue-schedules", title: "Revenue schedules") {
                AnyView(SalesRevenueSchedulesView())
            },
        ]
        #if DEBUG
        // Create forms as pages, so demo mode can open them for screenshots
        // (DUBBL_DEMO_OPEN=page:/sales/quotes/new).
        screens += [
            RecordScreen(key: "debug-new-quote", webPath: "/sales/quotes/new", title: "New quote") { AnyView(SalesDocumentFormView(kind: quoteForm)) },
            RecordScreen(key: "debug-new-cash-sale", webPath: "/sales/receipts/new", title: "New cash sale") { AnyView(SalesDocumentFormView(kind: cashSaleForm)) },
            RecordScreen(key: "debug-new-recurring-invoice", webPath: "/sales/recurring/new", title: "New recurring invoice") { AnyView(SalesDocumentFormView(kind: SalesRecurring.kind("invoice"))) },
            RecordScreen(key: "debug-apply-credit", webPath: "/sales/credit-notes/apply", title: "Apply credit note") {
                AnyView(SalesDebugSheetPage { SalesApplySheet(title: "Apply credit note", target: .invoice, contactID: "demo-contact-stark", currency: "USD", available: 129_600, path: "credit-notes/demo-cn-8/apply") {} })
            },
            RecordScreen(key: "debug-new-prepayment", webPath: "/sales/customer-prepayments/new", title: "New prepayment") { AnyView(SalesDebugSheetPage { SalesPrepaymentSheet() }) },
        ]
        #endif
        return screens
    }()

    // MARK: Quotes

    static let quoteForm = SalesDocumentKind(
        title: "New quote",
        singular: "Quote",
        endpoint: "quotes",
        responseKey: "quote",
        numberKey: "quoteNumber",
        secondDate: .init(label: "Expires", key: "expiryDate", days: 30),
        notesPlaceholder: "Terms, scope, anything the customer should know",
        finish: .init(title: "Save and mark as sent", path: "send", done: "marked as sent"),
        specKey: "quotes"
    )

    /// `GET quotes` (paginated, `status=`), `GET quotes/{id}` -> `{ quote }`
    /// with contact and lines. Send without an email body only marks it sent;
    /// accept/decline need a sent quote, convert an accepted one (bills the rest).
    static let quotes: RecordSpec = RecordSpec(
        key: "quotes",
        webPath: "/sales/quotes",
        title: "Quotes",
        singular: "Quote",
        symbol: "doc.plaintext",
        endpoint: "quotes",
        detailKey: "quote",
        searchParam: nil,
        statuses: [
            RecordStatus("draft", "Draft"), RecordStatus("sent", "Sent"), RecordStatus("accepted", "Accepted"),
            RecordStatus("declined", "Declined"), RecordStatus("expired", "Expired"), RecordStatus("converted", "Converted"),
        ],
        row: RecordRow(title: ["contact.name"], number: "quoteNumber", amount: "total", date: "expiryDate"),
        tones: ["sent": .info, "accepted": .positive, "converted": .special],
        hiddenFields: ["billedTotal"],
        actions: [
            RecordAction(title: "Mark as sent", symbol: "paperplane", path: "send", statuses: ["draft"], primary: true),
            RecordAction(title: "Decline", symbol: "xmark", path: "decline", statuses: ["sent"], destructive: true, confirm: "Mark this quote as declined?", primary: true),
            RecordAction(title: "Accept", symbol: "checkmark", path: "accept", statuses: ["sent"], primary: true),
            RecordAction(title: "Convert to invoice", symbol: "arrow.right.doc.on.clipboard", path: "convert", statuses: ["accepted"], confirm: "Create an invoice for what's left on this quote?", primary: true),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft"], destructive: true, confirm: "Delete this quote?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "Open", field: "total", statuses: ["draft", "sent"], tone: .info),
            RecordTotal(label: "Accepted", field: "total", statuses: ["accepted"], tone: .positive),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: quoteForm, onCreated: done)) },
        emptyMessage: "Quotes you send customers show up here.",
        tillyPrompt: "Which quotes should I follow up on?"
    )

    // MARK: Cash sales

    static let cashSaleForm = SalesDocumentKind(
        title: "New cash sale",
        singular: "Cash sale",
        endpoint: "sales-receipts",
        responseKey: "salesReceipt",
        numberKey: "receiptNumber",
        dateLabel: "Date",
        dateKey: "date",
        asksBankAccount: true,
        referencePlaceholder: "Receipt or order number",
        notesPlaceholder: "Shown on the receipt",
        finish: .init(title: "Save and post", path: "post", done: "posted"),
        specKey: "sales-receipts"
    )

    /// `GET sales-receipts` (paginated, `status=` draft|paid|void),
    /// `GET sales-receipts/{id}` -> `{ salesReceipt }` with contact, lines and
    /// bank account. Posting a draft books the cash and marks it paid; void
    /// reverses it.
    static let cashSales: RecordSpec = RecordSpec(
        key: "sales-receipts",
        webPath: "/sales/receipts",
        title: "Cash sales",
        singular: "Cash sale",
        symbol: "banknote",
        endpoint: "sales-receipts",
        detailKey: "salesReceipt",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("paid", "Paid"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["contact.name"], number: "receiptNumber", amount: "total", date: "date"),
        actions: [
            RecordAction(title: "Post sale", symbol: "checkmark", path: "post", statuses: ["draft"], primary: true),
            RecordAction(title: "Void", symbol: "xmark.circle", path: "void", statuses: ["draft", "paid"], destructive: true, confirm: "Void this cash sale? Anything posted is reversed."),
        ],
        totals: [
            RecordTotal(label: "Taken", field: "total", statuses: ["paid"], tone: .positive),
            RecordTotal(label: "Drafts", field: "total", statuses: ["draft"], tone: .neutral),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: cashSaleForm, onCreated: done)) },
        emptyMessage: "Sales paid on the spot, with no invoice, show up here.",
        tillyPrompt: "How much have I taken in cash sales this month?"
    )

    // MARK: Credit notes

    static let creditNoteForm = SalesDocumentKind(
        title: "New credit note",
        singular: "Credit note",
        endpoint: "credit-notes",
        responseKey: "creditNote",
        numberKey: "creditNoteNumber",
        referencePlaceholder: "Invoice number or reason",
        notesPlaceholder: "Why the customer is being credited",
        finish: .init(title: "Save and mark as sent", path: "send", done: "marked as sent"),
        specKey: "credit-notes"
    )

    /// `GET credit-notes` (paginated, `status=` draft|sent|applied|void),
    /// `GET credit-notes/{id}` -> `{ creditNote }`. Sending posts it; a sent
    /// note is applied to invoices with `POST apply { invoiceId, amount }`.
    static let creditNotes: RecordSpec = RecordSpec(
        key: "credit-notes",
        webPath: "/sales/credit-notes",
        title: "Credit notes",
        singular: "Credit note",
        symbol: "arrow.uturn.backward.circle",
        endpoint: "credit-notes",
        detailKey: "creditNote",
        searchParam: nil,
        statuses: [RecordStatus("draft", "Draft"), RecordStatus("sent", "Sent"), RecordStatus("applied", "Applied"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["contact.name"], number: "creditNoteNumber", amount: "total", date: "issueDate"),
        actions: [
            RecordAction(title: "Mark as sent", symbol: "paperplane", path: "send", statuses: ["draft"], primary: true),
            RecordAction(title: "Void", symbol: "xmark.circle", path: "void", statuses: ["draft", "sent", "applied"], destructive: true, confirm: "Void this credit note? Anything applied goes back on the invoices."),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, statuses: ["draft"], destructive: true, confirm: "Delete this credit note?", popsBack: true),
        ],
        totals: [
            RecordTotal(label: "Unused", field: "amountRemaining", statuses: ["sent"], tone: .info),
            RecordTotal(label: "Applied", field: "amountApplied", tone: .positive),
        ],
        create: { done in AnyView(SalesDocumentSheet(kind: creditNoteForm, onCreated: done)) },
        detail: { id in
            AnyView(SalesDetailHost(spec: creditNotes, id: id, actions: [
                SalesHostAction(title: "Apply to invoice", symbol: "arrow.right.doc.on.clipboard", statuses: ["sent"], when: { ($0["amountRemaining"]?.intValue ?? 0) > 0 }) { record, done in
                    AnyView(SalesApplySheet(
                        title: "Apply credit note", target: .invoice, contactID: record["contactId"]?.stringValue,
                        currency: record["currencyCode"]?.stringValue ?? "USD", available: record["amountRemaining"]?.intValue ?? 0,
                        path: "credit-notes/\(id)/apply", done: done
                    ))
                },
            ]))
        },
        emptyMessage: "Credits you give customers show up here.",
        tillyPrompt: "Which credit notes still have money left to apply?"
    )

    // MARK: Payments

    /// `GET payments?type=received` (paginated; no status), `GET payments/{id}`
    /// -> `{ payment }` with contact, bank account and allocations.
    static let payments: RecordSpec = RecordSpec(
        key: "sales-payments",
        webPath: "/sales/payments",
        title: "Payments",
        singular: "Payment",
        symbol: "creditcard",
        endpoint: "payments",
        detailKey: "payment",
        query: ["type": "received"],
        searchParam: nil,
        row: RecordRow(title: ["contact.name"], subtitle: ["method"], number: "paymentNumber", amount: "amount", status: nil, date: "date"),
        totals: [RecordTotal(label: "Received", field: "amount", tone: .positive)],
        detail: { id in AnyView(SalesPaymentDetail(id: id)) },
        emptyMessage: "Money customers pay you shows up here.",
        tillyPrompt: "Who paid me this month, and how much?"
    )

    // MARK: Prepayments

    /// `GET customer-credits` (paginated, `status=` open|applied|refunded|void),
    /// `GET customer-credits/{id}` -> `{ customerCredit }`. Open credits are
    /// applied with `POST apply { invoiceId, amount, date }`.
    static let prepayments: RecordSpec = RecordSpec(
        key: "customer-credits",
        webPath: "/sales/customer-prepayments",
        title: "Prepayments",
        singular: "Prepayment",
        symbol: "tray.and.arrow.down",
        endpoint: "customer-credits",
        detailKey: "customerCredit",
        searchParam: nil,
        statuses: [RecordStatus("open", "Open"), RecordStatus("applied", "Applied"), RecordStatus("refunded", "Refunded"), RecordStatus("void", "Void")],
        row: RecordRow(title: ["contact.name"], subtitle: ["sourceType"], amount: "originalAmount", date: "date"),
        tones: ["open": .info],
        moneyFields: ["originalAmount", "amountRemaining"],
        hiddenFields: ["journalEntry"],
        totals: [
            RecordTotal(label: "Available", field: "amountRemaining", statuses: ["open"], tone: .info),
            RecordTotal(label: "Received", field: "originalAmount", tone: .positive),
        ],
        create: { done in AnyView(SalesPrepaymentSheet(onCreated: done)) },
        detail: { id in
            AnyView(SalesDetailHost(spec: prepayments, id: id, actions: [
                SalesHostAction(title: "Apply to invoice", symbol: "arrow.right.doc.on.clipboard", statuses: ["open"], when: { ($0["amountRemaining"]?.intValue ?? 0) > 0 }) { record, done in
                    AnyView(SalesApplySheet(
                        title: "Apply prepayment", target: .invoice, contactID: record["contactId"]?.stringValue,
                        currency: record["currencyCode"]?.stringValue ?? "USD", available: record["amountRemaining"]?.intValue ?? 0,
                        path: "customer-credits/\(id)/apply", sendsDate: true, done: done
                    ))
                },
            ]))
        },
        emptyMessage: "Deposits and money paid before an invoice show up here.",
        tillyPrompt: "Which customers have prepayments I haven't used yet?"
    )

    // MARK: Recurring

    /// Detail for any recurring template (invoices, bills, expenses):
    /// `GET recurring/{id}` -> `{ template }` with contact and lines. Lists are
    /// SalesRecurringListView. `POST recurring/{id}/pause` toggles active/paused.
    static let recurringTemplates: RecordSpec = RecordSpec(
        key: "recurring-templates",
        webPath: "/sales/recurring",
        title: "Recurring",
        singular: "Recurring template",
        symbol: "repeat",
        endpoint: "recurring",
        detailKey: "template",
        searchParam: nil,
        row: RecordRow(title: ["name"], subtitle: ["contact.name", "frequency"], date: "nextRunDate"),
        tones: ["active": .positive, "paused": .warning, "completed": .neutral],
        hiddenFields: ["type"],
        actions: [
            RecordAction(title: "Pause", symbol: "pause", path: "pause", statuses: ["active"], primary: true),
            RecordAction(title: "Resume", symbol: "play", path: "pause", statuses: ["paused"], primary: true),
            RecordAction(title: "Delete", symbol: "trash", method: .delete, destructive: true, confirm: "Delete this template? Documents it already made stay.", popsBack: true),
        ]
    )

    // MARK: Revenue schedules

    /// Detail for a revenue schedule; the list is SalesRevenueSchedulesView.
    static let revenueSchedules: RecordSpec = RecordSpec(
        key: "revenue-schedules",
        webPath: "/sales/revenue-schedules",
        title: "Revenue schedules",
        singular: "Revenue schedule",
        symbol: "calendar.badge.clock",
        endpoint: "revenue-schedules",
        detailKey: "schedule",
        row: RecordRow(title: ["method"], amount: "totalAmount", date: "startDate"),
        detail: { id in AnyView(SalesRevenueScheduleDetail(id: id)) }
    )

    #if DEBUG
    nonisolated static let fixtures: [String: String] = quoteFixtures
        .merging(cashSaleFixtures) { $1 }
        .merging(creditNoteFixtures) { $1 }
        .merging(paymentFixtures) { $1 }
        .merging(prepaymentFixtures) { $1 }
        .merging(recurringFixtures) { $1 }
        .merging(revenueFixtures) { $1 }
    #endif
}
