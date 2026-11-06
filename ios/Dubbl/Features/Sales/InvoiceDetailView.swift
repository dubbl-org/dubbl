import SwiftUI
import UIKit

/// One invoice with its lines and payments.
@MainActor @Observable
final class SalesInvoiceDetailStore {
    private(set) var invoice: Invoice?
    private(set) var payments: [InvoicePayment] = []
    private(set) var errorMessage: String?
    private(set) var working: String?
    private var generation = 0

    var sortedLines: [DocumentLine] {
        (invoice?.lines ?? []).sorted { ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) }
    }

    func load(_ id: String, api: APIClient) async {
        generation += 1
        let current = generation
        do {
            let response: InvoiceDetailResponse = try await api.get("invoices/\(id)")
            guard current == generation else { return }
            withAnimation(.snappy) {
                invoice = response.invoice
                payments = (response.payments ?? []).sorted { $0.date > $1.date }
                errorMessage = nil
            }
        } catch {
            guard current == generation, !(error is CancellationError) else { return }
            if invoice == nil { errorMessage = error.localizedDescription }
        }
    }

    /// Runs an action with a busy marker. Changes to the invoice tell other
    /// lists and reload this one.
    func perform(_ label: String, id: String, api: APIClient, changes: Bool = true, _ action: () async throws -> Void) async throws {
        working = label
        defer { working = nil }
        try await action()
        guard changes else { return }
        SalesEvents.invoicesChanged()
        await load(id, api: api)
    }
}

/// Invoice detail: balance hero, lines, totals, payments and details, with the
/// next step pinned to the bottom. Pushed inside the caller's stack.
struct InvoiceDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var store = SalesInvoiceDetailStore()
    @State private var paying: Invoice?
    @State private var sharing: SalesSharedFile?
    @State private var confirmVoid = false
    @State private var confirmDelete = false
    @State private var success = 0

    var body: some View {
        Group {
            if let invoice = store.invoice {
                content(invoice)
            } else if let message = store.errorMessage {
                ErrorStateView(message: message) { await store.load(id, api: env.api) }
                    .frame(maxHeight: .infinity)
            } else {
                loading
            }
        }
        .background(DTheme.shell)
        .navigationTitle(store.invoice?.invoiceNumber ?? "Invoice")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let invoice = store.invoice {
                ToolbarItem(placement: .primaryAction) { menu(invoice) }
            }
        }
        .task { await store.load(id, api: env.api) }
        .sheet(item: $paying) { invoice in
            SalesRecordPaymentSheet(invoice: invoice) { _ in
                success += 1
                Task { await store.load(id, api: env.api) }
            }
        }
        .sheet(item: $sharing) { file in
            SalesShareSheet(url: file.url)
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
        .confirmationDialog("Void this invoice?", isPresented: $confirmVoid, titleVisibility: .visible) {
            Button("Void invoice", role: .destructive) { run("void") }
        } message: {
            Text("It stays on record but no longer counts as money owed. This can't be undone.")
        }
        .confirmationDialog("Delete this draft?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete draft", role: .destructive) { run("delete") }
        } message: {
            Text("The draft will be removed for good.")
        }
        .sensoryFeedback(.success, trigger: success)
    }

    // MARK: Layout

    private func content(_ invoice: Invoice) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                hero(invoice)
                linesSection(invoice)
                totalsSection(invoice)
                if !store.payments.isEmpty { paymentsSection(invoice) }
                detailsSection(invoice)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 28)
        }
        .refreshable { await store.load(id, api: env.api) }
        .defaultScrollAnchor(demoScrollAnchor)
        .safeAreaInset(edge: .bottom, spacing: 0) { actionBar(invoice) }
    }

    private var demoScrollAnchor: UnitPoint? {
        #if DEBUG
        if DemoData.isEnabled, DemoData.open?.hasSuffix("-bottom") == true { return .bottom }
        #endif
        return nil
    }

    private var loading: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 12) {
                RoundedRectangle(cornerRadius: 6).fill(DTheme.tint).frame(width: 140, height: 14)
                RoundedRectangle(cornerRadius: 8).fill(DTheme.tintStrong).frame(width: 220, height: 40)
                RoundedRectangle(cornerRadius: 6).fill(DTheme.tint).frame(width: 180, height: 12)
            }
            .padding(.horizontal, 4)
            SkeletonRows(rows: 3, avatar: false)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            SkeletonRows(rows: 4, avatar: false)
                .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            Spacer()
        }
        .skeletonShimmer()
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: Hero

    private func hero(_ invoice: Invoice) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Avatar(name: invoice.salesContactName, size: 30)
                Text(invoice.salesContactName)
                    .font(.system(size: 15.5, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                StatusPill(text: InvoiceStatus.label(invoice.status), tone: InvoiceStatus.tone(invoice.status))
                    .contentTransition(.opacity)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(invoice.salesIsOpen ? "Amount due" : invoice.status == "paid" ? "Paid in full" : "Total")
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(DTheme.inkSecondary)
                Text(Money.format(invoice.salesHeadlineAmount, currency: invoice.currencyCode))
                    .displayFont(44)
                    .monospacedDigit()
                    .foregroundStyle(invoice.status == "void" ? DTheme.inkTertiary : DTheme.ink)
                    .strikethrough(invoice.status == "void", color: DTheme.inkTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText(value: Double(invoice.salesHeadlineAmount)))
            }

            HStack(spacing: 6) {
                Image(systemName: invoice.salesIsLate ? "exclamationmark.circle" : invoice.status == "paid" ? "checkmark.circle" : "calendar")
                    .font(.system(size: 13, weight: .medium))
                Text(invoice.salesDueText)
                Text("·").foregroundStyle(DTheme.inkTertiary)
                Text(invoice.invoiceNumber).foregroundStyle(DTheme.inkSecondary)
            }
            .font(.system(size: 14))
            .foregroundStyle(invoice.salesIsLate ? DTheme.negative : DTheme.inkSecondary)

            if invoice.amountPaid > 0, invoice.amountDue > 0 {
                SalesPaidProgress(paid: invoice.amountPaid, total: invoice.total, currency: invoice.currencyCode)
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 4)
    }

    // MARK: Sections

    private func linesSection(_ invoice: Invoice) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Items")
            CardStack {
                if store.sortedLines.isEmpty {
                    Text("No items")
                        .font(.system(size: 15))
                        .foregroundStyle(DTheme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                ForEach(store.sortedLines) { line in
                    SalesLineRow(line: line, currency: invoice.currencyCode)
                }
            }
        }
    }

    private func totalsSection(_ invoice: Invoice) -> some View {
        let currency = invoice.currencyCode
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Summary")
            CardStack {
                DetailRow(label: "Subtotal") { MoneyText(minor: invoice.subtotal, currency: currency, weight: .regular) }
                DetailRow(label: "Tax") { MoneyText(minor: invoice.taxTotal, currency: currency, weight: .regular) }
                DetailRow(label: "Total") { MoneyText(minor: invoice.total, currency: currency, weight: .semibold) }
                if invoice.amountPaid > 0 {
                    DetailRow(label: "Paid") {
                        MoneyText(minor: -invoice.amountPaid, currency: currency, weight: .regular)
                    }
                }
                if invoice.status != "void" {
                    DetailRow(label: "Amount due") {
                        MoneyText(minor: invoice.amountDue, currency: currency, weight: .semibold)
                            .foregroundStyle(invoice.salesIsLate ? DTheme.negative : DTheme.ink)
                    }
                }
            }
        }
    }

    private func paymentsSection(_ invoice: Invoice) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Payments received")
            CardStack(dividerInset: 62) {
                ForEach(store.payments) { payment in
                    HStack(spacing: 12) {
                        IconTile(symbol: methodSymbol(payment.method), tone: .positive, size: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(PaymentMethod.label(payment.method))
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(DTheme.ink)
                            Text([DubblDate.display(payment.date), payment.paymentNumber].compactMap { $0 }.joined(separator: " · "))
                                .font(.system(size: 13))
                                .foregroundStyle(DTheme.inkSecondary)
                        }
                        Spacer(minLength: 8)
                        MoneyText(minor: payment.amount, currency: invoice.currencyCode)
                            .foregroundStyle(DTheme.ink)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 64)
                }
            }
        }
    }

    private func detailsSection(_ invoice: Invoice) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Details")
            CardStack {
                DetailRow("Issue date", DubblDate.display(invoice.issueDate))
                DetailRow("Due date", DubblDate.display(invoice.dueDate))
                if let sentAt = invoice.sentAt {
                    DetailRow("Sent", DubblDate.display(sentAt))
                }
                if let reference = invoice.reference, !reference.isEmpty {
                    DetailRow("Reference", reference)
                }
                if invoice.currencyCode != env.session.currency {
                    DetailRow("Currency", invoice.currencyCode)
                }
                if let notes = invoice.notes, !notes.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Notes")
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.inkSecondary)
                        Text(notes)
                            .font(.system(size: 15))
                            .foregroundStyle(DTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                }
            }
        }
    }

    // MARK: Actions

    @ViewBuilder
    private func actionBar(_ invoice: Invoice) -> some View {
        if invoice.status == "draft" || invoice.salesIsOpen {
            Button {
                if invoice.status == "draft" { run("send") } else { paying = invoice }
            } label: {
                HStack(spacing: 8) {
                    if store.working == "send" {
                        ProgressView().tint(DTheme.inkInverse)
                    } else {
                        Image(systemName: invoice.status == "draft" ? "paperplane" : "banknote")
                            .font(.system(size: 15, weight: .medium))
                        Text(invoice.status == "draft" ? "Mark as sent" : "Record payment")
                    }
                }
            }
            .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
            .disabled(store.working != nil)
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 6)
            .background { SalesBottomFade() }
        }
    }

    private func menu(_ invoice: Invoice) -> some View {
        Menu {
            Button { share(invoice) } label: { Label("Share PDF", systemImage: "square.and.arrow.up") }
            if invoice.status != "void", invoice.status != "paid" {
                Button { run("link") } label: { Label("Copy payment link", systemImage: "link") }
            }
            if invoice.salesIsOpen {
                Button { paying = invoice } label: { Label("Record payment", systemImage: "banknote") }
            }
            if invoice.amountPaid == 0, invoice.status != "void" {
                Divider()
                Button(role: .destructive) { confirmVoid = true } label: { Label("Void", systemImage: "nosign") }
            }
            if invoice.status == "draft" {
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete draft", systemImage: "trash") }
            }
        } label: {
            if store.working == "pdf" || store.working == "link" {
                ProgressView()
            } else {
                Image(systemName: "ellipsis")
            }
        }
        .accessibilityLabel("More")
    }

    private func run(_ action: String) {
        guard store.working == nil, let invoice = store.invoice else { return }
        Task {
            do {
                switch action {
                case "send":
                    try await store.perform(action, id: id, api: env.api) {
                        let _: InvoiceResponse = try await env.api.post("invoices/\(invoice.id)/send")
                    }
                    env.toast.show("Marked as sent")
                case "void":
                    try await store.perform(action, id: id, api: env.api) {
                        let _: InvoiceResponse = try await env.api.post("invoices/\(invoice.id)/void")
                    }
                    env.toast.show("Invoice voided")
                case "delete":
                    try await store.perform(action, id: id, api: env.api, changes: false) {
                        let _: SuccessResponse = try await env.api.delete("invoices/\(invoice.id)")
                    }
                    SalesEvents.invoicesChanged()
                    env.toast.show("Draft deleted", symbol: "trash")
                    dismiss()
                    return
                case "link":
                    try await store.perform(action, id: id, api: env.api, changes: false) {
                        let response: SalesPaymentLinkResponse = try await env.api.post("invoices/\(invoice.id)/payment-link")
                        UIPasteboard.general.string = response.url
                    }
                    env.toast.show("Payment link copied", symbol: "link")
                default: return
                }
                success += 1
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func share(_ invoice: Invoice) {
        guard store.working == nil else { return }
        Task {
            do {
                var file: URL?
                try await store.perform("pdf", id: id, api: env.api, changes: false) {
                    file = try await SalesPDF.file(for: invoice, api: env.api)
                }
                if let file { sharing = SalesSharedFile(url: file) }
            } catch {
                env.toast.error(error)
            }
        }
    }

    private func methodSymbol(_ method: String?) -> String {
        switch PaymentMethod(rawValue: method ?? "") {
        case .card: "creditcard"
        case .cash: "banknote"
        case .check: "doc.text"
        case .bankTransfer: "building.columns"
        default: "arrow.down.left"
        }
    }
}

// MARK: - Pieces

/// A line item: description, quantity x unit price, line amount.
private struct SalesLineRow: View {
    let line: DocumentLine
    let currency: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.description)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(quantity) x \(Money.format(line.unitPrice, currency: currency))")
                    .font(DFont.figure(13, weight: .regular))
                    .foregroundStyle(DTheme.inkSecondary)
                if let tax = line.taxRate {
                    Text(tax.name)
                        .font(.system(size: 12.5))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
            Spacer(minLength: 12)
            MoneyText(minor: line.amount, currency: currency)
                .foregroundStyle(DTheme.ink)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
    }

    private var quantity: String {
        line.quantityValue.formatted(.number.precision(.fractionLength(0 ... 2)))
    }
}

/// A thin bar showing how much of the invoice has been paid.
private struct SalesPaidProgress: View {
    let paid: Int
    let total: Int
    let currency: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(DTheme.tintStrong)
                    Capsule()
                        .fill(DTheme.positive)
                        .frame(width: max(6, proxy.size.width * fraction))
                }
            }
            .frame(height: 6)
            Text("\(Money.format(paid, currency: currency)) of \(Money.format(total, currency: currency)) paid")
                .font(DFont.figure(12.5, weight: .regular))
                .foregroundStyle(DTheme.inkSecondary)
        }
    }

    private var fraction: CGFloat {
        guard total > 0 else { return 0 }
        return min(1, CGFloat(paid) / CGFloat(total))
    }
}
