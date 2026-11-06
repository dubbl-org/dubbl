import SwiftUI

/// Bills for the Purchases tab: `GET bills` paged by status, with the
/// `bills/counts` breakdown for the totals and drawer counts.
@MainActor @Observable
final class PurchasesBillsStore {
    private(set) var bills: [Bill] = []
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
        ("all", "All"), ("draft", "Draft"), ("pending_approval", "Awaiting approval"),
        ("received", "Awaiting payment"), ("partial", "Part paid"), ("overdue", "Overdue"),
        ("paid", "Paid"), ("void", "Void"),
    ]

    /// How many sit in a status, for the drawer; nil until counts load.
    func count(_ status: String) -> Int? {
        guard let counts else { return nil }
        return status == "all" ? counts.total : counts.count(status)
    }

    /// Received, part paid and overdue bills still owed.
    var toPay: Int { ["received", "partial", "overdue"].reduce(0) { $0 + (counts?.amount($1) ?? 0) } }
    var toPayCount: Int { ["received", "partial", "overdue"].reduce(0) { $0 + (counts?.count($1) ?? 0) } }
    var overdue: Int { counts?.amount("overdue") ?? 0 }
    var overdueCount: Int { counts?.count("overdue") ?? 0 }

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
            var result: Page<Bill> = try await api.get("bills", query: query(page: 1))
            let fresh = await countsResult
            #if DEBUG
            // Fixtures ignore query strings, so filter here to keep demo screens honest.
            if DemoData.isEnabled, requested != "all" {
                result.data = result.data.filter { $0.status == requested }
                result.pagination = nil
            }
            #endif
            guard current == generation else { return }
            withAnimation(.snappy) {
                bills = result.data
                if let fresh { counts = fresh }
            }
            hasMore = result.hasMore
            page = 1
            loadedFilter = requested
            errorMessage = nil
        } catch {
            _ = await countsResult
            guard current == generation else { return }
            if loadedFilter != requested || bills.isEmpty {
                bills = []
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
            let result: Page<Bill> = try await api.get("bills", query: query(page: page + 1))
            guard current == generation else { return }
            let known = Set(bills.map(\.id))
            bills.append(contentsOf: result.data.filter { !known.contains($0.id) })
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

    /// Put an updated bill back in place, dropping it if it no longer fits the filter.
    func apply(_ bill: Bill) {
        guard let index = bills.firstIndex(where: { $0.id == bill.id }) else { return }
        withAnimation(.snappy) {
            let merged = PurchasesKit.merged(bill, into: bills[index])
            if filter != "all", merged.status != filter {
                bills.remove(at: index)
            } else {
                bills[index] = merged
            }
        }
    }

    private static func fetchCounts(_ api: APIClient) async -> StatusCounts? {
        try? await api.get("bills/counts")
    }
}

/// One bill as a ledger line: supplier, then the number and when it's due;
/// what's still owed and its status on the right.
struct PurchasesBillRow: View {
    let bill: Bill

    /// Rows are narrow; the long statuses get a shorter word here.
    private var shortLabel: String {
        switch bill.status {
        case "pending_approval": "To approve"
        case "received": "To pay"
        default: BillStatus.label(bill.status)
        }
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(bill.contact?.name ?? "Unknown supplier")
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(bill.billNumber)
                        .font(.system(size: 12.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkTertiary)
                    Text(PurchasesKit.dueText(bill))
                        .font(.system(size: 13))
                        .foregroundStyle(PurchasesKit.isLate(bill) ? DTheme.negative : DTheme.inkSecondary)
                }
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                Text(Money.format(bill.status == "partial" ? bill.amountDue : bill.total, currency: bill.currencyCode))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(bill.status == "void" ? DTheme.inkTertiary : DTheme.ink)
                    .strikethrough(bill.status == "void", color: DTheme.inkTertiary)
                    .fixedSize()
                LedgerStatus(text: shortLabel, tone: BillStatus.tone(bill.status))
            }
        }
        .padding(.vertical, 13)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Record a payment against a bill: amount (minor units), date, method, reference.
struct PurchasesPaymentSheet: View {
    let bill: Bill
    let onPaid: (Bill) -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var amount: Int
    @State private var date = Date()
    @State private var method: PaymentMethod = .bankTransfer
    @State private var reference = ""
    @State private var saving = false
    @State private var error: String?

    init(bill: Bill, onPaid: @escaping (Bill) -> Void) {
        self.bill = bill
        self.onPaid = onPaid
        _amount = State(initialValue: bill.amountDue)
    }

    private var isValid: Bool { amount > 0 && amount <= bill.amountDue }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        Avatar(name: bill.contact?.name ?? "Supplier", size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(bill.contact?.name ?? "Supplier")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            Text("\(bill.billNumber) · \(Money.format(bill.amountDue, currency: bill.currencyCode)) due")
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 4)

                    CardStack {
                        FieldRow(label: "Amount") {
                            AmountField(minor: $amount, currency: bill.currencyCode)
                        }
                        HStack {
                            Text("Date").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                            Spacer()
                            DatePicker("Date", selection: $date, displayedComponents: .date)
                                .labelsHidden()
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: 52)
                        HStack {
                            Text("Method").font(.system(size: 16)).foregroundStyle(DTheme.ink)
                            Spacer()
                            Picker("Method", selection: $method) {
                                ForEach(PaymentMethod.allCases) { Text($0.label).tag($0) }
                            }
                            .labelsHidden()
                            .tint(DTheme.inkSecondary)
                        }
                        .padding(.leading, 16)
                        .padding(.trailing, 4)
                        .frame(minHeight: 52)
                        FieldRow(label: "Reference") {
                            TextField("Optional", text: $reference)
                                .textInputAutocapitalization(.never)
                        }
                    }

                    if amount > bill.amountDue {
                        notice("That's more than the \(Money.format(bill.amountDue, currency: bill.currencyCode)) still due.")
                    } else if let error {
                        notice(error)
                    }
                }
                .padding(20)
                .animation(.snappy(duration: 0.22), value: error)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("Record payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Record") }
                    }
                    .disabled(!isValid || saving)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
    }

    private func notice(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.circle")
            Text(text).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .font(.system(size: 14))
        .foregroundStyle(DTheme.negative)
        .padding(12)
        .background(Tone.negative.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .transition(.opacity)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        let trimmed = reference.trimmingCharacters(in: .whitespaces)
        let body = PurchasesBillPayBody(
            amount: amount,
            date: DubblDate.string(date),
            method: method.rawValue,
            reference: trimmed.isEmpty ? nil : trimmed
        )
        do {
            let response: BillResponse = try await env.api.post("bills/\(bill.id)/pay", body: body)
            onPaid(PurchasesKit.merged(response.bill, into: bill))
            env.toast.show(response.bill.status == "paid" ? "Bill paid" : "Payment recorded")
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
