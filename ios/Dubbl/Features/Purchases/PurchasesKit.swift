import SwiftUI

// Request and response shapes for the bill and expense routes, plus small
// helpers the Purchases screens share.

/// Bill mutations (receive, approve, reject, void, pay) answer `{ bill }` with
/// the bare row, so contact and lines are carried over from what's on screen.
struct PurchasesBillPayBody: Encodable, Sendable {
    var amount: Int // minor units
    var date: String
    var method: String
    var reference: String?
}

struct PurchasesReasonBody: Encodable, Sendable {
    var reason: String?
}

struct PurchasesDateBody: Encodable, Sendable {
    var date: String
}

/// `POST attachments/presign` -> `{ uploadUrl, attachment }`.
struct PurchasesPresignBody: Encodable, Sendable {
    var fileName: String
    var contentType: String
    var fileSize: Int
}

struct PurchasesPresignResponse: Decodable, Sendable {
    struct Attachment: Decodable, Sendable {
        var id: String?
        var fileKey: String
        var fileName: String?
    }

    var uploadUrl: String
    var attachment: Attachment
}

/// `GET expenses/receipt-url?fileKey=` -> a short-lived download link.
struct PurchasesReceiptURLResponse: Decodable, Sendable {
    var downloadUrl: String
}

/// `POST expenses`. Item amounts are DECIMAL major units ("12.50" -> 12.5).
struct PurchasesNewExpenseBody: Encodable, Sendable {
    struct Item: Encodable, Sendable {
        var date: String
        var description: String
        var amount: Decimal
        var category: String?
        var receiptFileKey: String?
        var receiptFileName: String?
    }

    var title: String
    var description: String?
    var items: [Item]
}

/// Destinations pushed inside the Purchases stack.
enum PurchasesRoute: Hashable {
    case bill(String)
    case expense(String)
}

enum PurchasesKit {
    static let openBillStatuses: Set<String> = ["received", "partial", "overdue"]

    static func isOpen(_ bill: Bill) -> Bool {
        openBillStatuses.contains(bill.status) && bill.amountDue > 0
    }

    /// Mutations answer the bare row; keep the relations already loaded.
    static func merged(_ fresh: Bill, into old: Bill?) -> Bill {
        var bill = fresh
        bill.id = old?.id ?? fresh.id
        bill.contact = fresh.contact ?? old?.contact
        bill.lines = fresh.lines ?? old?.lines
        return bill
    }

    static func merged(_ fresh: ExpenseClaim, into old: ExpenseClaim?) -> ExpenseClaim {
        var claim = fresh
        claim.id = old?.id ?? fresh.id
        claim.items = fresh.items ?? old?.items
        claim.submittedByUser = fresh.submittedByUser ?? old?.submittedByUser
        claim.approvedByUser = fresh.approvedByUser ?? old?.approvedByUser
        return claim
    }

    /// "Due in 5 days", "3 days overdue", "Paid 2 Oct"...
    static func dueText(_ bill: Bill) -> String {
        switch bill.status {
        case "paid":
            return bill.paidAt.map { "Paid \(DubblDate.short($0))" } ?? "Paid"
        case "void":
            return "Void"
        case "draft", "pending_approval":
            return "Due \(DubblDate.short(bill.dueDate))"
        default:
            guard let days = DubblDate.daysFromToday(bill.dueDate) else { return "Due \(DubblDate.short(bill.dueDate))" }
            switch days {
            case 0: return "Due today"
            case 1: return "Due tomorrow"
            case 2...: return "Due in \(days) days"
            case -1: return "1 day overdue"
            default: return "\(-days) days overdue"
            }
        }
    }

    static func isLate(_ bill: Bill) -> Bool {
        guard openBillStatuses.contains(bill.status) else { return false }
        return bill.status == "overdue" || (DubblDate.daysFromToday(bill.dueDate) ?? 0) < 0
    }

    /// Screenshots of the lower half: DUBBL_DEMO_OPEN=bill-bottom and so on.
    static var demoScrollAnchor: UnitPoint? {
        #if DEBUG
        if DemoData.isEnabled, DemoData.open?.hasSuffix("-bottom") == true { return .bottom }
        #endif
        return nil
    }

    #if DEBUG
    static var demoOpen: String? { DemoData.open.map { $0.replacingOccurrences(of: "-bottom", with: "") } }
    #endif

    static let expenseCategories = ["Travel", "Meals", "Software", "Office", "Equipment", "Mileage", "Other"]

    static func categorySymbol(_ category: String?) -> String {
        switch category?.lowercased() {
        case "travel": "airplane"
        case "meals": "fork.knife"
        case "software": "app.badge"
        case "office": "paperclip"
        case "equipment": "desktopcomputer"
        case "mileage": "car"
        default: "receipt"
        }
    }
}

/// The amount, status and counterpart at the top of a bill or expense.
struct PurchasesHero: View {
    let name: String
    let amount: Int
    let currency: String
    let caption: String
    let status: String
    let tone: Tone
    var avatarURL: String?
    var footnote: String?

    var body: some View {
        VStack(spacing: 14) {
            Avatar(name: name, imageURL: avatarURL, size: 52)
            VStack(spacing: 6) {
                Text(name)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
                MoneyText(minor: amount, currency: currency, size: 40, weight: .semibold)
                    .tracking(-1.2)
                    .foregroundStyle(DTheme.ink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(caption)
                    .font(.system(size: 14))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            StatusPill(text: status, tone: tone)
            if let footnote {
                Text(footnote)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

/// A thin paid-off bar for part-paid documents.
struct PurchasesProgressBar: View {
    let fraction: Double
    var tone: Tone = .positive

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DTheme.tintStrong)
                Capsule().fill(tone.color).frame(width: max(4, proxy.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/// The glass tray at the bottom of a detail screen holding its main actions.
struct PurchasesActionBar<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 10) { content }
            .padding(10)
            .glassEffect(.regular, in: .rect(cornerRadius: 32))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
    }
}

/// The "loading more" sentinel at the end of a paged list.
struct PurchasesLoadMoreRow: View {
    let load: () async -> Void

    var body: some View {
        HStack {
            Spacer()
            ProgressView().controlSize(.small)
            Spacer()
        }
        .frame(height: 44)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .task { await load() }
    }
}
