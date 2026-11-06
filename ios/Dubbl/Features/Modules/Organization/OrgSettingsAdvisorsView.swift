import SwiftUI

/// /settings/advisors: accountants, bookkeepers, auditors and tax advisors
/// with access to the books. Owners and admins invite (the advisor accepts
/// from their own dubbl account) and revoke.
struct OrgSettingsAdvisorsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var advisors = OrgSettingsResource("advisors")
    @State private var inviting = false
    @State private var confirmation: OrgSettingsConfirmation?

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { advisors.value?.orgArray("advisors") ?? [] }

    static let roles: [(value: String, label: String)] = [
        ("accountant", "Accountant"), ("bookkeeper", "Bookkeeper"), ("auditor", "Auditor"), ("tax_advisor", "Tax advisor"),
    ]

    var body: some View {
        OrgSettingsPage(loaded: advisors.isLoaded, error: advisors.error, reload: { await advisors.load(env) }) {
            let current = all.filter { $0.orgString("revokedAt") == nil }
            let revoked = all.filter { $0.orgString("revokedAt") != nil }
            if current.isEmpty {
                EmptyStateView(
                    symbol: "person.crop.circle.badge.checkmark", title: "No advisors yet",
                    message: "Give your accountant or bookkeeper access without using a seat.",
                    actionTitle: canManage ? "Invite an advisor" : nil, action: { inviting = true }
                )
                .dubblCard()
            } else {
                OrgSettingsSection("Advisors", footer: canManage ? "Touch and hold an advisor to revoke their access." : nil, inset: 62) {
                    ForEach(current, id: \.recordID) { advisor in row(advisor) }
                }
            }
            if !revoked.isEmpty {
                OrgSettingsSection("Revoked", inset: 62) {
                    ForEach(revoked, id: \.recordID) { advisor in row(advisor) }
                }
            }
        }
        .navigationTitle("Advisors")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Invite advisor", systemImage: "person.badge.plus") { inviting = true }
                }
            }
        }
        .sheet(isPresented: $inviting) {
            OrgSettingsAdvisorInviteSheet { Task { await advisors.load(env) } }
        }
        .orgSettingsConfirm($confirmation)
        .task { await advisors.load(env) }
    }

    private func row(_ advisor: JSONValue) -> some View {
        let name = advisor.orgString("advisor.name") ?? advisor.orgString("advisor.email") ?? advisor.orgText("inviteEmail")
        let role = Self.roles.first { $0.value == advisor.orgString("role") }?.label ?? advisor.orgText("role").humanized
        let (status, tone): (String, Tone) = {
            if advisor.orgString("revokedAt") != nil { return ("Revoked", .neutral) }
            if advisor.orgBool("isActive") { return ("Active", .positive) }
            return ("Invited", .warning)
        }()
        let since = advisor.orgString("acceptedAt").map { "since \(DubblDate.short($0))" } ?? advisor.orgString("invitedAt").map { "invited \(DubblDate.short($0))" }
        return OrgSettingsRow(avatar: name, title: name, subtitle: [role, since].compactMap { $0 }.joined(separator: " · ")) {
            LedgerStatus(text: status, tone: tone)
        }
        .contextMenu {
            if canManage, status != "Revoked", let id = advisor.recordID {
                Button("Revoke access", systemImage: "xmark.circle", role: .destructive) {
                    confirmation = OrgSettingsConfirmation(title: "Revoke \(name)'s access?", message: "They can't see this organization's books any more.", action: "Revoke") {
                        let ok = await OrgSettingsRun.run(env, "Access revoked") {
                            try await OrgSettingsAPI.send(env, .delete, "advisors", query: ["id": id])
                        }
                        if ok { await advisors.load(env) }
                    }
                }
            }
        }
    }
}

/// Invite an advisor who already has a dubbl account.
struct OrgSettingsAdvisorInviteSheet: View {
    let onDone: () -> Void
    @Environment(AppEnvironment.self) private var env
    @State private var email = ""
    @State private var role = "accountant"

    var body: some View {
        OrgSettingsFormSheet(title: "Invite advisor", saveTitle: "Invite", canSave: email.contains("@")) {
            try await OrgSettingsAPI.send(env, .post, "advisors/invite", body: [
                "email": .string(email.trimmingCharacters(in: .whitespaces).lowercased()), "role": .string(role),
            ])
            env.toast.show("Advisor invited")
            onDone()
        } content: {
            OrgSettingsSection(nil, footer: "The advisor needs a dubbl account with this email. They accept the invitation from their account.") {
                OrgSettingsField(label: "Email", text: $email, prompt: "accountant@firm.com", keyboard: .emailAddress, content: .emailAddress, capitalization: .never)
                OrgSettingsPicker(label: "Role", selection: $role, options: OrgSettingsAdvisorsView.roles)
            }
        }
        .presentationDetents([.medium])
    }
}
