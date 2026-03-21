import SwiftUI

struct BillFormView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var contactId = ""
    @State private var issueDate = Date()
    @State private var dueDate = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
    @State private var reference = ""
    @State private var notes = ""
    @State private var lines: [LineItem] = [LineItem()]
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var contacts: [Contact] = []

    private let service = BillService()
    private let contactService = ContactService()
    var onComplete: (() -> Void)?

    struct LineItem: Identifiable {
        let id = UUID()
        var description = ""
        var quantity = "1"
        var unitPrice = ""
    }

    private let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    var body: some View {
        NavigationView {
            Form {
                Section("Supplier") {
                    Picker("Supplier", selection: $contactId) {
                        Text("Select supplier").tag("")
                        ForEach(contacts) { c in Text(c.name).tag(c.id) }
                    }
                }
                Section("Dates") {
                    DatePicker("Issue Date", selection: $issueDate, displayedComponents: .date)
                    DatePicker("Due Date", selection: $dueDate, displayedComponents: .date)
                }
                Section("Reference") {
                    TextField("Reference (optional)", text: $reference)
                }
                Section("Line Items") {
                    ForEach($lines) { $line in
                        VStack(spacing: 8) {
                            TextField("Description", text: $line.description)
                            HStack {
                                TextField("Qty", text: $line.quantity).keyboardType(.decimalPad).frame(width: 60)
                                TextField("Unit Price", text: $line.unitPrice).keyboardType(.decimalPad)
                            }
                        }
                    }
                    .onDelete { lines.remove(atOffsets: $0) }
                    Button(action: { lines.append(LineItem()) }) {
                        Label("Add Line", systemImage: "plus").foregroundColor(.dubblPrimary)
                    }
                }
                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 60)
                }
                if let error = error {
                    Section { Text(error).foregroundColor(.dubblDestructive) }
                }
            }
            .navigationTitle("New Bill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundColor(.dubblPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Create") { Task { await submit() } }
                        .font(.body.weight(.semibold)).foregroundColor(.dubblPrimary)
                        .disabled(contactId.isEmpty || lines.isEmpty || isSubmitting)
                }
            }
            .task {
                do {
                    let result = try await contactService.list(page: 1, limit: 100, type: "supplier")
                    contacts = result.data
                } catch {}
            }
        }
    }

    private func submit() async {
        isSubmitting = true; error = nil
        let billLines = lines.compactMap { line -> BillLineCreate? in
            guard !line.description.isEmpty else { return nil }
            return BillLineCreate(
                description: line.description,
                quantity: Int((Double(line.quantity) ?? 1) * 100),
                unitPrice: Int((Double(line.unitPrice) ?? 0) * 100)
            )
        }
        guard !billLines.isEmpty else { error = "Add at least one line item"; isSubmitting = false; return }

        let bill = BillCreate(
            contactId: contactId,
            issueDate: dateFormatter.string(from: issueDate),
            dueDate: dateFormatter.string(from: dueDate),
            reference: reference.isEmpty ? nil : reference,
            notes: notes.isEmpty ? nil : notes,
            lines: billLines
        )
        do {
            _ = try await service.create(bill)
            onComplete?(); dismiss()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isSubmitting = false
    }
}
