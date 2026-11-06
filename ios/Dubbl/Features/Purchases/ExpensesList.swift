import SwiftUI

/// Expense claims for the Purchases tab: `GET expenses` paged by status, with
/// `expenses/counts` for the totals and drawer counts.
@MainActor @Observable
final class PurchasesExpensesStore {
    private(set) var claims: [ExpenseClaim] = []
    private(set) var counts: StatusCounts?
    private(set) var hasMore = false
    private(set) var hasLoaded = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    var filter = "all"

    private var page = 1
    private var loadedFilter: String?
    private var generation = 0
    private static let limit = 30

    static let filters: [(value: String, label: String)] = [
        ("all", "All"), ("draft", "Draft"), ("submitted", "Submitted"),
        ("approved", "Approved"), ("paid", "Paid"), ("rejected", "Rejected"),
    ]

    /// How many sit in a status, for the drawer; nil until counts load.
    func count(_ status: String) -> Int? {
        guard let counts else { return nil }
        return status == "all" ? counts.total : counts.count(status)
    }

    var awaitingApproval: Int { counts?.amount("submitted") ?? 0 }
    var awaitingApprovalCount: Int { counts?.count("submitted") ?? 0 }
    var toReimburse: Int { counts?.amount("approved") ?? 0 }
    var toReimburseCount: Int { counts?.count("approved") ?? 0 }

    private func query(page: Int) -> [String: String?] {
        ["page": "\(page)", "limit": "\(Self.limit)", "status": filter == "all" ? nil : filter]
    }

    func load(_ api: APIClient) async {
        generation += 1
        let current = generation
        let requested = filter
        isLoading = true
        if loadedFilter != requested { errorMessage = nil }
        async let countsResult = Self.fetchCounts(api)
        do {
            var result: Page<ExpenseClaim> = try await api.get("expenses", query: query(page: 1))
            let fresh = await countsResult
            #if DEBUG
            if DemoData.isEnabled, requested != "all" {
                result.data = result.data.filter { $0.status == requested }
                result.pagination = nil
            }
            #endif
            guard current == generation else { return }
            withAnimation(.snappy) {
                claims = result.data
                if let fresh { counts = fresh }
            }
            hasMore = result.hasMore
            page = 1
            loadedFilter = requested
            errorMessage = nil
        } catch {
            _ = await countsResult
            guard current == generation else { return }
            if loadedFilter != requested || claims.isEmpty {
                claims = []
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
        hasLoaded = true
    }

    func loadMore(_ api: APIClient) async {
        guard hasMore, !isLoading else { return }
        let current = generation
        do {
            let result: Page<ExpenseClaim> = try await api.get("expenses", query: query(page: page + 1))
            guard current == generation else { return }
            let known = Set(claims.map(\.id))
            claims.append(contentsOf: result.data.filter { !known.contains($0.id) })
            hasMore = result.hasMore
            page += 1
        } catch {
            hasMore = false
        }
    }

    func refreshCounts(_ api: APIClient) async {
        if let fresh = await Self.fetchCounts(api) {
            withAnimation(.snappy) { counts = fresh }
        }
    }

    func apply(_ claim: ExpenseClaim) {
        guard let index = claims.firstIndex(where: { $0.id == claim.id }) else { return }
        withAnimation(.snappy) {
            let merged = PurchasesKit.merged(claim, into: claims[index])
            if filter != "all", merged.status != filter {
                claims.remove(at: index)
            } else {
                claims[index] = merged
            }
        }
    }

    /// A claim just created on this device goes straight to the top.
    func insert(_ claim: ExpenseClaim) {
        guard filter == "all" || filter == claim.status, !claims.contains(where: { $0.id == claim.id }) else { return }
        withAnimation(.snappy) { claims.insert(claim, at: 0) }
    }

    private static func fetchCounts(_ api: APIClient) async -> StatusCounts? {
        try? await api.get("expenses/counts")
    }
}

/// One claim as a ledger line: what it was for, who claimed it and when;
/// the amount and its status on the right.
struct PurchasesExpenseRow: View {
    let claim: ExpenseClaim

    private var submitter: String { claim.submittedByUser?.displayName ?? "Someone" }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(claim.title)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("\(submitter) · \(DubblDate.short(claim.submittedAt ?? claim.createdAt))")
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(claim.totalAmount, currency: claim.currencyCode))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(claim.status == "rejected" ? DTheme.inkTertiary : DTheme.ink)
                    .fixedSize()
                LedgerStatus(text: ExpenseStatus.label(claim.status), tone: ExpenseStatus.tone(claim.status))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
