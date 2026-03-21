import SwiftUI

struct ContactFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var type = "customer"
    @State private var taxNumber = ""
    @State private var paymentTerms = ""
    @State private var notes = ""
    @State private var isSubmitting = false
    @State private var error: String?

    private let service = ContactService()
    var onComplete: (() -> Void)?

    var body: some View {
        NavigationView {
            Form {
                Section("Contact Info") {
                    TextField("Name", text: $name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress).autocapitalization(.none)
                    TextField("Phone", text: $phone)
                        .keyboardType(.phonePad)
                }
                Section("Type") {
                    Picker("Type", selection: $type) {
                        Text("Customer").tag("customer")
                        Text("Supplier").tag("supplier")
                        Text("Both").tag("both")
                    }
                    .pickerStyle(.segmented)
                }
                Section("Details") {
                    TextField("Tax Number (optional)", text: $taxNumber)
                    TextField("Payment Terms (days)", text: $paymentTerms)
                        .keyboardType(.numberPad)
                }
                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 60)
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(name.isEmpty || isSubmitting)
                }
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        let contact = ContactCreate(
            name: name,
            email: email.isEmpty ? nil : email,
            phone: phone.isEmpty ? nil : phone,
            type: type,
            taxNumber: taxNumber.isEmpty ? nil : taxNumber,
            paymentTermsDays: Int(paymentTerms),
            notes: notes.isEmpty ? nil : notes
        )
        do {
            _ = try await service.create(contact)
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
