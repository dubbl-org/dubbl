import Foundation

/// One row of GET contacts/balances: a customer's receivables or a supplier's
/// payables, aggregated on the server. Every amount is integer cents.
struct ContactsBalance: Decodable, Sendable, Hashable, Identifiable {
    var id: String
    var name: String
    var email: String?
    var phone: String?
    var type: String?
    var currencyCode: String?
    var paymentTermsDays: Int?
    @LenientInt var outstanding: Int
    @LenientInt var overdue: Int
    @LenientInt var openCount: Int
    @LenientInt var overdueCount: Int
    var oldestOverdueDate: String?
    var lastDocumentDate: String?
    @LenientInt var totalThisYear: Int
    @LenientInt var totalLastYear: Int
    var lastPaymentDate: String?
    @LenientInt var paidCount: Int
    var avgDaysToPay: Double?
    @LenientInt var unappliedCredit: Int

    /// The balance as a list row, so customer and supplier views share one row.
    func asContact(side: ContactsSide) -> Contact {
        Contact(
            id: id, name: name, email: email, phone: phone, type: type,
            paymentTermsDays: paymentTermsDays, currencyCode: currencyCode,
            owesYou: side == .customer ? outstanding : nil,
            youOwe: side == .supplier ? outstanding : nil,
            overdue: overdue
        )
    }
}

enum ContactsSide: String, Sendable {
    case customer, supplier

    /// Contact types that belong on this side; "both" sits on each.
    var types: Set<String> { self == .customer ? ["customer", "both"] : ["supplier", "both"] }
}

/// Everyone with an open balance, both sides (contacts/balances?open=1). It
/// feeds the Owe you, You owe and Overdue scopes and the ledger totals.
struct ContactsOpenBalances: Sendable {
    var customers: [ContactsBalance]
    var suppliers: [ContactsBalance]

    var owedToYou: Int { customers.reduce(0) { $0 + $1.outstanding } }
    var owedToYouOverdue: Int { customers.reduce(0) { $0 + $1.overdue } }
    var youOwe: Int { suppliers.reduce(0) { $0 + $1.outstanding } }
    var youOweOverdue: Int { suppliers.reduce(0) { $0 + $1.overdue } }

    /// Contacts late on either side, counted once.
    var overdueCount: Int {
        Set((customers + suppliers).filter { $0.overdue > 0 }.map(\.id)).count
    }

    /// The balance scopes, biggest first.
    var owingYou: [Contact] {
        customers.map { $0.asContact(side: .customer) }.sorted { ($0.owesYou ?? 0) > ($1.owesYou ?? 0) }
    }

    var owedByYou: [Contact] {
        suppliers.map { $0.asContact(side: .supplier) }.sorted { ($0.youOwe ?? 0) > ($1.youOwe ?? 0) }
    }

    /// Late on either side. A contact on both sides is one row with both
    /// balances and the overdue added up, like the contacts list sends it.
    var late: [Contact] {
        var merged: [String: Contact] = [:]
        var order: [String] = []
        for (side, rows) in [(ContactsSide.customer, customers), (.supplier, suppliers)] {
            for row in rows where row.overdue > 0 {
                let next = row.asContact(side: side)
                if var existing = merged[row.id] {
                    existing.owesYou = existing.owesYou ?? next.owesYou
                    existing.youOwe = existing.youOwe ?? next.youOwe
                    existing.overdue = (existing.overdue ?? 0) + row.overdue
                    merged[row.id] = existing
                } else {
                    merged[row.id] = next
                    order.append(row.id)
                }
            }
        }
        return order.compactMap { merged[$0] }.sorted { ($0.overdue ?? 0) > ($1.overdue ?? 0) }
    }
}

/// POST contacts body.
struct ContactsCreateBody: Encodable, Sendable {
    var name: String
    var email: String?
    var phone: String?
    var type: String
    var paymentTermsDays: Int
    var taxNumber: String?
    var currencyCode: String
}

extension Contact {
    var isCustomer: Bool { type == "customer" || type == "both" }
    var isSupplier: Bool { type == "supplier" || type == "both" }

    /// "Net 30", "Due on receipt".
    var paymentTermsLabel: String? {
        guard let days = paymentTermsDays else { return nil }
        return ContactsTerms.label(days)
    }

    var telURL: URL? {
        guard let phone, !phone.isEmpty else { return nil }
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }

    var smsURL: URL? {
        guard let phone, !phone.isEmpty else { return nil }
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "sms:\(digits)")
    }

    var mailURL: URL? {
        guard let email, !email.isEmpty else { return nil }
        return URL(string: "mailto:\(email)")
    }
}

enum ContactsTerms {
    static let options = [0, 7, 14, 30, 45, 60]

    static func label(_ days: Int) -> String {
        days == 0 ? "Due on receipt" : "Net \(days)"
    }
}
