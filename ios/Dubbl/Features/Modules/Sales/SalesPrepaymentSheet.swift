import SwiftUI

/// Records money a customer paid before there's an invoice for it (a deposit
/// or prepayment). `POST customer-credits` books the cash into the chosen bank
/// account and holds it on the customer's account until it's applied.
struct SalesPrepaymentSheet: View {
    var onCreated: () -> Void = {}

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var contact: Contact?
    @State private var date = Calendar.current.startOfDay(for: .now)
    @State private var amount = 0
    @State private var notes = ""
    @State private var bankAccounts: [BankAccount] = []
    @State private var bankAccountID: String?
    @State private var pickingCustomer = false
    @State private var saving = false
    @State private var showErrors = false
    @State private var error: String?

    private var currency: String { contact?.currencyCode ?? env.session.currency }

    private var problem: String? {
        if contact == nil { return "Choose a customer." }
        if amount <= 0 { return "Enter the amount received." }
        if bankAccountID == nil { return "Choose the account the money went into." }
        return nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Customer")
                        Button { pickingCustomer = true } label: {
                            HStack(spacing: 12) {
                                if let contact {
                                    Avatar(name: contact.name, size: 36)
                                    Text(contact.name)
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundStyle(DTheme.ink)
                                } else {
                                    IconTile(symbol: "person", size: 36)
                                    Text("Choose a customer")
                                        .font(.system(size: 16))
                                        .foregroundStyle(showErrors ? DTheme.negative : DTheme.inkSecondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                            .padding(.horizontal, 16)
                            .frame(minHeight: 64)
                            .background(DTheme.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
                        }
                        .buttonStyle(TapScaleStyle())
                    }

                    CardStack {
                        SalesInlineRow(label: "Amount") {
                            AmountField(minor: $amount, currency: currency)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 130)
                        }
                        SalesInlineRow(label: "Received on") {
                            DatePicker("Received on", selection: $date, displayedComponents: .date)
                                .labelsHidden()
                        }
                        SalesInlineRow(label: "Paid into") {
                            if bankAccounts.isEmpty {
                                Text("No bank accounts")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.inkTertiary)
                            } else {
                                SalesBankAccountMenu(accounts: bankAccounts, selection: $bankAccountID)
                            }
                        }
                    }

                    CardStack {
                        FieldRow(label: "Notes") {
                            TextField("Deposit for the website rebuild", text: $notes, axis: .vertical)
                                .lineLimit(2 ... 5)
                        }
                    }

                    if showErrors, let message = error ?? problem {
                        Label(message, systemImage: "exclamationmark.circle")
                            .font(.system(size: 13.5))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("New prepayment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                        .disabled(saving)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    Task { await save() }
                } label: {
                    if saving { ProgressView().tint(DTheme.inkInverse) } else { Text("Record prepayment") }
                }
                .buttonStyle(InkButtonStyle(size: .large, fullWidth: true))
                .disabled(saving)
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 6)
                .background { SalesBottomFade() }
            }
            .navigationDestination(isPresented: $pickingCustomer) {
                SalesPartyPicker(role: .customer, selection: $contact)
            }
            .task {
                guard bankAccounts.isEmpty, let response: BankAccountsResponse = try? await env.api.get("bank-accounts") else { return }
                bankAccounts = response.bankAccounts.filter(\.isActive)
                if bankAccountID == nil { bankAccountID = bankAccounts.first?.id }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(DTheme.shell)
        .interactiveDismissDisabled(saving || contact != nil || amount > 0)
    }

    private func save() async {
        error = nil
        guard let contact, let bankAccountID, problem == nil else {
            withAnimation(.snappy) { showErrors = true }
            return
        }
        saving = true
        defer { saving = false }
        let trimmed = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: [String: JSONValue] = [
            "contactId": .string(contact.id),
            "date": .string(DubblDate.string(date)),
            "amount": .number(Double(amount)),
            "sourceType": .string("prepayment"),
            "currencyCode": .string(currency),
            "bankAccountId": .string(bankAccountID),
            "notes": trimmed.isEmpty ? .null : .string(trimmed),
        ]
        do {
            let _: JSONValue = try await env.api.post("customer-credits", body: body)
            env.toast.show("Prepayment of \(Money.format(amount, currency: currency)) recorded")
            NotificationCenter.default.post(name: .recordsChanged, object: "customer-credits")
            onCreated()
            dismiss()
        } catch {
            withAnimation(.snappy) {
                self.error = error.localizedDescription
                showErrors = true
            }
        }
    }
}
