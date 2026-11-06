import SwiftUI

// Record search (`GET search?q=`) used by the More tab's field: the hits,
// grouped by kind, and where each one opens.

/// Opens a record hit inside whichever stack is showing results.
struct SearchDestination: View {
    let route: SearchRoute

    var body: some View {
        switch route.kind {
        case .invoice: InvoiceDetailView(id: route.id)
        case .bill: BillDetailView(id: route.id)
        case .expense: ExpenseDetailView(id: route.id)
        case .contact: ContactDetailView(id: route.id)
        case .document, .other: EmptyView()
        }
    }
}

// MARK: - Row

struct SearchResultRow: View {
    let hit: SearchHit

    var body: some View {
        HStack(spacing: 12) {
            if hit.kind == .contact {
                Avatar(name: hit.title, size: 34)
            } else {
                IconTile(symbol: hit.kind.symbol, size: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(hit.title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text(hit.subtitle?.isEmpty == false ? hit.subtitle! : hit.kind.singular)
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

// MARK: - Model

/// One hit from GET search?q=: `{ type, id, title, subtitle, href }`.
struct SearchHit: Decodable, Sendable, Hashable, Identifiable {
    var type: String
    var rawID: String
    var title: String
    var subtitle: String?
    var href: String?

    var id: String { "\(type)-\(rawID)" }
    var kind: SearchKind { SearchKind(rawValue: type) ?? .other }

    enum CodingKeys: String, CodingKey {
        case type, rawID = "id", title, subtitle, href
    }
}

struct SearchResponse: Decodable, Sendable {
    var results: [SearchHit]
}

enum SearchKind: String, CaseIterable, Sendable {
    case contact, invoice, bill, expense, document, other

    var title: String {
        switch self {
        case .contact: "Contacts"
        case .invoice: "Invoices"
        case .bill: "Bills"
        case .expense: "Expenses"
        case .document: "Documents"
        case .other: "Other"
        }
    }

    var singular: String {
        switch self {
        case .contact: "Contact"
        case .invoice: "Invoice"
        case .bill: "Bill"
        case .expense: "Expense"
        case .document: "Document"
        case .other: "Result"
        }
    }

    var symbol: String {
        switch self {
        case .contact: "person"
        case .invoice: "doc.text"
        case .bill: "tray.and.arrow.down"
        case .expense: "receipt"
        case .document: "paperclip"
        case .other: "magnifyingglass"
        }
    }
}

struct SearchRoute: Hashable {
    let kind: SearchKind
    let id: String

    init?(_ hit: SearchHit) {
        switch hit.kind {
        case .invoice, .bill, .expense, .contact:
            kind = hit.kind
            id = hit.rawID
        case .document, .other:
            return nil
        }
    }
}

// MARK: - Store

@MainActor @Observable
final class SearchStore {
    struct Group {
        let kind: SearchKind
        let hits: [SearchHit]
    }

    private(set) var results: [SearchHit] = []
    private(set) var isLoading = false
    private(set) var error: String?
    /// The term the current results answer; nil before the first search.
    private(set) var lastQuery: String?
    private var generation = 0

    /// The server needs at least two characters.
    func isActive(_ term: String) -> Bool {
        term.trimmingCharacters(in: .whitespaces).count >= 2
    }

    var groups: [Group] {
        SearchKind.allCases.compactMap { kind in
            let hits = results.filter { $0.kind == kind }
            return hits.isEmpty ? nil : Group(kind: kind, hits: hits)
        }
    }

    func search(_ api: APIClient, term: String) async {
        generation += 1
        let gen = generation
        isLoading = true
        do {
            let response: SearchResponse = try await api.get("search", query: ["q": term])
            guard gen == generation else { return }
            var hits = response.results
            #if DEBUG
            if DemoData.isEnabled {
                hits = hits.filter { $0.title.localizedCaseInsensitiveContains(term) || ($0.subtitle ?? "").localizedCaseInsensitiveContains(term) }
            }
            #endif
            withAnimation(.snappy) {
                results = hits
                lastQuery = term
                error = nil
                isLoading = false
            }
        } catch {
            guard gen == generation, !(error is CancellationError) else { return }
            self.error = error.localizedDescription
            lastQuery = term
            isLoading = false
        }
    }

    func clear() {
        generation += 1
        results = []
        lastQuery = nil
        error = nil
        isLoading = false
    }
}
