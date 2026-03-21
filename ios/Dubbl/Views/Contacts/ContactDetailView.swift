import SwiftUI

struct ContactDetailView: View {
    let contactId: String
    @State private var contact: Contact?
    @State private var isLoading = true
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss

    private let service = ContactService()

    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error = error {
                    ErrorView(message: error) { Task { await load() } }
                } else if let contact = contact {
                    ScrollView {
                        VStack(spacing: 20) {
                            // Avatar & Name
                            VStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .fill(Color.dubblPrimary.opacity(0.15))
                                        .frame(width: 72, height: 72)
                                    Text(String(contact.name.prefix(1)).uppercased())
                                        .font(.title)
                                        .foregroundColor(.dubblPrimary)
                                }
                                Text(contact.name)
                                    .font(.title2).fontWeight(.bold)
                                if let type = contact.type {
                                    StatusBadge(type.displayName)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .dubblCard()

                            VStack(spacing: 12) {
                                if let email = contact.email {
                                    DetailRow(label: "Email", value: email)
                                }
                                if let phone = contact.phone {
                                    DetailRow(label: "Phone", value: phone)
                                }
                                if let taxNumber = contact.taxNumber {
                                    DetailRow(label: "Tax Number", value: taxNumber)
                                }
                                if let terms = contact.paymentTermsDays {
                                    DetailRow(label: "Payment Terms", value: "\(terms) days")
                                }
                                if let limit = contact.creditLimit, limit > 0 {
                                    DetailRow(label: "Credit Limit", value: limit.asCurrency())
                                }
                                DetailRow(label: "Currency", value: contact.currencyCode ?? "USD")
                            }
                            .dubblCard()

                            if let persons = contact.persons, !persons.isEmpty {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Contact Persons").font(.headline)
                                    ForEach(persons) { person in
                                        VStack(alignment: .leading, spacing: 4) {
                                            HStack {
                                                Text(person.name ?? "")
                                                    .font(.subheadline).fontWeight(.medium)
                                                if person.isPrimary == true {
                                                    StatusBadge("Primary", color: .dubblPrimary)
                                                }
                                            }
                                            if let title = person.jobTitle {
                                                Text(title).font(.caption).foregroundColor(.dubblMuted)
                                            }
                                            if let email = person.email {
                                                Text(email).font(.caption).foregroundColor(.dubblMuted)
                                            }
                                        }
                                        Divider()
                                    }
                                }
                                .dubblCard()
                            }

                            if let notes = contact.notes, !notes.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Notes").font(.headline)
                                    Text(notes).font(.subheadline).foregroundColor(.dubblMuted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .dubblCard()
                            }

                            Spacer(minLength: 40)
                        }
                        .padding()
                    }
                }
            }
            .background(Color.dubblBackground.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }.foregroundColor(.dubblPrimary)
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        do { contact = try await service.get(id: contactId) } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}
