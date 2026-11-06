#if DEBUG
import Foundation

/// Sales fixtures for Northwind Studio, a small design studio billing in USD.
/// Dates are relative to today so "Due in 5 days" stays true on any day.
extension DemoData {
    static let salesFixtures: [String: String] = {
        let invoices = SalesDemo.invoices
        let list = invoices.map(\.json).joined(separator: ",")
        let open = invoices.filter { ["sent", "partial", "overdue"].contains($0.status) }
        let overdue = invoices.filter { $0.status == "overdue" }
        let outstanding = open.reduce(0) { $0 + $1.amountDue }
        let overdueTotal = overdue.reduce(0) { $0 + $1.amountDue }
        let detail = SalesDemo.detail
        let paid = SalesDemo.Doc(id: detail.id, number: detail.number, contact: detail.contact, status: "paid", subtotal: detail.subtotal, paid: detail.total, issue: detail.issue, due: detail.due, paidAt: 0, sentAt: detail.sentAt, reference: detail.reference, notes: detail.notes)
        let sent = SalesDemo.Doc(id: "demo-inv-0043", number: "INV-0043", contact: SalesDemo.hooli, status: "sent", subtotal: 275_000, issue: 0, due: 30, sentAt: 0)
        let created = SalesDemo.Doc(id: "demo-inv-0045", number: "INV-0045", contact: SalesDemo.acme, status: "draft", subtotal: 375_000, issue: 0, due: 30)
        let voided = SalesDemo.Doc(id: "demo-inv-0043", number: "INV-0043", contact: SalesDemo.hooli, status: "void", subtotal: 275_000, issue: 0, due: 30)

        return [
            "invoices": #"{"data":[\#(list)],"pagination":{"page":1,"limit":30,"total":\#(invoices.count),"totalPages":1}}"#,
            "invoices/summary": #"{"totalCount":\#(invoices.count),"outstanding":\#(outstanding),"outstandingCount":\#(open.count),"overdue":\#(overdueTotal),"overdueCount":\#(overdue.count),"aging":{"current":{"count":3,"amount":0},"1-30":{"count":2,"amount":0},"31-60":{"count":1,"amount":0},"60+":{"count":0,"amount":0}}}"#,
            "invoices/*": #"{"invoice":\#(detail.json(lines: SalesDemo.detailLines)),"payments":[{"id":"demo-pay-0019","paymentNumber":"PAY-0019","date":"\#(SalesDemo.day(-6))","amount":200000,"method":"bank_transfer"}]}"#,
            "POST invoices": #"{"invoice":\#(created.json),"creditLimitWarning":null}"#,
            "POST invoices/*/send": #"{"invoice":\#(sent.json)}"#,
            "POST invoices/*/pay": #"{"invoice":\#(paid.json),"payment":{"id":"demo-pay-0020","paymentNumber":"PAY-0020","date":"\#(SalesDemo.day(0))","amount":\#(detail.amountDue),"method":"bank_transfer"}}"#,
            "POST invoices/*/payment-link": #"{"token":"7f3a9c2e41b8d6f0a5e3c1b9d7f2a4e6c8b0d1f3a5e7c9b2","url":"https://dubbl.dev/pay/7f3a9c2e41b8d6f0a5e3c1b9d7f2a4e6c8b0d1f3a5e7c9b2"}"#,
            "POST invoices/*/void": #"{"invoice":\#(voided.json)}"#,
            "DELETE invoices/*": #"{"success":true}"#,
        ]
    }()
}

enum SalesDemo {
    struct Party {
        let id: String
        let name: String
        let email: String
        let type: String
        let terms: Int

        var json: String {
            #"{"id":"\#(id)","name":"\#(name)","email":"\#(email)","phone":null,"taxNumber":null,"type":"\#(type)","paymentTermsDays":\#(terms),"currencyCode":"USD","notes":null,"creditLimit":null,"addresses":null}"#
        }
    }

    static let acme = Party(id: "demo-contact-acme", name: "Acme Corp", email: "ap@acme.com", type: "customer", terms: 30)
    static let globex = Party(id: "demo-contact-globex", name: "Globex", email: "billing@globex.com", type: "customer", terms: 14)
    static let initech = Party(id: "demo-contact-initech", name: "Initech", email: "finance@initech.io", type: "both", terms: 30)
    static let umbrella = Party(id: "demo-contact-umbrella", name: "Umbrella Health", email: "payables@umbrella.health", type: "customer", terms: 45)
    static let hooli = Party(id: "demo-contact-hooli", name: "Hooli", email: "vendors@hooli.xyz", type: "customer", terms: 30)
    static let stark = Party(id: "demo-contact-stark", name: "Stark Industries", email: "ap@stark.com", type: "customer", terms: 30)
    static let wayne = Party(id: "demo-contact-wayne", name: "Wayne Enterprises", email: "accounts@wayne.co", type: "customer", terms: 60)

    /// An invoice with 8% tax on top of the subtotal. Day offsets are from today.
    struct Doc {
        let id: String
        let number: String
        let contact: Party
        let status: String
        let subtotal: Int
        var paid = 0
        let issue: Int
        let due: Int
        var paidAt: Int?
        var sentAt: Int?
        var reference: String?
        var notes: String?

        var tax: Int { subtotal * 8 / 100 }
        var total: Int { subtotal + tax }
        var amountDue: Int { status == "void" ? 0 : total - paid }

        var json: String { json(lines: nil) }

        func json(lines: String?) -> String {
            func str(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
            let moment: (Int?) -> String = { offset in offset.map { "\"\(SalesDemo.moment($0))\"" } ?? "null" }
            let linesPart = lines.map { #","lines":\#($0)"# } ?? ""
            return #"{"id":"\#(id)","contactId":"\#(contact.id)","invoiceNumber":"\#(number)","issueDate":"\#(SalesDemo.day(issue))","dueDate":"\#(SalesDemo.day(due))","status":"\#(status)","invoiceType":"standard","reference":\#(str(reference)),"notes":\#(str(notes)),"subtotal":\#(subtotal),"taxTotal":\#(tax),"total":\#(total),"amountPaid":\#(paid),"amountDue":\#(amountDue),"currencyCode":"USD","sentAt":\#(moment(sentAt)),"paidAt":\#(moment(paidAt)),"createdAt":"\#(SalesDemo.moment(issue))","contact":\#(contact.json)\#(linesPart)}"#
        }
    }

    static let detail = Doc(
        id: "demo-inv-0040", number: "INV-0040", contact: initech, status: "partial",
        subtotal: 640_000, paid: 200_000, issue: -18, due: 12, sentAt: -18,
        reference: "PO-7731", notes: "Thanks for working with Northwind. Bank details are on the PDF."
    )

    static let detailLines = #"[{"id":"demo-line-3","description":"Usability testing, two rounds","quantity":200,"unitPrice":80000,"discountPercent":0,"taxAmount":12800,"amount":160000,"sortOrder":2,"account":{"id":"demo-acc-4000","code":"4000","name":"Design services"},"taxRate":{"id":"demo-tax-8","name":"Sales tax 8%","rate":800}},{"id":"demo-line-1","description":"Product design sprint","quantity":100,"unitPrice":360000,"discountPercent":0,"taxAmount":28800,"amount":360000,"sortOrder":0,"account":{"id":"demo-acc-4000","code":"4000","name":"Design services"},"taxRate":{"id":"demo-tax-8","name":"Sales tax 8%","rate":800}},{"id":"demo-line-2","description":"Design system components","quantity":1250,"unitPrice":9600,"discountPercent":0,"taxAmount":9600,"amount":120000,"sortOrder":1,"account":{"id":"demo-acc-4000","code":"4000","name":"Design services"},"taxRate":{"id":"demo-tax-8","name":"Sales tax 8%","rate":800}}]"#

    /// Newest first, the way the list sorts by default.
    static let invoices: [Doc] = [
        Doc(id: "demo-inv-0044", number: "INV-0044", contact: globex, status: "draft", subtotal: 98_000, issue: 0, due: 14),
        Doc(id: "demo-inv-0043", number: "INV-0043", contact: hooli, status: "draft", subtotal: 275_000, issue: -1, due: 29),
        Doc(id: "demo-inv-0042", number: "INV-0042", contact: acme, status: "sent", subtotal: 420_000, issue: -25, due: 5, sentAt: -25, reference: "Q4 retainer"),
        Doc(id: "demo-inv-0041", number: "INV-0041", contact: globex, status: "overdue", subtotal: 185_000, issue: -17, due: -3, sentAt: -17),
        detail,
        Doc(id: "demo-inv-0039", number: "INV-0039", contact: umbrella, status: "paid", subtotal: 320_000, paid: 345_600, issue: -40, due: 5, paidAt: -2, sentAt: -40),
        Doc(id: "demo-inv-0038", number: "INV-0038", contact: stark, status: "overdue", subtotal: 960_000, issue: -48, due: -18, sentAt: -48),
        Doc(id: "demo-inv-0037", number: "INV-0037", contact: wayne, status: "paid", subtotal: 540_000, paid: 583_200, issue: -55, due: 5, paidAt: -9, sentAt: -55),
        Doc(id: "demo-inv-0036", number: "INV-0036", contact: hooli, status: "sent", subtotal: 315_000, issue: -30, due: 0, sentAt: -30),
        Doc(id: "demo-inv-0035", number: "INV-0035", contact: initech, status: "void", subtotal: 150_000, issue: -62, due: -32),
        Doc(id: "demo-inv-0034", number: "INV-0034", contact: acme, status: "paid", subtotal: 120_000, paid: 129_600, issue: -70, due: -40, paidAt: -21, sentAt: -70),
        Doc(id: "demo-inv-0033", number: "INV-0033", contact: umbrella, status: "overdue", subtotal: 224_000, issue: -86, due: -41, sentAt: -86),
    ]

    static func day(_ offset: Int) -> String {
        DubblDate.string(Calendar.current.date(byAdding: .day, value: offset, to: .now) ?? .now)
    }

    static func moment(_ offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: .now) ?? .now
        return date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}
#endif
