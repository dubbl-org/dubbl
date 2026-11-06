import SwiftUI

// A record kind described as data: where its list and detail live in the API,
// which fields make a row, which statuses it filters by and what can be done
// to one. RecordListView and RecordDetailView draw any spec, so most areas of
// dubbl need a spec rather than screens of their own.

/// One kind of record, e.g. quotes or fixed assets.
struct RecordSpec: Identifiable {
    /// Unique, used in routes: "quotes".
    let key: String
    /// The web page this replaces, so More can open it natively: "/sales/quotes".
    let webPath: String
    /// "Quotes"
    let title: String
    /// "Quote"
    let singular: String
    /// SF Symbol for empty states.
    var symbol = "doc.text"
    /// List route under /api/v1, e.g. "quotes".
    let endpoint: String
    /// Array key in the list response; nil reads `data` (paginated responses).
    var listKey: String?
    /// Whether the list route takes page/limit.
    var paged = true
    /// Detail route; nil uses "\(endpoint)/{id}". "{id}" is replaced.
    var detailEndpoint: String?
    /// Rows open a detail screen.
    var hasDetail = true
    /// Object key in the detail response, e.g. "quote"; nil takes the first object.
    var detailKey: String?
    /// Query sent with every list request.
    var query: [String: String] = [:]
    /// Server-side search parameter; nil searches loaded rows on the device.
    var searchParam: String? = "search"
    /// Drawer filters. Leave empty for none; "all" is added automatically.
    var statuses: [RecordStatus] = []
    var statusParam = "status"
    /// Row layout.
    var row: RecordRow
    /// Status value -> tone; unknown values fall back to RecordFormat.tone.
    var tones: [String: Tone] = [:]
    /// Extra integer fields to show as money (minor units). Common names are detected already.
    var moneyFields: Set<String> = []
    /// Fields never shown in the detail.
    var hiddenFields: Set<String> = []
    /// Buttons on the detail screen.
    var actions: [RecordAction] = []
    /// Totals over the list, e.g. "Open" and "Overdue", read from the loaded rows.
    var totals: [RecordTotal] = []
    /// A sheet that creates one; called with a completion that reloads the list.
    var create: ((@escaping () -> Void) -> AnyView)?
    /// A custom detail screen instead of the generic one.
    var detail: ((String) -> AnyView)?
    var emptyMessage = "Nothing here yet."
    /// Question for Tilly from the list's drawer.
    var tillyPrompt: String?

    var id: String { key }
}

struct RecordStatus: Hashable {
    let value: String
    let label: String

    init(_ value: String, _ label: String) {
        self.value = value
        self.label = label
    }
}

/// Which fields make a row. Paths are dotted ("contact.name").
struct RecordRow {
    /// First non-empty wins.
    var title: [String]
    /// Joined with " · ".
    var subtitle: [String] = []
    /// Monospaced document number shown before the subtitle.
    var number: String?
    /// Minor units.
    var amount: String?
    /// Currency code path; the organization's currency when nil or missing.
    var currency: String? = "currencyCode"
    var status: String? = "status"
    /// A date shown in the subtitle ("12 Oct").
    var date: String?
    /// Shows an avatar of the title, for people and companies.
    var avatar = false
}

/// A sum over loaded rows shown above the list.
struct RecordTotal {
    let label: String
    /// Minor-unit field to sum.
    let field: String
    /// Only rows in these statuses; nil counts all.
    var statuses: Set<String>?
    var tone: Tone = .info
}

/// A button on the detail screen that calls the API.
struct RecordAction: Identifiable {
    enum Method: String { case post = "POST", patch = "PATCH", delete = "DELETE" }

    let title: String
    let symbol: String
    /// Appended to the record's detail path: "send" -> POST quotes/{id}/send. Empty hits the record itself.
    var path = ""
    var method: Method = .post
    /// JSON body; nil sends none (or `{}` for POST).
    var body: [String: JSONValue]?
    /// Only shown while the record's status is one of these.
    var statuses: Set<String>?
    var destructive = false
    /// Asks before running.
    var confirm: String?
    /// Goes back to the list afterwards (deletes).
    var popsBack = false
    /// The primary action is drawn filled.
    var primary = false

    var id: String { title }
}

/// A screen that isn't a plain list: reports, pipelines, settings forms.
struct RecordScreen: Identifiable {
    let key: String
    /// The web page it replaces.
    let webPath: String
    let title: String
    let make: () -> AnyView

    var id: String { key }
}

/// Pushes a record's detail.
struct RecordRoute: Hashable {
    let spec: String
    let id: String
}

/// Pushes a list or screen by the web path it replaces.
struct RecordPageRoute: Hashable {
    let path: String
}

// MARK: - JSON

extension JSONValue {
    subscript(path: String) -> JSONValue? {
        var current: JSONValue? = self
        for part in path.split(separator: ".") {
            guard case let .object(object) = current else { return nil }
            current = object[String(part)]
        }
        return current
    }

    var stringValue: String? {
        switch self {
        case let .string(value): value
        case let .number(value): value.rounded() == value ? String(Int(value)) : String(value)
        case let .bool(value): value ? "Yes" : "No"
        default: nil
        }
    }

    var intValue: Int? {
        switch self {
        case let .number(value): Int(value.rounded())
        case let .string(value): Int(value) ?? Double(value).map { Int($0.rounded()) }
        default: nil
        }
    }

    var boolValue: Bool? {
        if case let .bool(value) = self { return value }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case let .array(value) = self { return value }
        return nil
    }

    var isNull: Bool {
        if case .null = self { return true }
        return false
    }

    /// The record's id as a string.
    var recordID: String? { self["id"]?.stringValue }
}

// MARK: - Formatting

enum RecordFormat {
    /// Field names that hold minor units.
    private static let moneyWords = ["amount", "total", "subtotal", "balance", "price", "cost", "paid", "due", "value", "salary", "gross", "net", "outstanding", "limit", "budget", "spent", "revenue", "expense", "liability", "fee", "principal", "payment"]
    /// Integer fields with money-like names that aren't money.
    private static let notMoneyWords = ["rate", "percent", "quantity", "qty", "count", "days", "number", "year", "order", "months", "periods", "index", "score", "probability", "hours", "units", "level", "version", "life"]

    static func isMoney(_ key: String, spec: RecordSpec?) -> Bool {
        if spec?.moneyFields.contains(key) == true { return true }
        let lower = key.lowercased()
        if notMoneyWords.contains(where: { lower.contains($0) }) { return false }
        return moneyWords.contains(where: { lower.contains($0) })
    }

    /// Ids, foreign keys and bookkeeping columns stay out of the detail.
    static func isHidden(_ key: String, spec: RecordSpec?) -> Bool {
        if spec?.hiddenFields.contains(key) == true { return true }
        if key == "id" || key.hasSuffix("Id") || key.hasSuffix("ID") || key.hasSuffix("Ids") { return true }
        return ["organizationId", "orgId", "deletedAt", "updatedAt", "createdBy", "updatedBy", "metadata", "searchVector", "password", "secret", "token", "hash"].contains(key)
    }

    /// "issueDate" -> "Issue date", "currencyCode" -> "Currency".
    static func label(_ key: String) -> String {
        let special: [String: String] = [
            "currencyCode": "Currency", "createdAt": "Created", "updatedAt": "Updated", "issueDate": "Issued",
            "dueDate": "Due", "taxTotal": "Tax", "amountDue": "Still due", "amountPaid": "Paid",
            "contact": "Contact", "validUntil": "Valid until", "sentAt": "Sent", "paidAt": "Paid on",
        ]
        if let label = special[key] { return label }
        var words: [String] = []
        var current = ""
        for char in key {
            if char.isUppercase, !current.isEmpty {
                words.append(current)
                current = String(char).lowercased()
            } else if char == "_" {
                if !current.isEmpty { words.append(current) }
                current = ""
            } else {
                current.append(char)
            }
        }
        if !current.isEmpty { words.append(current) }
        let sentence = words.joined(separator: " ")
        return sentence.prefix(1).uppercased() + sentence.dropFirst()
    }

    /// A value ready to show: money, dates, yes/no, names of nested records.
    static func text(_ value: JSONValue, key: String, record: JSONValue, spec: RecordSpec?, currency: String) -> String? {
        switch value {
        case .null:
            return nil
        case let .bool(flag):
            return flag ? "Yes" : "No"
        case .number:
            guard let int = value.intValue else { return value.stringValue }
            if isMoney(key, spec: spec) {
                return Money.format(int, currency: record["currencyCode"]?.stringValue ?? currency)
            }
            if key.lowercased().contains("rate"), int >= 100 { return Self.percent(int) }
            return value.stringValue
        case let .string(string):
            if string.isEmpty { return nil }
            if let date = date(string) { return date }
            if key.lowercased().contains("status") || key == "type" || key.hasSuffix("Type") || key == "method" || key == "frequency" {
                return string.replacingOccurrences(of: "_", with: " ").humanized
            }
            if let int = Int(string), isMoney(key, spec: spec) {
                return Money.format(int, currency: record["currencyCode"]?.stringValue ?? currency)
            }
            if let double = Double(string), string.contains("."), isMoney(key, spec: spec) {
                return Money.format(Int((double * 100).rounded()), currency: record["currencyCode"]?.stringValue ?? currency)
            }
            return string
        case let .object(object):
            for name in ["name", "title", "displayName", "accountName", "invoiceNumber", "billNumber", "number", "code", "email"] {
                if let text = object[name]?.stringValue, !text.isEmpty {
                    if name == "code", let accountName = object["name"]?.stringValue { return "\(text) · \(accountName)" }
                    return text
                }
            }
            return nil
        case let .array(items):
            if items.isEmpty { return nil }
            let names = items.compactMap { item -> String? in
                if case .object = item { return text(item, key: key, record: record, spec: spec, currency: currency) }
                return item.stringValue
            }
            return names.isEmpty ? "\(items.count)" : names.prefix(4).joined(separator: ", ") + (names.count > 4 ? " +\(names.count - 4)" : "")
        }
    }

    /// Basis points (1000 = 10%) as a percentage.
    static func percent(_ basisPoints: Int) -> String {
        let value = Double(basisPoints) / 100
        return value.rounded() == value ? "\(Int(value))%" : String(format: "%.2f%%", value)
    }

    /// "2026-10-12" or an ISO moment -> "12 Oct 2026".
    static func date(_ string: String) -> String? {
        guard string.count >= 10, string.prefix(4).allSatisfy(\.isNumber), string.dropFirst(4).first == "-" else { return nil }
        if string.count == 10 { return DubblDate.parseDay(string).map { $0.formatted(.dateTime.day().month(.abbreviated).year()) } }
        return DubblDate.parseMoment(string).map { $0.formatted(.dateTime.day().month(.abbreviated).year().hour().minute()) }
    }

    /// Status words read the same everywhere.
    static func tone(_ status: String, spec: RecordSpec?) -> Tone {
        if let tone = spec?.tones[status] { return tone }
        switch status.lowercased() {
        case "paid", "approved", "accepted", "active", "completed", "complete", "received", "posted", "reconciled", "converted", "won", "closed_won", "fulfilled", "applied", "finalized", "filed", "success", "succeeded", "enabled", "in_stock":
            return .positive
        case "overdue", "rejected", "void", "voided", "declined", "failed", "cancelled", "canceled", "lost", "closed_lost", "expired", "out_of_stock", "disabled", "error":
            return .negative
        case "sent", "submitted", "pending", "open", "scheduled", "in_progress", "processing", "ordered", "issued", "partial", "partially_paid", "partially_received":
            return .info
        case "pending_approval", "awaiting_approval", "low_stock", "on_hold", "paused", "due":
            return .warning
        default:
            return .neutral
        }
    }

    static func statusLabel(_ status: String) -> String {
        status.replacingOccurrences(of: "_", with: " ").humanized
    }
}
