import Foundation

// Shapes for /api/v1/assistant. The transcript lives on the server; the app
// sends only the new message or an approval decision and folds the streamed
// events into turns.

/// Any JSON value: tool inputs are free-form.
enum JSONValue: Codable, Sendable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var objectValue: [String: JSONValue]? {
        if case let .object(value) = self { return value }
        return nil
    }

    var isEmpty: Bool {
        switch self {
        case .null: true
        case let .string(value): value.isEmpty
        case let .array(value): value.isEmpty
        case let .object(value): value.isEmpty
        default: false
        }
    }

    /// Compact JSON, for "All details".
    var pretty: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(self)).map { String(decoding: $0, as: UTF8.self) } ?? ""
    }
}

// MARK: - Requests

struct AssistantChatRequest: Encodable, Sendable {
    struct Approval: Encodable, Sendable {
        var toolUseId: String
        var decision: String // approve | deny
        var always: Bool?
    }

    var conversationId: String?
    var text: String?
    var approval: Approval?
    var page: String?
}

// MARK: - Stream events

/// One server-sent event from POST assistant/chat: conversation, text_delta,
/// tool_start, tool_result, step, approval_required, state, error, done.
struct AssistantEvent: Decodable, Sendable {
    var type: String
    var id: String?
    var title: String?
    var text: String?
    var name: String?
    var input: JSONValue?
    var ok: Bool?
    var skipped: Bool?
    var risk: String?
    var cents: [String]?
    var message: String?
    var awaitingApproval: Bool?
}

/// A write the run paused on, waiting for Approve or Skip.
struct AssistantPending: Decodable, Sendable, Hashable {
    var id: String
    var name: String
    var input: JSONValue?
    var risk: String?
    var cents: [String]?

    /// "send" actions email someone; everything else changes data.
    var sends: Bool { risk == "send" }
}

// MARK: - Conversations

struct AssistantConversationSummary: Decodable, Sendable, Hashable, Identifiable {
    var id: String
    var title: String?
    var waiting: Bool?
    var createdAt: String?
    var updatedAt: String?

    var displayTitle: String { title?.isEmpty == false ? title! : "New chat" }
}

struct AssistantConversationsResponse: Decodable, Sendable {
    var conversations: [AssistantConversationSummary]
}

/// GET assistant/conversations/{id}.
struct AssistantConversationResponse: Decodable, Sendable {
    struct Conversation: Decodable, Sendable {
        var id: String
        var title: String?
        var messages: [StoredMessage]?
        var pending: AssistantPending?
    }

    var conversation: Conversation
}

/// A saved message: `content` is a plain string or a list of blocks.
struct StoredMessage: Decodable, Sendable {
    struct Block: Decodable, Sendable {
        var type: String
        var text: String?
        var id: String?
        var name: String?
        var input: JSONValue?
        var toolUseId: String?
        var isError: Bool?
        var fileName: String?

        enum CodingKeys: String, CodingKey {
            case type, text, id, name, input, fileName
            case toolUseId = "tool_use_id", isError = "is_error"
        }
    }

    var role: String
    var blocks: [Block]

    enum CodingKeys: String, CodingKey { case role, content }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        role = try container.decode(String.self, forKey: .role)
        if let text = try? container.decode(String.self, forKey: .content) {
            blocks = [Block(type: "text", text: text)]
        } else {
            blocks = (try? container.decode([Block].self, forKey: .content)) ?? []
        }
    }
}

struct AssistantStatus: Decodable, Sendable {
    var configured: Bool
}

// MARK: - Labels

/// Human labels for what Tilly is doing, mirroring the web's labels.ts.
enum TillyLabels {
    private static let verbs: [String: (String, String)] = [
        "list": ("Looking up", "Looked up"), "get": ("Checking", "Checked"),
        "check": ("Checking", "Checked"), "search": ("Searching", "Searched"),
        "create": ("Creating", "Created"), "update": ("Updating", "Updated"),
        "delete": ("Deleting", "Deleted"), "send": ("Sending", "Sent"),
        "resend": ("Resending", "Resent"), "pay": ("Recording payment on", "Recorded payment on"),
        "void": ("Voiding", "Voided"), "approve": ("Approving", "Approved"),
        "reject": ("Rejecting", "Rejected"), "record": ("Recording", "Recorded"),
        "apply": ("Applying", "Applied"), "post": ("Posting", "Posted"),
        "convert": ("Converting", "Converted"), "mark": ("Marking", "Marked"),
        "match": ("Matching", "Matched"), "categorize": ("Categorizing", "Categorized"),
        "reconcile": ("Reconciling", "Reconciled"), "import": ("Importing", "Imported"),
        "link": ("Linking", "Linked"),
    ]

    private static let special: [String: (String, String)] = [
        "find_tools": ("Finding the right tools", "Found the right tools"),
        "search_everything": ("Searching everywhere", "Searched everywhere"),
        "link_document_to_record": ("Attaching the file", "Attached the file"),
    ]

    static func step(_ name: String, done: Bool) -> String {
        if let pair = special[name] { return done ? pair.1 : pair.0 }
        let parts = name.split(separator: "_").map(String.init)
        if let first = parts.first, let pair = verbs[first] {
            return "\(done ? pair.1 : pair.0) \(parts.dropFirst().joined(separator: " "))"
        }
        return "\(done ? "Read" : "Reading") the \(name.replacingOccurrences(of: "_", with: " ")) report"
    }

    static func action(_ name: String) -> String {
        if name == "link_document_to_record" { return "Attach the file to the record" }
        let plain = name.replacingOccurrences(of: "_", with: " ")
        return plain.prefix(1).uppercased() + plain.dropFirst()
    }

    static func field(_ key: String) -> String {
        var spaced = ""
        for (index, char) in key.enumerated() {
            if char.isUppercase, index > 0 { spaced.append(" ") }
            spaced.append(char == "_" ? " " : char)
        }
        let words = spaced.lowercased().split(separator: " ").filter { $0 != "id" }
        let label = words.joined(separator: " ")
        return label.isEmpty ? key : label.prefix(1).uppercased() + label.dropFirst()
    }

    /// A field value as people read it: money from cents, dates spelled out.
    static func value(_ key: String, _ value: JSONValue, cents: Set<String>, currency: String) -> String {
        switch value {
        case let .number(number):
            if key.range(of: "amount|price|total|cost|balance|subtotal|fee", options: [.regularExpression, .caseInsensitive]) != nil {
                if cents.contains(key) { return Money.format(Int(number.rounded()), currency: currency) }
                return number.formatted(.number.precision(.fractionLength(2)))
            }
            return number.formatted()
        case let .bool(flag):
            return flag ? "Yes" : "No"
        case let .string(text):
            if text.count == 10, DubblDate.parseDay(text) != nil { return DubblDate.short(text) }
            return text.count > 120 ? String(text.prefix(120)) + "…" : text
        case .null:
            return "–"
        case .array, .object:
            let compact = value.pretty.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "  ", with: "")
            return compact.count > 80 ? String(compact.prefix(80)) + "…" : compact
        }
    }

    static func isRecordID(_ value: JSONValue) -> Bool {
        guard case let .string(text) = value else { return false }
        return text.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options: [.regularExpression, .caseInsensitive]) != nil
    }
}
