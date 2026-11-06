import SwiftUI

/// One claim: `GET expenses/{id}` -> `{ expenseClaim }` with its items and the
/// people who submitted and approved it.
@MainActor @Observable
final class PurchasesExpenseDetailStore {
    private(set) var claim: ExpenseClaim?
    private(set) var errorMessage: String?
    private(set) var working: String?
    private var generation = 0

    func load(_ api: APIClient, id: String) async {
        generation += 1
        let current = generation
        do {
            let response: ExpenseClaimResponse = try await api.get("expenses/\(id)")
            guard current == generation else { return }
            withAnimation(.snappy) { claim = response.expenseClaim }
            errorMessage = nil
        } catch {
            guard current == generation else { return }
            if claim == nil { errorMessage = error.localizedDescription }
        }
    }

    func perform(_ action: String, request: @escaping () async throws -> ExpenseClaimResponse) async throws -> ExpenseClaim? {
        working = action
        defer { working = nil }
        let response = try await request()
        withAnimation(.spring(response: 0.38, dampingFraction: 0.85)) {
            claim = PurchasesKit.merged(response.expenseClaim, into: claim)
        }
        return claim
    }
}

struct ExpenseDetailView: View {
    let id: String
    /// Lets the list that pushed this screen mirror changes.
    var onUpdate: ((ExpenseClaim) -> Void)?

    @Environment(AppEnvironment.self) private var env
    @State private var store = PurchasesExpenseDetailStore()
    @State private var rejecting = false
    @State private var rejectReason = ""
    @State private var confirmPaid = false
    @State private var success = 0

    var body: some View {
        Group {
            if let claim = store.claim {
                content(claim)
            } else if let message = store.errorMessage {
                ErrorStateView(message: message) { await store.load(env.api, id: id) }
                    .frame(maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(DTheme.shell)
        .navigationTitle("Expense")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar { toolbar }
        .task { await store.load(env.api, id: id) }
        .alert("Reject this claim?", isPresented: $rejecting) {
            TextField("Reason", text: $rejectReason)
            Button("Cancel", role: .cancel) {}
            Button("Reject", role: .destructive) {
                let reason = rejectReason.trimmingCharacters(in: .whitespacesAndNewlines)
                run("reject", toast: "Claim rejected") {
                    try await env.api.post("expenses/\(id)/reject", body: PurchasesReasonBody(reason: reason))
                }
            }
            .disabled(rejectReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: {
            Text("Say what needs fixing. They'll see this with the claim.")
        }
        .confirmationDialog("Mark this claim as paid?", isPresented: $confirmPaid, titleVisibility: .visible) {
            Button("Mark as paid") {
                run("pay", toast: "Claim marked as paid") {
                    try await env.api.post("expenses/\(id)/pay", body: PurchasesDateBody(date: DubblDate.string(.now)))
                }
            }
        } message: {
            Text("Records the reimbursement from your main bank account, dated today.")
        }
        .sensoryFeedback(.success, trigger: success)
    }

    // MARK: Content

    private func content(_ claim: ExpenseClaim) -> some View {
        ScrollView {
            VStack(spacing: 22) {
                PurchasesHero(
                    name: claim.submittedByUser?.displayName ?? "Expense claim",
                    amount: claim.totalAmount,
                    currency: claim.currencyCode,
                    caption: claim.title,
                    status: ExpenseStatus.label(claim.status),
                    tone: ExpenseStatus.tone(claim.status),
                    avatarURL: claim.submittedByUser?.image
                )

                if claim.status == "rejected", let reason = claim.rejectionReason, !reason.isEmpty {
                    rejectionNotice(reason)
                }

                if let items = claim.items, !items.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel(items.count == 1 ? "1 item" : "\(items.count) items")
                        CardStack(dividerInset: 72) {
                            ForEach(items) { item in
                                itemRow(item, currency: claim.currencyCode)
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Timeline")
                    PurchasesExpenseTimeline(claim: claim)
                        .dubblCard()
                }

                if let description = claim.description, !description.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Notes")
                        Text(description)
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
            actionBar(claim)
        }
    }

    private func rejectionNotice(_ reason: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "arrow.uturn.backward.circle")
                .font(.system(size: 15, weight: .medium))
            VStack(alignment: .leading, spacing: 3) {
                Text("Sent back")
                    .font(.system(size: 14, weight: .semibold))
                Text(reason)
                    .font(.system(size: 14))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(DTheme.negative)
        .padding(14)
        .background(Tone.negative.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func itemRow(_ item: ExpenseItem, currency: String) -> some View {
        HStack(spacing: 14) {
            if let key = item.receiptFileKey, !key.isEmpty {
                PurchasesReceiptThumbnail(fileKey: key, title: item.description)
            } else {
                IconTile(symbol: PurchasesKit.categorySymbol(item.category), size: 44)
                    .frame(width: 44, height: 56)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(item.description)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(2)
                Text([DubblDate.short(item.date), item.category ?? item.account?.name].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13))
                    .foregroundStyle(DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            MoneyText(minor: item.amount, currency: currency, size: 15)
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: Actions

    @ViewBuilder
    private func actionBar(_ claim: ExpenseClaim) -> some View {
        let working = store.working != nil
        switch claim.status {
        case "draft", "rejected":
            PurchasesActionBar {
                Button {
                    run("submit", toast: claim.status == "rejected" ? "Claim resubmitted" : "Claim submitted") {
                        try await env.api.post("expenses/\(id)/submit")
                    }
                } label: {
                    label(claim.status == "rejected" ? "Resubmit for approval" : "Submit for approval", busy: store.working == "submit", inverse: true)
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
            }
        case "submitted":
            PurchasesActionBar {
                if env.session.canManage {
                    Button {
                        rejectReason = ""
                        rejecting = true
                    } label: {
                        label("Reject", busy: store.working == "reject", inverse: false)
                    }
                    .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
                    .disabled(working)
                    Button {
                        run("approve", toast: "Claim approved") { try await env.api.post("expenses/\(id)/approve") }
                    } label: {
                        label("Approve", busy: store.working == "approve", inverse: true)
                    }
                    .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                    .disabled(working)
                } else {
                    recallButton(working: working)
                }
            }
        case "approved" where env.session.canManage:
            PurchasesActionBar {
                Button {
                    confirmPaid = true
                } label: {
                    label("Mark as paid", busy: store.working == "pay", inverse: true)
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(working)
            }
        default:
            EmptyView()
        }
    }

    private func recallButton(working: Bool) -> some View {
        Button {
            run("recall", toast: "Claim recalled to draft") { try await env.api.post("expenses/\(id)/recall") }
        } label: {
            label("Recall to draft", busy: store.working == "recall", inverse: false)
        }
        .buttonStyle(SoftButtonStyle(size: .large, fullWidth: true))
        .disabled(working)
    }

    private func label(_ title: String, busy: Bool, inverse: Bool) -> some View {
        ZStack {
            Text(title).opacity(busy ? 0 : 1)
            if busy { ProgressView().tint(inverse ? DTheme.inkInverse : DTheme.ink) }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if let claim = store.claim, claim.status == "submitted", env.session.canManage {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Recall to draft", systemImage: "arrow.uturn.backward") {
                        run("recall", toast: "Claim recalled to draft") { try await env.api.post("expenses/\(id)/recall") }
                    }
                } label: {
                    Label("More", systemImage: "ellipsis")
                }
            }
        }
    }

    private func run(_ action: String, toast: String, request: @escaping () async throws -> ExpenseClaimResponse) {
        Task {
            do {
                if let updated = try await store.perform(action, request: request) {
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

/// Created, submitted, approved, paid: a vertical line of steps, with the
/// rejection shown where it happened.
struct PurchasesExpenseTimeline: View {
    let claim: ExpenseClaim

    private struct Step: Identifiable {
        let id: String
        let title: String
        let detail: String?
        let done: Bool
        let tone: Tone
    }

    private var steps: [Step] {
        let status = claim.status
        var steps = [Step(id: "created", title: "Created", detail: claim.createdAt.map { DubblDate.display($0) }, done: true, tone: .neutral)]
        let submitted = claim.submittedAt != nil || ["submitted", "approved", "paid", "rejected"].contains(status)
        steps.append(Step(
            id: "submitted",
            title: "Submitted",
            detail: claim.submittedAt.map { DubblDate.display($0) } ?? (submitted ? nil : "Not yet"),
            done: submitted,
            tone: .neutral
        ))
        if status == "rejected" {
            steps.append(Step(id: "rejected", title: "Rejected", detail: claim.rejectionReason, done: true, tone: .negative))
            return steps
        }
        let approved = ["approved", "paid"].contains(status)
        let approver = claim.approvedByUser.map { " by \($0.displayName)" } ?? ""
        steps.append(Step(
            id: "approved",
            title: "Approved",
            detail: approved ? (claim.approvedAt.map { DubblDate.display($0) + approver } ?? approver.trimmingCharacters(in: .whitespaces)) : "Waiting",
            done: approved,
            tone: .neutral
        ))
        steps.append(Step(
            id: "paid",
            title: "Reimbursed",
            detail: status == "paid" ? claim.paidAt.map { DubblDate.display($0) } : "Waiting",
            done: status == "paid",
            tone: .positive
        ))
        return steps
    }

    var body: some View {
        let steps = steps
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        ZStack {
                            Circle()
                                .fill(step.done ? (step.tone == .neutral ? DTheme.ink : step.tone.color) : DTheme.card)
                                .frame(width: 10, height: 10)
                            if !step.done {
                                Circle().strokeBorder(DTheme.inkTertiary, lineWidth: 1.2).frame(width: 10, height: 10)
                            }
                        }
                        .frame(height: 20)
                        if index < steps.count - 1 {
                            Rectangle()
                                .fill(steps[index + 1].done ? DTheme.ink.opacity(0.35) : DTheme.hairline)
                                .frame(width: 1.5)
                                .frame(maxHeight: .infinity)
                        }
                    }
                    .frame(width: 12)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.title)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(step.done ? (step.tone == .negative ? DTheme.negative : DTheme.ink) : DTheme.inkTertiary)
                        if let detail = step.detail, !detail.isEmpty {
                            Text(detail)
                                .font(.system(size: 13))
                                .foregroundStyle(step.done ? DTheme.inkSecondary : DTheme.inkTertiary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.bottom, index < steps.count - 1 ? 16 : 0)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}
