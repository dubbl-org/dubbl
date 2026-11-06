import SwiftUI

/// Record money received against an open invoice. Posts integer minor units.
struct SalesRecordPaymentSheet: View {
    let invoice: Invoice
    var onRecorded: (Invoice) -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var amount: Int
    @State private var date = Date()
    @State private var method: PaymentMethod = .bankTransfer
    @State private var reference = ""
    @State private var saving = false
    @State private var amountFieldID = 0
    @State private var error: String?

    init(invoice: Invoice, onRecorded: @escaping (Invoice) -> Void) {
        self.invoice = invoice
        self.onRecorded = onRecorded
        _amount = State(initialValue: invoice.amountDue)
    }

    private var currency: String { invoice.currencyCode }

    private var validationMessage: String? {
        if amount > invoice.amountDue { return "That's more than the \(Money.format(invoice.amountDue, currency: currency)) due." }
        return nil
    }

    private var canSave: Bool { amount >= 1 && amount <= invoice.amountDue && !saving }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    summary

                    CardStack {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Amount received")
                                .font(.system(size: 12.5, weight: .medium))
                                .foregroundStyle(DTheme.inkSecondary)
                            SalesAmountInput(minor: $amount, currency: currency)
                                .id(amountFieldID)
                            HStack(spacing: 8) {
                                Button("Full amount") { setAmount(invoice.amountDue) }
                                    .buttonStyle(SalesQuickAmountStyle(selected: amount == invoice.amountDue))
                                if invoice.amountDue >= 2 {
                                    Button("Half") { setAmount(invoice.amountDue / 2) }
                                        .buttonStyle(SalesQuickAmountStyle(selected: amount == invoice.amountDue / 2))
                                }
                                Spacer()
                                if amount > 0, amount < invoice.amountDue {
                                    Text("\(Money.format(invoice.amountDue - amount, currency: currency)) left")
                                        .font(DFont.figure(12.5, weight: .regular))
                                        .foregroundStyle(DTheme.inkTertiary)
                                        .transition(.opacity)
                                }
                            }
                        }
                        .padding(16)
                        SalesInlineRow(label: "Date") {
                            DatePicker("Date", selection: $date, in: ...Date.now.addingTimeInterval(86_400 * 366), displayedComponents: .date)
                                .labelsHidden()
                                .datePickerStyle(.compact)
                        }
                        SalesInlineRow(label: "Method") {
                            Picker("Method", selection: $method) {
                                ForEach(PaymentMethod.allCases) { option in
                                    Text(option.label).tag(option)
                                }
                            }
                            .labelsHidden()
                            .pickerStyle(.menu)
                            .tint(DTheme.ink)
                        }
                        SalesInlineRow(label: "Reference") {
                            TextField("Optional", text: $reference)
                                .multilineTextAlignment(.trailing)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .font(.system(size: 16))
                                .foregroundStyle(DTheme.ink)
                        }
                    }
                    .animation(.snappy(duration: 0.22), value: amount)

                    if let message = validationMessage ?? error {
                        Label(message, systemImage: "exclamationmark.circle")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                            .transition(.opacity)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
                .animation(.snappy(duration: 0.22), value: validationMessage)
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
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.height(520), .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
        .interactiveDismissDisabled(saving)
    }

    /// Which invoice, and how much is left on it.
    private var summary: some View {
        HStack(spacing: 12) {
            Avatar(name: invoice.salesContactName, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(invoice.salesContactName)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(DTheme.ink)
                    .lineLimit(1)
                Text("\(invoice.invoiceNumber) · \(invoice.salesDueText)")
                    .font(.system(size: 13))
                    .foregroundStyle(invoice.salesIsLate ? DTheme.negative : DTheme.inkSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                MoneyText(minor: invoice.amountDue, currency: currency, size: 16, weight: .semibold)
                    .foregroundStyle(DTheme.ink)
                Text("due")
                    .font(.system(size: 12.5))
                    .foregroundStyle(DTheme.inkTertiary)
            }
        }
        .dubblCard(padding: 14)
    }

    private func setAmount(_ value: Int) {
        amount = value
        amountFieldID += 1
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        error = nil
        defer { saving = false }
        let trimmed = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = SalesPaymentBody(
            amount: amount,
            date: DubblDate.string(date),
            method: method.rawValue,
            reference: trimmed.isEmpty ? nil : trimmed
        )
        do {
            let response: SalesPaymentResponse = try await env.api.post("invoices/\(invoice.id)/pay", body: body)
            onRecorded(response.invoice)
            SalesEvents.invoicesChanged()
            env.toast.show(response.invoice.status == "paid" ? "Paid in full" : "Payment recorded")
            dismiss()
        } catch {
            withAnimation(.snappy) { self.error = error.localizedDescription }
        }
    }
}

/// A large amount entry in major units, bound to minor units.
private struct SalesAmountInput: View {
    @Binding var minor: Int
    let currency: String
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(Money.symbol(currency))
                .displayFont(28, weight: .medium)
                .foregroundStyle(DTheme.inkTertiary)
            TextField("0.00", text: $text)
                .keyboardType(.decimalPad)
                .focused($focused)
                .displayFont(36)
                .monospacedDigit()
                .foregroundStyle(DTheme.ink)
                .onChange(of: text) { _, value in
                    minor = SalesDecimal.parse(value).map { Money.minor(fromMajor: $0, currency: currency) } ?? 0
                }
        }
        .onAppear {
            guard text.isEmpty, minor != 0 else { return }
            let digits = Money.fractionDigits(currency)
            text = Money.major(minor, currency: currency)
                .formatted(.number.precision(.fractionLength(digits)).grouping(.never).locale(Locale(identifier: "en_US_POSIX")))
        }
    }
}

/// Small preset chips under the amount; the active one gets the grey tint.
private struct SalesQuickAmountStyle: ButtonStyle {
    let selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
            .padding(.horizontal, 11)
            .frame(height: 30)
            .background(selected || configuration.isPressed ? DTheme.tintStrong : DTheme.tint, in: Capsule())
            .animation(.snappy(duration: 0.18), value: selected)
    }
}
