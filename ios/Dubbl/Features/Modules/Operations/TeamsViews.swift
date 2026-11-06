import SwiftUI

// Teams group organization members. `memberId` everywhere is the org member's
// id (from GET members), not the user id.

struct TeamsBody: Encodable, Sendable {
    var name: String
    var description: String?
}

struct TeamsMemberBody: Encodable, Sendable {
    var memberId: String
}

/// A team: who's in it, with people to add and swipe to remove.
struct TeamsDetailView: View {
    let id: String

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var team: JSONValue?
    @State private var error: String?
    @State private var adding = false
    @State private var editing = false
    @State private var confirmDelete = false

    private var members: [JSONValue] {
        (team?.opsArray("members") ?? []).sorted { name($0) < name($1) }
    }

    private func name(_ row: JSONValue) -> String {
        row["member.user.name"]?.stringValue ?? row["member.user.email"]?.stringValue ?? "Member"
    }

    var body: some View {
        Group {
            if let team {
                List {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(team["name"]?.stringValue ?? "Team")
                            .font(.system(size: 28, weight: .semibold))
                            .tracking(-0.6)
                            .foregroundStyle(DTheme.ink)
                        if let description = team["description"]?.stringValue, !description.isEmpty {
                            Text(description).font(.system(size: 15)).foregroundStyle(DTheme.inkSecondary)
                        }
                        Text("\(members.count) \(members.count == 1 ? "member" : "members")")
                            .font(.system(size: 14))
                            .monospacedDigit()
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                    .padding(.vertical, 14)
                    .ledgerRow()

                    ForEach(members, id: \.recordID) { row in
                        let memberName = name(row)
                        HStack(spacing: 12) {
                            Avatar(name: memberName, imageURL: row["member.user.image"]?.stringValue, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(memberName).font(.system(size: 16, weight: .semibold)).foregroundStyle(DTheme.ink)
                                if let email = row["member.user.email"]?.stringValue, email != memberName {
                                    Text(email).font(.system(size: 13)).foregroundStyle(DTheme.inkSecondary)
                                }
                            }
                            Spacer()
                            if let role = row["member.role"]?.stringValue {
                                LedgerStatus(text: role.humanized, tone: TeamsRoles.tone(role))
                            }
                        }
                        .padding(.vertical, 11)
                        .ledgerRow()
                        .swipeActions {
                            Button(role: .destructive) { Task { await remove(row) } } label: { Label("Remove", systemImage: "person.badge.minus") }
                        }
                    }
                    if members.isEmpty {
                        Text("No one's in this team yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(DTheme.inkSecondary)
                            .padding(.vertical, 14)
                            .ledgerRow()
                    }
                    Button { adding = true } label: {
                        Label("Add people", systemImage: "person.badge.plus")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(DTheme.ink)
                            .padding(.vertical, 12)
                    }
                    .ledgerRow()
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await load() }
            } else if let error {
                ErrorStateView(message: error) { await load() }
            } else {
                ScrollView { SkeletonRows(rows: 6) }
            }
        }
        .background(DTheme.canvas)
        .navigationTitle("Team")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { editing = true } label: { Label("Rename", systemImage: "pencil") }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("Delete team", systemImage: "trash") }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .accessibilityLabel("More actions")
            }
        }
        .confirmationDialog("Delete this team?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await delete() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Its people stay in the organization.")
        }
        .sheet(isPresented: $adding) {
            TeamsAddMemberSheet(teamId: id, existing: Set(members.compactMap { $0["memberId"]?.stringValue })) { Task { await load() } }
        }
        .sheet(isPresented: $editing) {
            if let team { TeamsEditSheet(team: team) { Task { await load() } } }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let response: JSONValue = try await env.api.get("teams/\(id)")
            withAnimation(.snappy) {
                team = response["team"] ?? response
                error = nil
            }
        } catch {
            if team == nil { self.error = error.localizedDescription }
        }
    }

    private func remove(_ row: JSONValue) async {
        guard let memberId = row["memberId"]?.stringValue, let team else { return }
        withAnimation(.snappy) {
            self.team = team.opsSetting("members", .array(team.opsArray("members").filter { $0["memberId"]?.stringValue != memberId }))
        }
        do {
            let _: JSONValue = try await env.api.request(.delete, "teams/\(id)/members", query: ["memberId": memberId])
            env.toast.show("Removed from team")
            NotificationCenter.default.post(name: .recordsChanged, object: "teams")
        } catch {
            env.toast.error(error)
            await load()
        }
    }

    private func delete() async {
        do {
            let _: JSONValue = try await env.api.delete("teams/\(id)")
            env.toast.show("Team deleted")
            NotificationCenter.default.post(name: .recordsChanged, object: "teams")
            dismiss()
        } catch {
            env.toast.error(error)
        }
    }
}

enum TeamsRoles {
    static func tone(_ role: String) -> Tone {
        switch role {
        case "owner": .special
        case "admin": .info
        default: .neutral
        }
    }
}

/// Pick people from the organization to add to a team.
struct TeamsAddMemberSheet: View {
    let teamId: String
    let existing: Set<String>
    let onAdded: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var people: [JSONValue] = []
    @State private var loaded = false
    @State private var adding: String?

    private var available: [JSONValue] {
        people.filter { !existing.contains($0.recordID ?? "") }
    }

    var body: some View {
        NavigationStack {
            Group {
                if !loaded {
                    ScrollView { SkeletonRows(rows: 5) }
                } else if available.isEmpty {
                    EmptyStateView(symbol: "person.2", title: "Everyone's in", message: "All members of the organization are already in this team.")
                } else {
                    List(available, id: \.recordID) { person in
                        let name = person["userName"]?.stringValue ?? person["userEmail"]?.stringValue ?? "Member"
                        Button { Task { await add(person) } } label: {
                            HStack(spacing: 12) {
                                Avatar(name: name, size: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(name).font(.system(size: 15.5, weight: .medium)).foregroundStyle(DTheme.ink)
                                    Text(person["userEmail"]?.stringValue ?? "").font(.system(size: 13)).foregroundStyle(DTheme.inkSecondary)
                                }
                                Spacer()
                                if adding == person.recordID {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Image(systemName: "plus.circle").font(.system(size: 20)).foregroundStyle(DTheme.inkSecondary)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .disabled(adding != nil)
                        .listRowBackground(DTheme.card)
                    }
                    .scrollContentBackground(.hidden)
                }
            }
            .background(DTheme.shell)
            .navigationTitle("Add people")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            if let response: JSONValue = try? await env.api.get("members") {
                people = response.opsArray("members")
            }
            loaded = true
        }
    }

    private func add(_ person: JSONValue) async {
        guard let memberId = person.recordID else { return }
        adding = memberId
        defer { adding = nil }
        do {
            let _: JSONValue = try await env.api.post("teams/\(teamId)/members", body: TeamsMemberBody(memberId: memberId))
            env.toast.show("Added \(person["userName"]?.stringValue ?? "member")")
            NotificationCenter.default.post(name: .recordsChanged, object: "teams")
            onAdded()
            if OperationsFormat.isDemo { people.removeAll { $0.recordID == memberId } }
        } catch {
            env.toast.error(error)
        }
    }
}

/// A new team.
struct TeamsNewSheet: View {
    let onCreated: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "New team", confirm: "Create", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("e.g. Design", text: $name) }
                FieldRow(label: "Description") { TextField("Optional", text: $description, axis: .vertical).lineLimit(1 ... 3) }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.post("teams", body: TeamsBody(name: name.trimmingCharacters(in: .whitespaces), description: OperationsFormat.trimmed(description)))
            env.toast.show("Team created")
            onCreated()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Rename a team or change its description.
struct TeamsEditSheet: View {
    let team: JSONValue
    let onSaved: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        OperationsFormSheet(title: "Edit team", canSave: OperationsFormat.trimmed(name) != nil, saving: saving, error: error, onSave: save) {
            CardStack {
                FieldRow(label: "Name") { TextField("Name", text: $name) }
                FieldRow(label: "Description") { TextField("Optional", text: $description, axis: .vertical).lineLimit(1 ... 3) }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            name = team["name"]?.stringValue ?? ""
            description = team["description"]?.stringValue ?? ""
        }
    }

    private func save() async {
        guard let id = team.recordID else { return }
        saving = true
        error = nil
        defer { saving = false }
        do {
            let _: JSONValue = try await env.api.patch("teams/\(id)", body: TeamsBody(name: name.trimmingCharacters(in: .whitespaces), description: OperationsFormat.trimmed(description)))
            env.toast.show("Team saved")
            NotificationCenter.default.post(name: .recordsChanged, object: "teams")
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
