import SwiftUI

/// Add a customer or supplier: name, contact details, type and payment terms.
struct ContactsNewContactSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let onCreate: (Contact) -> Void

    private enum Field: Hashable { case name, email, phone, taxNumber }

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var taxNumber = ""
    @State private var type = "customer"
    @State private var terms = 30
    @State private var saving = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespaces) }
    private var emailLooksWrong: Bool {
        !trimmedEmail.isEmpty && !(trimmedEmail.contains("@") && trimmedEmail.contains("."))
    }
    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && !emailLooksWrong && !saving
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ContactsTypeSegment(selection: $type)

                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("Business or person", text: $name)
                                .textContentType(.organizationName)
                                .focused($focus, equals: .name)
                                .submitLabel(.next)
                                .onSubmit { focus = .email }
                        }
                        FieldRow(label: "Email") {
                            TextField("billing@example.com", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .email)
                                .submitLabel(.next)
                                .onSubmit { focus = .phone }
                        }
                        FieldRow(label: "Phone") {
                            TextField("Optional", text: $phone)
                                .textContentType(.telephoneNumber)
                                .keyboardType(.phonePad)
                                .focused($focus, equals: .phone)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        SectionLabel("Billing")
                        CardStack {
                            HStack {
                                Text("Payment terms")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Spacer()
                                Picker("Payment terms", selection: $terms) {
                                    ForEach(ContactsTerms.options, id: \.self) { days in
                                        Text(ContactsTerms.label(days)).tag(days)
                                    }
                                }
                                .labelsHidden()
                                .tint(DTheme.inkSecondary)
                            }
                            .padding(.leading, 16)
                            .padding(.trailing, 6)
                            .frame(minHeight: 50)
                            FieldRow(label: "Tax number") {
                                TextField("Optional", text: $taxNumber)
                                    .textInputAutocapitalization(.characters)
                                    .autocorrectionDisabled()
                                    .focused($focus, equals: .taxNumber)
                            }
                        }
                    }

                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                            .transition(.opacity)
                    } else if emailLooksWrong, focus != .email {
                        Text("That email doesn't look right.")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                            .transition(.opacity)
                    }
                }
                .padding(20)
                .animation(.snappy, value: error)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("New contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if saving { ProgressView() } else { Text("Add") }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear { focus = .name }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        func clean(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            return trimmed.isEmpty ? nil : trimmed
        }
        let body = ContactsCreateBody(
            name: name.trimmingCharacters(in: .whitespaces),
            email: clean(email),
            phone: clean(phone),
            type: type,
            paymentTermsDays: terms,
            taxNumber: clean(taxNumber),
            currencyCode: env.session.currency
        )
        do {
            let response: ContactResponse = try await env.api.post("contacts", body: body)
            env.toast.show("Contact added")
            onCreate(response.contact)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Customer, supplier or both. The choice gets a grey tint, never a white chip.
private struct ContactsTypeSegment: View {
    @Binding var selection: String
    @Namespace private var namespace
    private let options = [("customer", "Customer"), ("supplier", "Supplier"), ("both", "Both")]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.0) { value, label in
                let selected = selection == value
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.82)) { selection = value }
                } label: {
                    Text(label)
                        .font(.system(size: 14.5, weight: .medium))
                        .foregroundStyle(selected ? DTheme.ink : DTheme.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background {
                            if selected {
                                Capsule().fill(DTheme.tintStrong).matchedGeometryEffect(id: "type", in: namespace)
                            }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(4)
        .background(DTheme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(DTheme.hairlineSoft, lineWidth: 0.5))
        .sensoryFeedback(.selection, trigger: selection)
    }
}
