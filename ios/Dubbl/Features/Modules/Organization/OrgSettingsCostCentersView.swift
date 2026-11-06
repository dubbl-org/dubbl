import SwiftUI

/// /settings/cost-centers: departments or locations to tag lines with for
/// reporting, optionally nested under a parent. Owners and admins edit.
struct OrgSettingsCostCentersView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var centers = OrgSettingsResource("cost-centers", query: ["limit": "100"])
    @State private var editing: OrgSettingsIdentified?
    @State private var creating = false

    private var canManage: Bool { OrgSettingsAccess.allows(.admin, env) }
    private var all: [JSONValue] { (centers.value?.orgArray("data") ?? []).sorted { $0.orgText("code") < $1.orgText("code") } }

    var body: some View {
        OrgSettingsPage(loaded: centers.isLoaded, error: centers.error, reload: { await centers.load(env) }) {
            if !canManage {
                OrgSettingsNotice(text: OrgSettingsLevel.admin.readOnlyMessage)
            }
            if all.isEmpty {
                EmptyStateView(
                    symbol: "building", title: "No cost centers yet",
                    message: "Split reports by team, studio or location.",
                    actionTitle: canManage ? "New cost center" : nil, action: { creating = true }
                )
                .dubblCard()
            } else {
                let active = all.filter { $0.orgBool("isActive", default: true) }
                let inactive = all.filter { !$0.orgBool("isActive", default: true) }
                OrgSettingsSection("Active") {
                    ForEach(active, id: \.recordID) { center in row(center) }
                }
                if !inactive.isEmpty {
                    OrgSettingsSection("Inactive") {
                        ForEach(inactive, id: \.recordID) { center in row(center) }
                    }
                }
            }
        }
        .navigationTitle("Cost centers")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if canManage {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("New cost center", systemImage: "plus") { creating = true }
                }
            }
        }
        .sheet(item: $editing) { item in
            OrgSettingsCostCenterSheet(center: item.value, all: all, canManage: canManage) { Task { await centers.load(env) } }
        }
        .sheet(isPresented: $creating) {
            OrgSettingsCostCenterSheet(center: nil, all: all, canManage: true) { Task { await centers.load(env) } }
        }
        .task { await centers.load(env) }
    }

    private func row(_ center: JSONValue) -> some View {
        Button { editing = OrgSettingsIdentified(value: center) } label: {
            OrgSettingsRow(title: center.orgText("name"), subtitle: center.orgString("parent.name").map { "Under \($0)" }) {
                HStack(spacing: 8) {
                    Text(center.orgText("code"))
                        .font(.system(size: 13.5, weight: .medium, design: .monospaced))
                        .foregroundStyle(DTheme.inkSecondary)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DTheme.inkTertiary)
                }
            }
        }
        .buttonStyle(RowPressStyle())
    }
}

/// Create or edit a cost center.
struct OrgSettingsCostCenterSheet: View {
    let center: JSONValue?
    let all: [JSONValue]
    let canManage: Bool
    let onDone: () -> Void

    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var code: String
    @State private var name: String
    @State private var parentID: String?
    @State private var isActive: Bool
    @State private var confirmDelete = false

    init(center: JSONValue?, all: [JSONValue], canManage: Bool, onDone: @escaping () -> Void) {
        self.center = center
        self.all = all
        self.canManage = canManage
        self.onDone = onDone
        _code = State(initialValue: center?.orgText("code") ?? "")
        _name = State(initialValue: center?.orgText("name") ?? "")
        _parentID = State(initialValue: center?.orgString("parentId"))
        _isActive = State(initialValue: center?.orgBool("isActive", default: true) ?? true)
    }

    private var parents: [OrgSettingsChoice] {
        all.filter { $0.recordID != center?.recordID }.compactMap { other in
            other.recordID.map { OrgSettingsChoice(value: $0, label: other.orgText("name"), detail: other.orgString("code")) }
        }
    }

    var body: some View {
        OrgSettingsFormSheet(
            title: center == nil ? "New cost center" : (canManage ? "Edit cost center" : "Cost center"),
            saveTitle: center == nil ? "Create" : "Save",
            canSave: !code.trimmingCharacters(in: .whitespaces).isEmpty && !name.trimmingCharacters(in: .whitespaces).isEmpty,
            readOnly: !canManage
        ) {
            var body: [String: JSONValue] = [
                "code": .string(code.trimmingCharacters(in: .whitespaces)),
                "name": .string(name.trimmingCharacters(in: .whitespaces)),
                "parentId": parentID.map(JSONValue.string) ?? .null,
            ]
            if let id = center?.recordID {
                body["isActive"] = .bool(isActive)
                try await OrgSettingsAPI.send(env, .patch, "cost-centers/\(id)", body: body)
            } else {
                try await OrgSettingsAPI.send(env, .post, "cost-centers", body: body)
            }
            env.toast.show(center == nil ? "Cost center created" : "Cost center saved")
            onDone()
        } content: {
            OrgSettingsSection(nil) {
                OrgSettingsField(label: "Code", text: $code, prompt: "e.g. SF-DESIGN", capitalization: .characters, mono: true, disabled: !canManage)
                OrgSettingsField(label: "Name", text: $name, prompt: "e.g. San Francisco studio", capitalization: .words, disabled: !canManage)
                OrgSettingsChoiceRow(label: "Parent", title: "Parent", choices: parents, selection: $parentID, allowsNone: true, disabled: !canManage)
                if center != nil {
                    OrgSettingsToggle(title: "Active", subtitle: "Inactive cost centers can't be picked on new lines", isOn: $isActive, disabled: !canManage)
                }
            }
            if canManage, let id = center?.recordID {
                OrgSettingsSection(nil) {
                    OrgSettingsButtonRow(title: "Delete cost center", symbol: "trash", destructive: true) { confirmDelete = true }
                }
                .confirmationDialog("Delete \(name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("Delete", role: .destructive) {
                        Task {
                            if await OrgSettingsRun.run(env, "Cost center deleted", { try await OrgSettingsAPI.send(env, .delete, "cost-centers/\(id)") }) {
                                onDone()
                                dismiss()
                            }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Lines already tagged keep it in past reports.")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
