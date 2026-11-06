import SwiftUI

/// /settings/roles: the three standard roles, the built-in presets and the
/// organization's custom roles, each a set of permissions. Owners and admins
/// create, edit and delete custom roles; presets can't change.
struct OrgSettingsRolesView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var roles = OrgSettingsResource("roles")
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { roles.value?.orgArray("roles") ?? [] }

    var body: some View {
        OrgSettingsPage(loaded: roles.isLoaded, error: roles.error, reload: { await roles.load(env) }) {
            OrgSettingsSection("Standard roles", footer: "Every member has one of these. A custom role, when assigned, replaces it with its own permissions.") {
                OrgSettingsRow(symbol: "crown", tone: .special, title: "Owner", subtitle: "Everything, including billing and deleting the organization", chevron: false)
                OrgSettingsRow(symbol: "person.badge.key", tone: .info, title: "Admin", subtitle: "Settings, people, approvals, banking and posting", chevron: false)
                OrgSettingsRow(symbol: "person", title: "Member", subtitle: "Day-to-day invoices, bills, expenses and contacts", chevron: false)
            }
            let presets = all.filter { $0.orgBool("isSystem") }
            if !presets.isEmpty {
                OrgSettingsSection("Presets", inset: 58) {
                    ForEach(presets, id: \.recordID) { role in roleRow(role) }
                }
            }
            let custom = all.filter { !$0.orgBool("isSystem") }
            OrgSettingsSection("Custom roles", inset: 58) {
                if custom.isEmpty {
                    Text("No custom roles yet. Build one from exactly the permissions someone needs.")
                        .font(.system(size: 14))
                        .foregroundStyle(DTheme.inkSecondary)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(custom, id: \.recordID) { role in roleRow(role) }
            }
        }
        .navigationTitle("Roles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New role", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsRoleSheet(role: item.value, canManage: canManage && !item.value.orgBool("isSystem")) { Task { await roles.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsRoleSheet(role: nil, canManage: true) { Task { await roles.load(env) } }
        }
        .task {
            await roles.load(env)
            #if DEBUG
            OrgSettingsDemo.open("role") { editing = all.last.map(OrgSettingsIdentified.init) }
            #endif
        }
    }

    private func roleRow(_ role: JSONValue) -> some View {
        let count = role.orgArray("permissions").count
        let members = role.orgInt("memberCount") ?? 0
        return Button { editing = OrgSettingsIdentified(value: role) } label: {
            OrgSettingsRow(
                symbol: role.orgBool("isSystem") ? "lock.shield" : "person.badge.shield.checkmark",
                title: role.orgText("name"),
                subtitle: "\(count) \(count == 1 ? "permission" : "permissions") · \(members) \(members == 1 ? "member" : "members")"
            )
        }
        .buttonStyle(RowPressStyle())
    }
}

/// Permission keys grouped as the web's role editor shows them.
enum OrgSettingsPermissions {
    static let categories: [(name: String, keys: [String])] = [
        ("General", ["view:data"]),
        ("Accounting", ["create:entries", "edit:entries", "post:entries", "void:entries", "manage:accounts", "manage:recurring", "manage:period-lock", "bypass:period-lock"]),
        ("Invoicing", ["manage:invoices", "approve:invoices", "manage:credit-notes", "manage:debit-notes"]),
        ("Bills", ["manage:bills", "approve:bills"]),
        ("Banking", ["manage:banking", "manage:bank-rules"]),
        ("Contacts", ["manage:contacts"]),
        ("Payments", ["manage:payments"]),
        ("Expenses", ["manage:expenses", "approve:expenses"]),
        ("Inventory", ["manage:inventory"]),
        ("Payroll", ["manage:payroll", "approve:payroll", "manage:timesheets", "manage:leave", "manage:contractors", "view:payslips", "manage:compensation", "manage:tax-config", "manage:shifts", "self-service:payroll", "view:payroll-reports"]),
        ("Projects", ["manage:projects"]),
        ("Assets", ["manage:assets"]),
        ("Budgets", ["manage:budgets"]),
        ("Tax", ["manage:tax-rates"]),
        ("Cost centers", ["manage:cost-centers"]),
        ("Automation", ["manage:webhooks", "manage:approvals"]),
        ("Reports", ["manage:reports"]),
        ("Integrations", ["manage:integrations"]),
        ("Time tracking", ["manage:time-tracking"]),
        ("Purchases", ["manage:purchases", "approve:purchases"]),
        ("Admin", ["manage:teams", "manage:members", "invite:members", "change:roles", "remove:members", "manage:api-keys", "view:audit-log"]),
        ("Owner", ["manage:billing", "delete:organization"]),
    ]

    /// "manage:credit-notes" -> "Manage credit notes"
    static func label(_ key: String) -> String {
        let special = ["bypass:period-lock": "Post into locked periods", "self-service:payroll": "Payroll self-service", "view:data": "View data", "manage:tax-config": "Manage tax settings"]
        if let label = special[key] { return label }
        let parts = key.split(separator: ":").map { $0.replacingOccurrences(of: "-", with: " ") }
        return parts.joined(separator: " ").humanized
    }
}

/// Create or edit a custom role; presets open read-only.
struct OrgSettingsRoleSheet: View {
    let role: JSONValue?
    let canManage: Bool
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var summary: String
    @State private var permissions: Set<String>
    @State private var confirmDelete = false

    init(role: JSONValue?, canManage: Bool, onDone: @escaping () -> Void) {
        self.role = role
        self.canManage = canManage
        self.onDone = onDone
        _name = State(initialValue: role?.orgText("name") ?? "")
        _summary = State(initialValue: role?.orgText("description") ?? "")
        _permissions = State(initialValue: Set((role?.orgArray("permissions") ?? []).compactMap(\.stringValue)))
    }

    private var isNew: Bool { role == nil }

    private var changed: Bool {
        isNew || name != role?.orgText("name") || summary != role?.orgText("description")
            || permissions != Set((role?.orgArray("permissions") ?? []).compactMap(\.stringValue))
    }

    var body: some View {
        OrgSettingsFormSheet(
            title: isNew ? "New role" : (canManage ? "Edit role" : role?.orgText("name") ?? "Role"),
            saveTitle: isNew ? "Create" : "Save",
            canSave: changed && !name.trimmingCharacters(in: .whitespaces).isEmpty && !permissions.isEmpty,
            readOnly: !canManage
        ) {
            let body: [String: JSONValue] = [
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "description": OrgJSON.text(summary),
                "permissions": OrgJSON.strings(permissions.sorted()),
            ]
            if let id = role?.recordID {
                try await OrgSettingsAPI.send(env, .put, "roles/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "roles", body: body)
            }
            env.toast.show(isNew ? "Role created" : "Role saved")
            onDone()
        } content: {
            if canManage {
                OrgSettingsSection(nil) {
                    OrgSettingsField(label: "Name", text: $name, prompt: "e.g. Studio lead", capitalization: .words)
                    OrgSettingsField(label: "Description", text: $summary, prompt: "What this role is for", axis: .vertical)
                }
            } else if let text = role?.orgString("description") {
                Text(text)
                    .font(.system(size: 15))
                    .foregroundStyle(DTheme.inkSecondary)
                    .padding(.horizontal, 4)
            }
            Text("\(permissions.count) \(permissions.count == 1 ? "permission" : "permissions")")
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(DTheme.inkSecondary)
                .padding(.horizontal, 4)
            ForEach(OrgSettingsPermissions.categories, id: \.name) { category in
                if canManage || category.keys.contains(where: permissions.contains) {
                    OrgSettingsSection(category.name) {
                        ForEach(category.keys.filter { canManage || permissions.contains($0) }, id: \.self) { key in
                            if canManage {
                                OrgSettingsToggle(title: OrgSettingsPermissions.label(key), isOn: Binding(
                                    get: { permissions.contains(key) },
                                    set: { if $0 { permissions.insert(key) } else { permissions.remove(key) } }
                                ))
                            } else {
                                OrgSettingsRow(symbol: "checkmark", tone: .positive, title: OrgSettingsPermissions.label(key), chevron: false)
                            }
                        }
                    }
                }
            }
            if canManage, let id = role?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete role", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Role deleted", { try await OrgSettingsAPI.send(env, .delete, "roles/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Members with this role need another one first.")
                }
            }
        }
    }
}
