import SwiftUI

/// One bill: `GET bills/{id}` -> `{ bill }` with its contact and lines.
@MainActor @Observable
final class PurchasesBillDetailStore {
    private(set) var bill: Bill?
    private(set) var errorMessage: String?
    private(set) var working: String?
    private var generation = 0

    func load(_ api: APIClient, id: String) async {
        generation += 1
        let current = generation
        do {
            let response: BillResponse = try await api.get("bills/\(id)")
            guard current == generation else { return }
            withAnimation(.snappy) { bill = response.bill }
            errorMessage = nil
        } catch {
            guard current == generation else { return }
            if bill == nil { errorMessage = error.localizedDescription }
        }
    }

    func set(_ fresh: Bill) {
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) { bill = PurchasesKit.merged(fresh, into: bill) }
    }

    /// Runs a status change, merging the bare row the route answers with.
    func perform(_ action: String, _ api: APIClient, request: @escaping () async throws -> BillResponse) async throws -> Bill? {
        working = action
        defer { working = nil }
        let response = try await request()
        set(response.bill)
        return bill
    }
}

struct BillDetailView: View {
    let id: String
    /// Lets the list that pushed this screen mirror changes.
    var onUpdate: ((Bill) -> Void)?

    @Environment(AppEnvironment.self) private var env
    @State private var store = PurchasesBillDetailStore()
    @State private var paying = false
    @State private var confirmVoid = false
    @State private var rejecting = false
    @State private var rejectReason = ""
    @State private var success = 0

    var body: some View {
        Group {
            if let bill = store.bill {
                content(bill)
            } else if let message = store.errorMessage {
                ErrorStateView(message: message) { await store.load(env.api, id: id) }
                    .frame(maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(DTheme.shell)
        .navigationTitle(store.bill?.billNumber ?? "Bill")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar { toolbar }
        .task { await store.load(env.api, id: id) }
        .sheet(isPresented: $paying) {
            if let bill = store.bill {
                PurchasesPaymentSheet(bill: bill) { updated in
                    store.set(updated)
                    onUpdate?(updated)
                    success += 1
                }
            }
        }
        .confirmationDialog("Void this bill?", isPresented: $confirmVoid, titleVisibility: .visible) {
            Button("Void bill", role: .destructive) { run("void", toast: "Bill voided") { try await env.api.post("bills/\(id)/void") } }
        } message: {
            Text("Its entries are reversed and it can't be paid any more.")
        }
        .alert("Reject this bill?", isPresented: $rejecting) {
            TextField("Reason (optional)", text: $rejectReason)
            Button("Cancel", role: .cancel) {}
            Button("Reject", role: .destructive) {
                let reason = rejectReason.trimmingCharacters(in: .whitespacesAndNewlines)
                run("reject", toast: "Bill sent back to draft") {
                    try await env.api.post("bills/\(id)/reject", body: PurchasesReasonBody(reason: reason.isEmpty ? nil : reason))
                }
            }
        } message: {
            Text("It goes back to draft so it can be fixed.")
        }
        .sensoryFeedback(.success, trigger: success)
    }

    // MARK: Content

    private func content(_ bill: Bill) -> some View {
        ScrollView {
            VStack(spacing: 22) {
                PurchasesHero(
                    name: bill.contact?.name ?? "Unknown supplier",
                    amount: PurchasesKit.isOpen(bill) ? bill.amountDue : bill.total,
                    currency: bill.currencyCode,
                    caption: heroCaption(bill),
                    status: BillStatus.label(bill.status),
                    tone: BillStatus.tone(bill.status)
                )

                if bill.amountPaid > 0, bill.status != "paid" {
                    paidProgress(bill)
                }

                if let lines = bill.lines, !lines.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(lines.count == 1 ? "1 line" : "\(lines.count) lines")
                        CardStack {
                            ForEach(lines.sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }) { line in
                                lineRow(line, currency: bill.currencyCode)
                            }
                        }
                    }
                }

                CardStack {
                    DetailRow("Subtotal", Money.format(bill.subtotal, currency: bill.currencyCode))
                    DetailRow("Tax", Money.format(bill.taxTotal, currency: bill.currencyCode))
                    DetailRow(label: "Total") {
                        Text(Money.format(bill.total, currency: bill.currencyCode)).fontWeight(.semibold)
                    }
                    if bill.amountPaid > 0 {
                        DetailRow("Paid", "-" + Money.format(bill.amountPaid, currency: bill.currencyCode))
                    }
                    if bill.status != "void" {
                        DetailRow(label: "Amount due") {
                            MoneyText(minor: bill.amountDue, currency: bill.currencyCode, weight: .semibold)
                                .foregroundStyle(bill.status == "overdue" ? DTheme.negative : DTheme.ink)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Details")
                    CardStack {
                        DetailRow("Bill number", bill.billNumber)
                        DetailRow("Issued", DubblDate.display(bill.issueDate))
                        DetailRow(label: "Due") {
                            Text(DubblDate.display(bill.dueDate))
                                .foregroundStyle(PurchasesKit.isLate(bill) ? DTheme.negative : DTheme.ink)
                        }
                        if let paidAt = bill.paidAt {
                            DetailRow("Paid on", DubblDate.display(paidAt))
                        }
                        if let reference = bill.reference, !reference.isEmpty {
                            DetailRow("Reference", reference)
                        }
                        DetailRow("Currency", bill.currencyCode)
                        if let email = bill.contact?.email {
                            DetailRow("Supplier email", email)
                        }
                    }
                }

                if let notes = bill.notes, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Notes")
                        Text(notes)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .dubblCard()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .defaultScrollAnchor(PurchasesKit.demoScrollAnchor)
        .refreshable { await store.load(env.api, id: id) }
        .safeAreaInset(edge: .bottom) {
            actionBar(bill)
        }
    }

    private func heroCaption(_ bill: Bill) -> String {
        if PurchasesKit.isOpen(bill) {
            return bill.amountPaid > 0
                ? "Left to pay · \(PurchasesKit.dueText(bill))"
                : PurchasesKit.dueText(bill)
        }
        switch bill.status {
        case "paid": return PurchasesKit.dueText(bill)
        case "void": return "Voided"
        default: return "Due \(DubblDate.display(bill.dueDate))"
        }
    }

    private func paidProgress(_ bill: Bill) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(Money.format(bill.amountPaid, currency: bill.currencyCode)) paid")
                Spacer()
                Text("of \(Money.format(bill.total, currency: bill.currencyCode))")
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .font(DFont.figure(13.5))
            .foregroundStyle(DTheme.ink)
            PurchasesProgressBar(fraction: bill.total > 0 ? Double(bill.amountPaid) / Double(bill.total) : 0)
        }
        .dubblCard(padding: 14)
    }

    private func lineRow(_ line: DocumentLine, currency: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.description)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(lineDetail(line, currency: currency))
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            Spacer(minLength: 8)
            MoneyText(minor: line.amount, currency: currency, size: 15)
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func lineDetail(_ line: DocumentLine, currency: String) -> String {
        let quantity = line.quantityValue.formatted(.number.precision(.fractionLength(0 ... 2)))
        var parts = ["\(quantity) × \(Money.format(line.unitPrice, currency: currency))"]
        if let account = line.account?.name { parts.append(account) }
        return parts.joined(separator: " · ")
    }

    // MARK: Actions

    @ViewBuilder
    private func actionBar(_ bill: Bill) -> some View {
        let working = store.working != nil
        if bill.status == "draft", env.session.canManage {
            PurchasesActionBar {
                Button {
                    run("receive", toast: "Bill received") { try await env.api.post("bills/\(id)/receive") }
                } label: {
                    label("Mark as received", busy: store.working == "receive", inverse: true)
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
            }
        } else if bill.status == "pending_approval", env.session.canManage {
            PurchasesActionBar {
                Button {
                    rejectReason = ""
                    rejecting = true
                } label: {
                    label("Reject", busy: store.working == "reject", inverse: false)
                }
                .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
                Button {
                    run("approve", toast: "Bill approved") { try await env.api.post("bills/\(id)/approve") }
                } label: {
                    label("Approve", busy: store.working == "approve", inverse: true)
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
            }
        } else if PurchasesKit.isOpen(bill) {
            PurchasesActionBar {
                Button {
                    paying = true
                } label: {
                    Label("Record payment", systemImage: "banknote")
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            }
        }
    }

    private func label(_ title: String, busy: Bool, inverse: Bool) -> some View {
        ZStack {
            Text(title).opacity(busy ? 0 : 1)
            if busy { ProgressView().tint(inverse ? DTheme.inkInverse : DTheme.ink) }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if let bill = store.bill {
            let canVoid = bill.status != "void" && bill.amountPaid == 0 && env.session.canManage
            if canVoid || PurchasesKit.isOpen(bill) {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if PurchasesKit.isOpen(bill) {
                            Button("Record payment", systemImage: "banknote") { paying = true }
                        }
                        if canVoid {
                            Divider()
                            Button("Void bill", systemImage: "nosign", role: .destructive) { confirmVoid = true }
                        }
                    } label: {
                        Label("More", systemImage: "ellipsis")
                    }
                }
            }
        }
    }

    private func run(_ action: String, toast: String, request: @escaping () async throws -> BillResponse) {
        Task {
            do {
                if let updated = try await store.perform(action, env.api, request: request) {
                    onUpdate?(updated)
                    env.toast.show(toast)
                    success += 1
                }
            } catch {
                env.toast.error(error)
            }
        }
    }
}
