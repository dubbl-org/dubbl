import SwiftUI

/// /settings/members: who's in the organization, pending email invitations
/// and shareable invite links. Owners and admins invite, change roles and
/// remove people; the owner can't be changed or removed.
struct OrgSettingsMembersView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var members = OrgSettingsResource("members")
    @State private var invitations = OrgSettingsResource("invitations")
    @State private var links = OrgSettingsResource("invite-links")
    @State private var capacity = OrgSettingsResource("members/capacity")
    @State private var roles = OrgSettingsResource("roles")
    @State private var inviting = false
    @State private var editing: JSONValue?
    @State private var confirmation: OrgSettingsConfirmation?
    @State private var creatingLink = false

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }

    private var pending: [JSONValue] {
        invitations.value?.orgArray("invitations").filter { $0.orgString("status") == "pending" } ?? []
    }

    var body: some View {
        OrgSettingsPage(loaded: members.isLoaded, error: members.error, reload: load) {
            seats
            OrgSettingsSection("Members", inset: 62) {
                ForEach(members.value?.orgArray("members") ?? [], id: \.recordID) { member in
                    memberRow(member)
                }
            }
            if !pending.isEmpty {
                OrgSettingsSection("Pending invitations", footer: canManage ? "Invitations expire after 7 days. Touch and hold one to revoke it." : nil, inset: 62) {
                    ForEach(pending, id: \.recordID) { invitation in
                        invitationRow(invitation)
                    }
                }
            }
            if canManage {
                linksSection
            }
        }
        .navigationTitle("Members")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Invite", systemImage: "person.badge.plus") { inviting = true }
                        .disabled(capacity.value?.orgBool("canInvite", default: true) == false)
                }
            }
        }
        .sheet(isPresented: $inviting) {
            OrgSettingsInviteSheet { Task { await invitations.load(env); await capacity.load(env) } }
        }
        .sheet(item: Binding(get: { editing.map(OrgSettingsIdentified.init) }, set: { editing = $0?.value })) { item in
            OrgSettingsMemberSheet(member: item.value, roles: roles.value?.orgArray("roles") ?? [], canManage: canManage) {
                Task { await members.load(env); await capacity.load(env) }
            }
        }
        .orgSettingsConfirm($confirmation)
        .task { await load() }
    }

    // MARK: Seats

    @ViewBuilder
    private var seats: some View {
        if let value = capacity.value {
            OrgSettingsSection(nil, footer: value.orgBool("canInvite", default: true) ? nil : value.orgString("reason")) {
                OrgSettingsMeter(label: "Seats on the \(value.orgString("plan").map(\.humanized) ?? "current") plan", used: value.orgInt("current") ?? 0, max: value.orgInt("max"))
            }
        }
    }

    // MARK: Rows

    private func memberRow(_ member: JSONValue) -> some View {
        let name = member.orgString("userName") ?? member.orgText("userEmail")
        let role = member.orgText("role")
        let isOwner = role == "owner"
        return Button {
            editing = member
        } label: {
            OrgSettingsRow(avatar: name, title: name, subtitle: member.orgString("userEmail")) {
                VStack(alignment: .trailing, spacing: 4) {
                    StatusPill(text: role.humanized, tone: isOwner ? .special : role == "admin" ? .info : .neutral)
                    if let custom = member.orgString("customRoleName") {
                        Text(custom)
                            .font(.system(size: 12.5))
                            .foregroundStyle(DTheme.inkSecondary)
                    }
                }
            }
        }
        .buttonStyle(RowPressStyle())
        .disabled(isOwner)
    }

    private func invitationRow(_ invitation: JSONValue) -> some View {
        let email = invitation.orgText("email")
        let expires = invitation.orgString("expiresAt").map { "Expires \(DubblDate.short($0))" }
        return OrgSettingsRow(avatar: email, title: email, subtitle: [invitation.orgString("role")?.humanized, expires].compactMap { $0 }.joined(separator: " · ")) {
            LedgerStatus(text: "Invited", tone: .warning)
        }
        .contextMenu {
            if canManage, let id = invitation.recordID {
                Button("Revoke invitation", systemImage: "xmark.circle", role: .destructive) {
                    confirmation = OrgSettingsConfirmation(title: "Revoke the invitation to \(email)?", action: "Revoke") {
                        if await OrgSettingsRun.run(env, "Invitation revoked", { try await OrgSettingsAPI.send(env, .delete, "invitations/\(id)") }) {
                            await invitations.load(env)
                        }
                    }
                }
            }
        }
    }

    // MARK: Invite links

    private var linksSection: some View {
        OrgSettingsSection("Invite links", footer: "Anyone with an active link can join with its role.") {
            ForEach(links.value?.orgArray("links") ?? [], id: \.recordID) { link in
                linkRow(link)
            }
            OrgSettingsButtonRow(title: "New invite link", symbol: "link.badge.plus", working: creatingLink) {
                Task { await createLink() }
            }
        }
    }

    private func linkRow(_ link: JSONValue) -> some View {
        let token = link.orgText("token")
        let url = AppConfig.webURL("/invite/\(token)")
        let active = link.orgBool("isActive")
        let uses = link.orgInt("useCount") ?? 0
        let usage = link.orgInt("maxUses").map { "\(uses) of \($0) uses" } ?? "\(uses) \(uses == 1 ? "use" : "uses")"
        let expiry = link.orgString("expiresAt").map { "expires \(DubblDate.short($0))" }
        return OrgSettingsRow(
            title: "/invite/\(token.prefix(8))…",
            subtitle: [link.orgString("defaultRole")?.humanized, usage, expiry].compactMap { $0 }.joined(separator: " · "),
            mono: true
        ) {
            if let url {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(DTheme.ink)
                        .frame(width: 36, height: 36)
                }
            }
        }
        .opacity(active ? 1 : 0.5)
        .contextMenu {
            if let url {
                Button("Copy link", systemImage: "doc.on.doc") {
                    UIPasteboard.general.url = url
                    env.toast.show("Link copied")
                }
            }
            if let id = link.recordID {
                Button(active ? "Turn off" : "Turn on", systemImage: active ? "pause.circle" : "play.circle") {
                    Task {
                        if await OrgSettingsRun.run(env, active ? "Link turned off" : "Link turned on", { try await OrgSettingsAPI.send(env, .patch, "invite-links/\(id)", body: ["isActive": .bool(!active)]) }) {
                            await links.load(env)
                        }
                    }
                }
                Button("Delete link", systemImage: "trash", role: .destructive) {
                    confirmation = OrgSettingsConfirmation(title: "Delete this invite link?", message: "People who have it won't be able to join.", action: "Delete") {
                        if await OrgSettingsRun.run(env, "Link deleted", { try await OrgSettingsAPI.send(env, .delete, "invite-links/\(id)") }) {
                            await links.load(env)
                        }
                    }
                }
            }
        }
    }

    private func createLink() async {
        creatingLink = true
        defer { creatingLink = false }
        let ok = await OrgSettingsRun.run(env, "Invite link created") {
            try await OrgSettingsAPI.send(env, .post, "invite-links", body: ["defaultRole": .string("member"), "expiresInDays": OrgJSON.number(7)])
        }
        if ok { await links.load(env) }
    }

    // MARK: Data

    private func load() async {
        async let a: Void = members.load(env)
        async let b: Void = invitations.load(env)
        async let c: Void = capacity.load(env)
        async let d: Void = roles.load(env)
        async let e: Void = canManage ? links.load(env) : ()
        _ = await (a, b, c, d, e)
        #if DEBUG
        OrgSettingsDemo.open("member") { editing = members.value?.orgArray("members").dropFirst().first }
        OrgSettingsDemo.open("invite") { inviting = true }
        #endif
    }
}

/// Wraps a JSON record for `sheet(item:)`.
struct OrgSettingsIdentified: Identifiable {
    let value: JSONValue
    var id: String { value.recordID ?? value.pretty }
}

// MARK: - Invite

/// Email someone an invitation with a role.
struct OrgSettingsInviteSheet: View {
    let onDone: () -> Void
    @Environment(AppEnvironment.self) private var env
    @State private var email = ""
    @State private var role = "member"

    private var valid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.contains("@") && trimmed.contains(".")
    }

    var body: some View {
        OrgSettingsFormSheet(title: "Invite someone", saveTitle: "Send", canSave: valid) {
            try await OrgSettingsAPI.send(env, .post, "invitations", body: [
                "email": .string(email.trimmingCharacters(in: .whitespaces).lowercased()), "role": .string(role),
            ])
            env.toast.show("Invitation sent")
            onDone()
        } content: {
            OrgSettingsSection(nil, footer: "They'll get an email with a link to join. Admins can manage settings and people.") {
                OrgSettingsField(label: "Email", text: $email, prompt: "name@company.com", keyboard: .emailAddress, content: .emailAddress, capitalization: .never)
                OrgSettingsPicker(label: "Role", selection: $role, options: [("member", "Member"), ("admin", "Admin")])
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Member

/// One member: their role, an optional custom access role and removal.
struct OrgSettingsMemberSheet: View {
    let member: JSONValue
    let roles: [JSONValue]
    let canManage: Bool
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var role: String
    @State private var customRole: String?
    @State private var confirmRemove = false

    init(member: JSONValue, roles: [JSONValue], canManage: Bool, onDone: @escaping () -> Void) {
        self.member = member
        self.roles = roles
        self.canManage = canManage
        self.onDone = onDone
        _role = State(initialValue: member.orgString("role") ?? "member")
        _customRole = State(initialValue: member.orgString("customRoleId"))
    }

    private var name: String { member.orgString("userName") ?? member.orgText("userEmail") }
    private var id: String { member.recordID ?? "" }
    private var isSelf: Bool { member.orgString("userId") == env.session.user?.id }

    var body: some View {
        OrgSettingsFormSheet(title: "Member", canSave: role != member.orgString("role") || customRole != member.orgString("customRoleId"), readOnly: !canManage) {
            try await OrgSettingsAPI.send(env, .patch, "members/\(id)", body: [
                "role": .string(role), "customRoleId": customRole.map(JSONValue.string) ?? .null,
            ])
            env.toast.show("Role updated")
            onDone()
        } content: {
            VStack(spacing: 10) {
                Avatar(name: name, size: 64)
                Text(name).displayFont(20).foregroundStyle(DTheme.ink)
                Text("\(member.orgText("userEmail")) · joined \(DubblDate.display(member.orgString("createdAt")))")
                    .font(.system(size: 13.5))
                    .foregroundStyle(DTheme.inkSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)

            OrgSettingsSection("Access", footer: "A custom role replaces the standard permissions with its own set.") {
                OrgSettingsPicker(label: "Role", selection: $role, options: [("member", "Member"), ("admin", "Admin")], disabled: !canManage)
                OrgSettingsChoiceRow(
                    label: "Custom role", title: "Custom role",
                    choices: roles.compactMap { role in role.recordID.map { OrgSettingsChoice(value: $0, label: role.orgText("name"), detail: role.orgString("description")) } },
                    selection: $customRole, allowsNone: true, disabled: !canManage
                )
            }
            if canManage, !isSelf {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Remove from organization", symbol: "person.badge.minus", destructive: true) { confirmRemove = true }
                }
            }
        }
        .confirmationDialog("Remove \(name)?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                Task {
                    if await OrgSettingsRun.run(env, "\(name) removed", { try await OrgSettingsAPI.send(env, .delete, "members/\(id)") }) {
                        onDone()
                        dismiss()
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("They lose access to this organization straight away.")
        }
    }
}
