import SwiftUI

/// Everyone at every customer and supplier, grouped by company, with call
/// and email one tap away. Tapping a person opens their company.
struct ContactsExtrasPeopleView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var rows: [JSONValue] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var page = 1
    @State private var hasMore = false
    @State private var total: Int?
    @State private var search = ""
    @State private var side = "all"
    @State private var primaryOnly = false
    @State private var adding = false

    private var visible: [JSONValue] {
        guard ContactsExtrasDemo.isOn else { return rows }
        let term = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { row in
            let kind = row["contactType"]?.stringValue ?? ""
            return (side == "all" || kind == side || kind == "both")
                && (!primaryOnly || row["isPrimary"]?.boolValue == true)
                && (term.isEmpty || ["name", "email", "jobTitle", "contactName"].contains { (row[$0]?.stringValue ?? "").localizedCaseInsensitiveContains(term) })
        }
    }

    /// Consecutive rows of the same company, in the server's order.
    private var groups: [(company: String, contactID: String, people: [JSONValue])] {
        var result: [(String, String, [JSONValue])] = []
        for row in visible {
            let id = row["contactId"]?.stringValue ?? ""
            if let last = result.last, last.1 == id {
                result[result.count - 1].2.append(row)
            } else {
                result.append((row["contactName"]?.stringValue ?? "Company", id, [row]))
            }
        }
        return result.map { (company: $0.0, contactID: $0.1, people: $0.2) }
    }

    var body: some View {
        content
            .background(DTheme.canvas)
            .navigationTitle("People")
            .navigationSubtitle(loaded ? "\(ContactsExtrasDemo.isOn ? visible.count : (total ?? rows.count)) people" : "")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Name, email, role or company")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Company type", selection: $side) {
                            Text("Everyone").tag("all")
                            Text("At customers").tag("customer")
                            Text("At suppliers").tag("supplier")
                        }
                        Toggle("Main contacts only", isOn: $primaryOnly)
                    } label: {
                        Image(systemName: side == "all" && !primaryOnly ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
                    }
                    .accessibilityLabel("Filter people")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add person", systemImage: "plus") { adding = true }
                }
            }
            .task(id: "\(side)|\(primaryOnly)|\(search)") {
                if !search.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
                if Task.isCancelled { return }
                await load()
            }
            .sheet(isPresented: $adding) {
                ContactsExtrasAddPersonSheet { Task { await load() } }
            }
    }

    @ViewBuilder
    private var content: some View {
        if visible.isEmpty {
            Group {
                if let error {
                    ErrorStateView(message: error) { await load() }
                } else if loaded {
                    EmptyStateView(
                        symbol: "person.crop.rectangle.stack",
                        title: search.isEmpty && side == "all" && !primaryOnly ? "No people yet" : "Nothing here",
                        message: search.isEmpty ? "Add the people you deal with at each customer and supplier." : "No one matches “\(search)”.",
                        actionTitle: search.isEmpty ? "Add person" : nil
                    ) { adding = true }
                } else {
                    ScrollView { SkeletonRows(rows: 9) }
                }
            }
            .frame(maxHeight: .infinity, alignment: loaded ? .center : .top)
        } else {
            List {
                ForEach(groups, id: \.contactID) { group in
                    Section {
                        ForEach(group.people, id: \.self) { person in
                            NavigationLink {
                                ContactDetailView(id: group.contactID)
                            } label: {
                                ContactsExtrasPersonRow(person: person)
                            }
                            .navigationLinkIndicatorVisibility(.hidden)
                            .ledgerRow()
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Text(group.company)
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(DTheme.ink)
                            if let kind = group.people.first?["contactType"]?.stringValue {
                                Text(kind == "both" ? "Customer and supplier" : kind.humanized)
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(DTheme.inkTertiary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                if hasMore {
                    HStack {
                        Spacer()
                        ProgressView().controlSize(.small)
                        Spacer()
                    }
                    .frame(height: 44)
                    .listRowBackground(DTheme.canvas)
                    .listRowSeparator(.hidden)
                    .task { await loadMore() }
                } else {
                    LedgerEndMarker(text: "\(visible.count) \(visible.count == 1 ? "person" : "people") at \(groups.count) \(groups.count == 1 ? "company" : "companies")")
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .scrollDismissesKeyboard(.immediately)
            .refreshable { await load() }
        }
    }

    private func query(page: Int) -> [String: String?] {
        var query: [String: String?] = ["page": "\(page)", "limit": "60"]
        if side != "all" { query["type"] = side }
        if primaryOnly { query["primary"] = "1" }
        let term = search.trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { query["search"] = term }
        return query
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("contacts/people", query: query(page: 1))
            withAnimation(.snappy) {
                rows = response["data"]?.arrayValue ?? []
                total = response["pagination.total"]?.intValue
                hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
                page = 1
                loaded = true
                error = nil
            }
        } catch {
            if rows.isEmpty { self.error = error.localizedDescription }
        }
    }

    private func loadMore() async {
        do {
            let response: JSONValue = try await env.api.get("contacts/people", query: query(page: page + 1))
            let known = Set(rows.compactMap(\.recordID))
            rows += (response["data"]?.arrayValue ?? []).filter { !known.contains($0.recordID ?? "") }
            hasMore = (response["pagination.page"]?.intValue ?? 1) < (response["pagination.totalPages"]?.intValue ?? 1)
            page += 1
        } catch {
            hasMore = false
        }
    }
}

/// "Jordan Park · Head of finance   [phone] [mail]"
struct ContactsExtrasPersonRow: View {
    let person: JSONValue

    var body: some View {
        let name = person["name"]?.stringValue ?? "Person"
        HStack(spacing: 12) {
            Avatar(name: name, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.system(size: 16, weight: .semibold))
                        .tracking(-0.2)
                        .foregroundStyle(DTheme.ink)
                        .lineLimit(1)
                    if person["isPrimary"]?.boolValue == true {
                        Text("Main")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.horizontal, 6)
                            .frame(height: 18)
                            .background(DTheme.tint, in: Capsule())
                    }
                }
                let detail = [person["jobTitle"]?.stringValue, person["email"]?.stringValue].compactMap { $0 }.filter { !$0.isEmpty }
                if !detail.isEmpty {
                    Text(detail.joined(separator: " · "))
                        .font(.system(size: 13))
                        .foregroundStyle(DTheme.inkSecondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 8) {
                if let phone = person["phone"]?.stringValue, let url = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                    ContactsExtrasRowButton(symbol: "phone", label: "Call \(name)", url: url)
                }
                if let email = person["email"]?.stringValue, let url = URL(string: "mailto:\(email)") {
                    ContactsExtrasRowButton(symbol: "envelope", label: "Email \(name)", url: url)
                }
            }
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

/// Add someone at a customer or supplier: who they are and how to reach them.
struct ContactsExtrasAddPersonSheet: View {
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var company: ContactsExtrasContactRef?
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var jobTitle = ""
    @State private var isPrimary = false
    @State private var saving = false
    @State private var error: String?

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespaces) }
    private var canSave: Bool {
        company != nil && !name.trimmingCharacters(in: .whitespaces).isEmpty
            && (trimmedEmail.isEmpty || (trimmedEmail.contains("@") && trimmedEmail.contains(".")))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    CardStack {
                        ContactsExtrasContactField(label: "Company", contact: $company)
                    }
                    CardStack {
                        FieldRow(label: "Name") {
                            TextField("Full name", text: $name)
                                .textContentType(.name)
                        }
                        FieldRow(label: "Role") {
                            TextField("e.g. Accounts payable", text: $jobTitle)
                                .textContentType(.jobTitle)
                        }
                        FieldRow(label: "Email") {
                            TextField("Optional", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }
                        FieldRow(label: "Phone") {
                            TextField("Optional", text: $phone)
                                .textContentType(.telephoneNumber)
                                .keyboardType(.phonePad)
                        }
                    }
                    CardStack {
                        Toggle(isOn: $isPrimary) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Main contact")
                                    .font(.system(size: 15))
                                    .foregroundStyle(DTheme.ink)
                                Text("Invoices and statements go to them first.")
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(DTheme.inkSecondary)
                            }
                        }
                        .tint(DTheme.positive)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    }
                    if let error {
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.negative)
                            .padding(.horizontal, 4)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(DTheme.shell)
            .navigationTitle("Add person")
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
                    .disabled(!canSave || saving)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving)
    }

    private func save() async {
        guard let company else { return }
        saving = true
        error = nil
        defer { saving = false }
        func clean(_ value: String) -> JSONValue {
            let trimmed = value.trimmingCharacters(in: .whitespaces)
            return trimmed.isEmpty ? .null : .string(trimmed)
        }
        do {
            let _: JSONValue = try await env.api.post("contacts/\(company.id)/people", body: [
                "name": JSONValue.string(name.trimmingCharacters(in: .whitespaces)),
                "email": clean(email),
                "phone": clean(phone),
                "jobTitle": clean(jobTitle),
                "isPrimary": .bool(isPrimary),
            ])
            env.toast.show("\(name) added to \(company.name)")
            onDone()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
